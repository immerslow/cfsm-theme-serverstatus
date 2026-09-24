import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Dot, Flag } from "@/components/ServerTable"
import { Skeleton } from "@/components/ui/skeleton"
import { adaptHistory, PROBE_KEYS, type HistoryPoint, type Node, type ProbeKey, type Site } from "@/lib/adapt"
import { axisBytes, axisTop, bytes, clockFor, cpuName, despike, quarters, rate, timeTicks, uptime } from "@/lib/format"
import { request } from "@/lib/http"

const RANGES = [
  { hours: 0.167, label: "10 分钟" },
  { hours: 0.5, label: "30 分钟" },
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
]

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

function useHistory(node: Node | null, hours: number) {
  const id = node?.id ?? null
  const base = node?.base ?? null
  const [rows, setRows] = useState<HistoryPoint[] | null>(null)
  const [loaded, setLoaded] = useState("")
  const [failed, setFailed] = useState("")
  const [attempt, setAttempt] = useState(0)
  const key = id && base ? `${base}\n${id}\n${hours}\n${attempt}` : ""
  useEffect(() => {
    if (!id || !base) return
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
        setFailed(cause instanceof Error ? (cause.message || "网络错误") : "网络错误")
        setRows([])
        setLoaded(key)
      })
    return () => { active = false }
  }, [id, base, hours, attempt, key])
  return { rows: loaded === key ? rows : null, failed: loaded === key ? failed : "", retry: () => setAttempt((n) => n + 1) }
}

function timeAxis(rows: { ts: number }[], hours: number) {
  const from = rows[0]?.ts ?? 0
  const to = rows[rows.length - 1]?.ts ?? 0
  return {
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    ticks: rows.length ? timeTicks(from, to) : undefined,
    tickFormatter: clockFor(hours),
    minTickGap: hours > 24 ? 72 : 40,
    ...AXIS,
  }
}

function valueOf(point: HistoryPoint, key: ProbeKey, kind: "probes" | "loss"): number | null {
  const value = point[kind][key]
  return typeof value === "number" ? value : null
}

function despikeWindow(points: { ts: number }[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].ts - points[i - 1].ts)
  return Math.min(15, Math.max(3, Math.round(420_000 / step) | 1))
}

export function Latency({ node, site, hours, className }: { node: Node; site: Site | null; hours: number; className?: string }) {
  const { rows, failed, retry } = useHistory(node, hours)
  const [hidden, setHidden] = useState<ProbeKey[]>([])
  const [smooth, setSmooth] = useState(false)
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const labels = site?.probe_labels
  const series = useMemo(
    () => PROBE_KEYS
      .map((key) => ({ key, name: labels?.[key] ?? key, points: (rows ?? []).filter((row) => row.probes[key] !== false) }))
      .filter((item) => item.points.length > 0),
    [rows, labels],
  )
  const shown = series.filter((item) => !hidden.includes(item.key))
  const chartRows = useMemo(() => {
    const map = new Map<number, Record<string, number | null>>()
    const window = despikeWindow(rows ?? [])
    for (const item of series) {
      const values = item.points.map((point) => valueOf(point, item.key, "probes"))
      const smoothed = despike(values, window)
      item.points.forEach((point, index) => {
        const row = map.get(point.ts) ?? { ts: point.ts }
        row[item.key] = values[index]
        row[`s${item.key}`] = smoothed[index]
        map.set(point.ts, row)
      })
    }
    return [...map.values()].sort((a, b) => Number(a.ts) - Number(b.ts))
  }, [series, rows])

  if (!rows) return <Skeleton className={className ?? "h-40"} />
  if (failed) return <p className="py-6 text-center text-sm text-destructive" role="alert">读取延迟失败：{failed}<button onClick={retry} className="ml-2 text-primary hover:underline">重试</button></p>
  if (!series.length) return <p className="py-6 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
        <button onClick={() => setSmooth((value) => !value)} className={`rounded-full px-2 py-0.5 text-[11px] ${smooth ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>去尖峰</button>
        {series.map((item, index) => (
          <button
            key={item.key}
            onClick={() => setHidden((list) => list.includes(item.key) ? list.filter((key) => key !== item.key) : [...list, item.key])}
            className={`rounded-full px-2 py-0.5 text-[11px] ${hidden.includes(item.key) ? "text-muted-foreground line-through" : ""}`}
            style={{ color: hidden.includes(item.key) ? undefined : PALETTE[index % PALETTE.length] }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <ResponsiveContainer>
        <ComposedChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis {...timeAxis(chartRows as { ts: number }[], hours)} />
          <YAxis width={Y_WIDTH} unit="ms" domain={["auto", "auto"]} {...AXIS} />
          <Tooltip labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")} formatter={(v) => v === null ? ["超时", ""] : [`${Math.round(Number(v))} ms`, ""]} contentStyle={TIP} />
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
            startIndex={zoom?.[0]}
            endIndex={zoom?.[1]}
            onChange={(range) => setZoom([range.startIndex ?? 0, range.endIndex ?? chartRows.length - 1])}
          />
        </ComposedChart>
      </ResponsiveContainer>
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
          {node.online ? "在线" : node.deployed ? `离线 ${away >= 60 ? uptime(away) : ""}` : "未接入"}
        </span>
        {node.cpu_name && <span className="text-xs text-muted-foreground">{cpuName(node.cpu_name)}</span>}
        {node.agent_version && <span className="text-xs text-muted-foreground">agent {node.agent_version}</span>}
      </div>
      <div className="flex gap-1 border-t pt-4">
        {RANGES.map((range) => (
          <Tab key={range.hours} active={hours === range.hours} onClick={() => setHours(range.hours)}>{range.label}</Tab>
        ))}
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
          <Panel title="延迟">
            <Latency node={node} site={site} hours={hours} className="h-40" />
          </Panel>
        </div>
      )}
    </div>
  )
}
