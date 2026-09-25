import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Dot, Flag } from "@/components/ServerTable"
import { Skeleton } from "@/components/ui/skeleton"
import { adaptHistory, DEFAULT_PROBE_LABELS, PROBE_KEYS, type HistoryPoint, type Node, type Probe, type ProbeKey, type Site } from "@/lib/adapt"
import { axisBytes, axisTop, bytes, clockFor, cpuName, despike, quarters, rate, timeTicks, uptime } from "@/lib/format"
import { ApiError, request } from "@/lib/http"
import { cn } from "@/lib/utils"

const RANGES = [
  { hours: 0.167, label: "10 分钟" },
  { hours: 0.5, label: "30 分钟" },
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 12, label: "12 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 48, label: "2 天" },
  { hours: 96, label: "4 天" },
  { hours: 168, label: "7 天" },
]
const GUEST_HISTORY_HOURS = 24

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }
const SERIES = { dot: false as const, strokeWidth: 1.5, isAnimationActive: false, connectNulls: false as const }
const Y_WIDTH = 68
const PALETTE = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--color-chart-${i})`)
const TIP = {
  fontSize: 12,
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius)",
}

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="h-40 w-full text-muted-foreground">{children}</div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
    >
      {children}
    </button>
  )
}

function historyError(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 401) return "登录后才能查看超过 24 小时的历史"
  if (cause instanceof ApiError && cause.status === 409) return "监控端数据库还没升级，历史字段不完整"
  if (cause instanceof ApiError && cause.status === 503) return "历史服务暂时不可用"
  return cause instanceof Error ? (cause.message || "网络错误") : "网络错误"
}

function useHistory(node: Node | null, hours: number, enabled = true) {
  const id = node?.id ?? null
  const base = node?.base ?? null
  const [rows, setRows] = useState<HistoryPoint[] | null>(null)
  const [loaded, setLoaded] = useState("")
  const [failed, setFailed] = useState("")
  const [attempt, setAttempt] = useState(0)
  const key = id && base ? `${base}\n${id}\n${hours}\n${attempt}` : ""
  useEffect(() => {
    if (!enabled || !id || !base) return
    let active = true
    request(base, `/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`)
      .then((payload) => {
        if (!active) return
        setRows(adaptHistory(payload))
        setFailed("")
        setLoaded(key)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setFailed(historyError(cause))
        setRows([])
        setLoaded(key)
      })
    return () => { active = false }
  }, [enabled, id, base, hours, attempt, key])
  return { rows: loaded === key ? rows : null, failed: loaded === key ? failed : "", retry: () => setAttempt((n) => n + 1) }
}

function timeAxis(rows: { ts: number }[], hours: number, from = 0, to = rows.length - 1) {
  const start = rows[Math.min(from, rows.length - 1)]?.ts ?? 0
  const end = rows[Math.min(to, rows.length - 1)]?.ts ?? 0
  return {
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    ticks: rows.length ? timeTicks(start, end) : undefined,
    tickFormatter: clockFor(hours),
    minTickGap: hours > 24 ? 72 : 40,
    ...AXIS,
  }
}

function valueOf(value: Probe): number | null {
  return typeof value === "number" ? value : null
}

function lossText(value: number): string {
  return value > 0 && value < 0.1 ? "<0.1" : value.toFixed(1)
}

function despikeWindow(points: { ts: number }[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].ts - points[i - 1].ts)
  return Math.min(15, Math.max(3, Math.round(420_000 / step) | 1))
}

export function Latency({ node, site, hours, tall }: { node: Node; site: Site | null; hours: number; tall?: boolean }) {
  const remote = useHistory(node, hours)
  const rows = remote.rows
  const failed = remote.failed
  const retry = remote.retry
  const [hidden, setHidden] = useState<ProbeKey[]>([])
  const [smooth, setSmooth] = useState(false)
  const [zoom, setZoom] = useState<{ of: HistoryPoint[]; range: [number, number] } | null>(null)
  const labels = site?.probe_labels
  const series = useMemo(
    () => PROBE_KEYS
      .map((key) => {
        const points = (rows ?? []).filter((row) => row.probes[key] !== false)
        const losses = points.map((point) => valueOf(point.loss[key])).filter((value): value is number => value !== null)
        const loss = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null
        return { key, name: labels?.[key] || DEFAULT_PROBE_LABELS[key], points, loss }
      })
      .filter((item) => item.points.length > 0),
    [rows, labels],
  )
  const shown = series.filter((item) => !hidden.includes(item.key))
  const chartRows = useMemo(() => {
    const map = new Map<number, Record<string, number | null>>()
    const window = despikeWindow(rows ?? [])
    for (const item of shown) {
      const values = item.points.map((point) => valueOf(point.probes[item.key]))
      const smoothed = despike(values, window)
      item.points.forEach((point, index) => {
        const row = map.get(point.ts) ?? { ts: point.ts }
        row[item.key] = values[index]
        row[`s${item.key}`] = smoothed[index]
        row[`l${item.key}`] = valueOf(point.loss[item.key])
        map.set(point.ts, row)
      })
    }
    return [...map.values()].sort((a, b) => Number(a.ts) - Number(b.ts))
  }, [shown, rows])

  if (!rows) return <Skeleton className={tall ? "h-[310px] @max-3xl:h-[250px]" : "h-[190px]"} />
  if (failed) return <p className="py-6 text-center text-sm text-destructive" role="alert">读取延迟失败：{failed}<button onClick={retry} className="ml-2 text-primary hover:underline">重试</button></p>
  if (!series.length) return <p className="py-6 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
  const last = chartRows.length - 1
  const span = zoom?.of === rows ? zoom.range.map((index) => Math.min(Math.max(index, 0), last)) as [number, number] : [0, last]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {series.map((item, index) => {
          const on = !hidden.includes(item.key)
          const color = PALETTE[index % PALETTE.length]
          return (
            <button
              key={item.key}
              onClick={() => setHidden((list) => on ? [...list, item.key] : list.filter((key) => key !== item.key))}
              className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity", on ? "" : "opacity-40")}
            >
              <svg width="14" height="6" className="shrink-0" aria-hidden>
                <line x1="0" y1="3" x2="14" y2="3" stroke={color} strokeWidth="2" />
              </svg>
              {item.name}
              {item.loss !== null && <span className="tnum opacity-60">{lossText(item.loss)}%</span>}
            </button>
          )
        })}
        <button
          onClick={() => setSmooth((value) => !value)}
          aria-pressed={smooth}
          title="把孤立的异常值换成邻近若干点的中位数，持续的变化保持原样"
          className={cn("rounded-md border px-2 py-1 text-xs transition-opacity", smooth ? "" : "opacity-40")}
        >
          削峰
        </button>
      </div>
      <div className={cn("w-full", tall ? "h-[310px] @max-3xl:h-[250px]" : "h-[190px]")}>
        <ResponsiveContainer>
          <ComposedChart data={chartRows}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis {...timeAxis(chartRows as { ts: number }[], hours, span[0], span[1])} />
            <YAxis width={Y_WIDTH} unit="ms" domain={["auto", "auto"]} {...AXIS} />
            <Tooltip
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
              formatter={(v, _name, item) => {
                const loss = Number(item?.payload?.[`l${String(item.dataKey ?? "").replace(/^s/, "")}`] ?? 0)
                return [v === null ? "超时" : `${Math.round(Number(v))} ms${loss > 0 ? ` · 丢 ${lossText(loss)}%` : ""}`, String(item?.name ?? "")]
              }}
              contentStyle={TIP}
            />
            {shown.map((item) => (
              <Line key={item.key} dataKey={smooth ? `s${item.key}` : item.key} name={item.name} stroke={PALETTE[series.findIndex((s) => s.key === item.key) % PALETTE.length]} {...SERIES} />
            ))}
            <Brush
              dataKey="ts"
              height={22}
              travellerWidth={8}
              tickFormatter={clockFor(hours)}
              fill="var(--color-muted)"
              stroke="var(--color-muted-foreground)"
              startIndex={span[0]}
              endIndex={span[1]}
              onChange={(range) => {
                if (!rows) return
                setZoom({ of: rows, range: [range.startIndex ?? 0, range.endIndex ?? last] })
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function NodeDetail({ node, site }: { node: Node; site: Site | null }) {
  const [hours, setHours] = useState(6)
  const { rows, failed, retry } = useHistory(node, hours)
  const m = node.metrics
  const away = node.last_seen ? (Date.now() - node.last_seen) / 1000 : 0
  const tops = useMemo(() => {
    const max = (pick: (row: HistoryPoint) => number | null) => (rows ?? []).reduce((hi, row) => Math.max(hi, pick(row) ?? 0), 0)
    return {
      cpu: axisTop(max((row) => row.cpu), 4, 10, 100),
      load: axisTop(max((row) => row.load), 1),
      rate: axisTop(max((row) => Math.max(row.net_rx ?? 0, row.net_tx ?? 0)), 1024, 1024),
    }
  }, [rows])
  const memTop = m?.mem_total ?? axisTop((rows ?? []).reduce((hi, row) => Math.max(hi, row.mem_used ?? 0), 0), 1024 * 1024, 1024)
  const diskTop = m?.disk_total ?? axisTop((rows ?? []).reduce((hi, row) => Math.max(hi, row.disk_used ?? 0), 0), 1024 * 1024, 1024)

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Dot node={node} />
        <h2 className="truncate text-lg font-semibold">{node.name}</h2>
        <Flag code={node.region} className="text-sm" />
        <span className="tnum text-xs text-muted-foreground">
          {node.online
            ? `在线${node.boot_time ? ` ${uptime(Math.max(0, (Date.now() - node.boot_time) / 1000))}` : ""}`
            : node.deployed ? `离线 ${away >= 60 ? uptime(away) : ""}` : "未接入"}
        </span>
        {node.cpu_name && <span className="text-xs text-muted-foreground">{cpuName(node.cpu_name)}</span>}
        {node.agent_version && <span className="text-xs text-muted-foreground">agent {node.agent_version}</span>}
      </div>
      <div className="flex gap-1 border-t pt-4">
        {RANGES.map((range) => (
          <Tab key={range.hours} active={hours === range.hours} onClick={() => setHours(range.hours)}>{range.label}</Tab>
        ))}
        {hours > GUEST_HISTORY_HOURS && <span className="self-center text-xs text-muted-foreground">超过 24 小时需要登录</span>}
      </div>
      {!rows ? <Skeleton className="h-40 w-full" /> : failed ? (
        <p className="py-8 text-center text-sm text-destructive" role="alert">读取历史数据失败：{failed}<button onClick={retry} className="ml-2 text-primary hover:underline">重试</button></p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有历史数据</p>
      ) : (
        <div className="space-y-5">
          <Panel title="CPU">
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(rows, hours)} />
                <YAxis domain={[0, tops.cpu]} ticks={quarters(tops.cpu)} unit="%" width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => v === null ? ["—", "CPU"] : [`${Number(v).toFixed(1)}%`, "CPU"]} contentStyle={TIP} />
                <Area dataKey="cpu" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="负载">
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(rows, hours)} />
                <YAxis domain={[0, tops.load]} ticks={quarters(tops.load)} width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => [v === null ? "—" : Number(v).toFixed(2), "负载"]} contentStyle={TIP} />
                <Area dataKey="load" name="负载" stroke="var(--color-chart-5)" fill="var(--color-chart-5)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title={`内存${m?.mem_total ? ` · ${bytes(m.mem_total)}` : ""}`}>
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(rows, hours)} />
                <YAxis domain={[0, memTop]} ticks={quarters(memTop)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => bytes(v === null ? null : Number(v))} contentStyle={TIP} />
                <Area dataKey="mem_used" name="内存" stroke="var(--color-chart-4)" fill="var(--color-chart-4)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title={<>网络速率<span className="ml-3 text-chart-2">● 下行</span><span className="ml-2 text-chart-3">● 上行</span></>}>
            <ResponsiveContainer>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(rows, hours)} />
                <YAxis domain={[0, tops.rate]} ticks={quarters(tops.rate)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => rate(v === null ? null : Number(v))} contentStyle={TIP} />
                <Line dataKey="net_rx" name="下行" stroke="var(--color-chart-2)" {...SERIES} />
                <Line dataKey="net_tx" name="上行" stroke="var(--color-chart-3)" {...SERIES} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title={`硬盘${m?.disk_total ? ` · ${bytes(m.disk_total)}` : ""}`}>
            <ResponsiveContainer>
              <AreaChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(rows, hours)} />
                <YAxis domain={[0, diskTop]} ticks={quarters(diskTop)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => bytes(v === null ? null : Number(v))} contentStyle={TIP} />
                <Area dataKey="disk_used" name="硬盘" stroke="var(--color-chart-5)" fill="var(--color-chart-5)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">延迟</h4>
            <Latency node={node} site={site} hours={hours} />
          </div>
        </div>
      )}
    </div>
  )
}
