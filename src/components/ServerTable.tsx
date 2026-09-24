import { lazy, Suspense, useState, type ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { groupsOf, monthUsage, type Node, type Site } from "@/lib/adapt"
import {
  bytes, compact, cpuName, CYCLES, daysUntil, distro, duration, flagUrl, FOREVER, money, osIconUrl, osName, pair, percent, rate, uptime,
} from "@/lib/format"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

const Latency = lazy(() => import("@/components/NodeDetail").then((m) => ({ default: m.Latency })))

export function Dot({ node, className }: { node: Node; className?: string }) {
  return (
    <span
      title={node.online ? "在线" : node.deployed ? "离线" : "未接入"}
      className={cn(
        "inline-block size-3 shrink-0 rounded-full align-middle",
        node.online ? "bg-(image:--dot-online)" : node.deployed ? "bg-(image:--dot-offline)" : "bg-muted-foreground/40",
        className,
      )}
    />
  )
}

export function Flag({ code, className }: { code: string; className?: string }) {
  if (!code) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("inline-flex items-center justify-center gap-1", className)}>
      <img
        src={flagUrl(code)}
        alt=""
        className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10"
        onError={(e) => { e.currentTarget.style.visibility = "hidden" }}
      />
      <span className="@max-3xl:hidden">{code}</span>
    </span>
  )
}

export function OsIcon({ os, className }: { os: string; className?: string }) {
  if (!os) return null
  return <img src={osIconUrl(os)} alt="" className={cn("size-3.5 shrink-0 object-contain", className)} />
}

function Bar({ pct, label }: { pct: number | null; label?: string }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  const tone = v >= 90 ? "bg-(image:--bar-danger)" : v >= 80 ? "bg-(image:--bar-warn)" : "bg-(image:--bar-ok)"
  return (
    <div className="relative h-5 overflow-hidden rounded bg-bar-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.1)] @max-3xl:h-4">
      <div className={cn("h-full rounded-l-[3px] transition-[width] duration-500", tone)} style={{ width: `${v}%` }} />
      <span className="tnum absolute inset-y-0 left-1.5 flex items-center text-[10px] leading-none text-bar-text @max-3xl:left-0.5 @max-3xl:text-[8px]">
        {label ?? (pct === null ? "—" : `${v.toFixed(1)}%`)}
      </span>
    </div>
  )
}

function Expiry({ node }: { node: Node }) {
  if (!node.show_expire) return <span className="text-muted-foreground">—</span>
  const days = daysUntil(node.expires_at)
  if (!node.expires_at || days === null) return <span className="text-muted-foreground" title="未设置到期">{FOREVER}</span>
  if (days < 0) return <span className="text-danger">已过期</span>
  return <span className={cn(days <= 7 && "text-warn")}>{days} 天</span>
}

const COL = {
  status: "w-14 @max-3xl:w-[6%]",
  name: "max-w-60 min-w-32 truncate @max-3xl:w-[14%] @max-3xl:max-w-none @max-3xl:min-w-0 @max-sm:w-[17%]",
  location: "w-20 @max-3xl:w-[7%] @max-sm:hidden",
  os: "min-w-24 @max-6xl:hidden",
  uptime: "min-w-18 @max-3xl:hidden",
  expiry: "min-w-18 @max-6xl:hidden",
  load: "w-16 @max-3xl:hidden",
  speed: "min-w-30 @max-3xl:w-[21%] @max-3xl:min-w-0",
  bar: "w-[7.5%] min-w-22 @max-3xl:w-[10%] @max-3xl:min-w-0 @max-sm:w-[11%]",
  traffic: "w-[7.5%] min-w-22 @max-3xl:w-[22%] @max-3xl:min-w-0 @max-sm:w-[23%]",
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5em_minmax(0,1fr)] gap-x-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum break-words">{children}</span>
    </div>
  )
}

function uptimeSeconds(node: Node): number | null {
  if (!node.boot_time) return null
  return Math.max(0, (Date.now() - node.boot_time) / 1000)
}

function Details({ node, site }: { node: Node; site: Site | null }) {
  if (!node.deployed) return <p className="px-4 py-3 text-muted-foreground">尚未接入。</p>
  const m = node.online ? node.metrics : null
  const usage = (used: number | null, total: number | null) => {
    const pct = percent(used, total)
    return `${pair(used, total)}${pct === null ? "" : `（${pct.toFixed(1)}%）`}`
  }
  const flow = (rx: number | null, tx: number | null) => `↓ ${bytes(rx)} · ↑ ${bytes(tx)}`
  const away = node.last_seen ? Date.now() - node.last_seen : 0
  const days = daysUntil(node.expires_at)

  return (
    <div className="space-y-3 px-4 pt-2 pb-3 text-[13px] leading-6 @max-3xl:px-2 @max-3xl:text-xs @max-3xl:leading-5">
      <div className="grid gap-x-8 @2xl:grid-cols-2 @5xl:grid-cols-3">
        <Line label="系统">
          <span className="inline-flex items-center gap-1.5 align-middle">
            <OsIcon os={node.os} />
            {[osName(node.os), node.kernel].filter(Boolean).join(" · ") || "—"}
          </span>
        </Line>
        <Line label="架构">{[node.arch, node.agent_version && `agent ${node.agent_version}`].filter(Boolean).join(" · ") || "—"}</Line>
        <Line label="CPU">
          {node.cpu_name ? `${cpuName(node.cpu_name)}${node.cpu_cores ? ` × ${node.cpu_cores}` : ""}` : node.cpu_cores ? `${node.cpu_cores} 核` : "—"}
          {m?.cpu !== null && m?.cpu !== undefined && `（${m.cpu.toFixed(1)}%）`}
        </Line>
        <Line label="内存">{m ? usage(m.mem_used, m.mem_total) : bytes(node.metrics?.mem_total ?? null)}</Line>
        <Line label="交换">
          {(m?.swap_total ?? 0) > 0 ? usage(m?.swap_used ?? null, m?.swap_total ?? null) : "未启用"}
        </Line>
        <Line label="硬盘">{m ? usage(m.disk_used, m.disk_total) : bytes(node.metrics?.disk_total ?? null)}</Line>
        <Line label="负载">{m ? m.load.map((n) => n === null ? "—" : n.toFixed(2)).join(" / ") : "—"}</Line>
        <Line label="进程 / 连接">{m ? `${m.procs ?? "—"} · TCP ${m.tcp ?? "—"} · UDP ${m.udp ?? "—"}` : "—"}</Line>
        <Line label="网速">{m ? `↓ ${rate(m.net_rx)} · ↑ ${rate(m.net_tx)}` : "—"}</Line>
        {node.show_traffic && <Line label="本月流量">{flow(node.month_rx, node.month_tx)}</Line>}
        {node.show_traffic && <Line label="总流量">{flow(node.total_rx, node.total_tx)}</Line>}
        <Line label={node.online ? "在线" : "离线"}>
          {node.online ? "在线" : away >= 60_000 ? uptime(away / 1000) : "刚刚"}
        </Line>
        {node.show_price && (
          <Line label="续费">
            {node.price !== null ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : "免费"}
          </Line>
        )}
        {node.show_expire && (
          <Line label="到期">
            {node.expires_at
              ? `${node.expires_at}（${days !== null && days < 0 ? `已过期 ${-days} 天` : `剩余 ${days ?? "—"} 天`}）`
              : "未设置"}
          </Line>
        )}
        {node.show_traffic && node.traffic_reset_day !== null && node.traffic_reset_day > 0 && (
          <Line label="流量重置">每月 {node.traffic_reset_day} 日重置</Line>
        )}
      </div>
      {node.show_probes && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">网络延迟 · 最近 24 小时</span>
            <Link href={`#/server/${encodeURIComponent(node.id)}`} className="text-primary hover:underline">查看资源图表 →</Link>
          </div>
          <Suspense fallback={<Skeleton className="h-[280px] @max-3xl:h-[220px]" />}>
            <Latency node={node} site={site} hours={24} className="h-[280px] @max-3xl:h-[220px]" />
          </Suspense>
        </div>
      )}
    </div>
  )
}

function Row({ node, index, site }: { node: Node; index: number; site: Site | null }) {
  const [open, setOpen] = useState(false)
  const m = node.online ? node.metrics : null
  const traffic = monthUsage(node)
  const shade = index % 2 ? "bg-muted" : ""
  const toggle = () => setOpen((o) => !o)
  const boot = node.last_seen && m ? uptimeSeconds(node) : null

  return (
    <>
      <TableRow
        aria-expanded={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        className={cn("cursor-pointer border-0 hover:bg-accent", shade)}
      >
        <TableCell className={COL.status}><Dot node={node} className="mx-auto block @max-3xl:size-2.5" /></TableCell>
        <TableCell className={COL.name} title={node.name}>{node.name}</TableCell>
        <TableCell className={COL.location}><Flag code={node.region} /></TableCell>
        <TableCell className={COL.os}>
          <span className="inline-flex items-center justify-center gap-1.5">
            <OsIcon os={node.os} />
            {distro(node.os) || "—"}
          </span>
        </TableCell>
        <TableCell className={COL.uptime}>{node.online && boot ? duration(boot) : "—"}</TableCell>
        <TableCell className={COL.expiry}><Expiry node={node} /></TableCell>
        <TableCell className={COL.load}>{m?.load[0] !== null && m?.load[0] !== undefined ? m.load[0].toFixed(2) : "—"}</TableCell>
        <TableCell className={COL.speed}>{m ? `${compact(m.net_rx)} | ${compact(m.net_tx)}` : "— | —"}</TableCell>
        <TableCell className={COL.bar}><Bar pct={m?.cpu ?? null} /></TableCell>
        <TableCell className={COL.bar}><Bar pct={m ? percent(m.mem_used, m.mem_total) : null} /></TableCell>
        <TableCell className={COL.bar}><Bar pct={m ? percent(m.disk_used, m.disk_total) : null} /></TableCell>
        <TableCell className={COL.traffic}>
          {node.show_traffic ? (
            <Bar
              pct={node.traffic_limit && traffic !== null ? percent(traffic, node.traffic_limit) : null}
              label={`${compact(traffic)} / ${node.traffic_limit ? compact(node.traffic_limit) : FOREVER}`}
            />
          ) : "—"}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className={cn("border-0 hover:bg-transparent", shade)}>
          <TableCell colSpan={12} className="h-auto! border-t-0! p-0! text-left whitespace-normal @max-3xl:w-full">
            <Details node={node} site={site} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function ServerTables({ nodes, site }: { nodes: Node[]; site: Site | null }) {
  const groups = groupsOf(nodes)
  if (groups.length === 0) return <ServerTable title="服务器" nodes={nodes} site={site} />
  const ungrouped = nodes.filter((n) => !n.group)
  return (
    <>
      {groups.map((g) => <ServerTable key={`=${g}`} title={g} nodes={nodes.filter((n) => n.group === g)} site={site} />)}
      {ungrouped.length > 0 && <ServerTable key="*" title="未分组" nodes={ungrouped} site={site} />}
    </>
  )
}

function ServerTable({ title, nodes, site }: { title: string; nodes: Node[]; site: Site | null }) {
  const online = nodes.filter((n) => n.online && n.metrics)
  const sum = (pick: (n: Node) => number | null) => online.reduce((total, n) => total + (pick(n) ?? 0), 0)
  const totalRx = nodes.reduce((total, n) => total + (n.total_rx ?? 0), 0)
  const totalTx = nodes.reduce((total, n) => total + (n.total_tx ?? 0), 0)
  const heads: [keyof typeof COL, ReactNode][] = [
    ["status", "状态"], ["name", "名称"], ["location", "位置"], ["os", "系统"], ["uptime", "在线"],
    ["expiry", "到期"], ["load", "负载"], ["speed", "网速 ↓|↑"],
    ["bar", "CPU"], ["bar", "内存"], ["bar", "硬盘"], ["traffic", "流量"],
  ]
  return (
    <section className="@container rounded-md border bg-card p-5 text-card-foreground shadow-sm max-md:p-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-3 gap-y-1 px-1 pb-3 max-md:pb-2 @max-3xl:grid-cols-1">
        <h2 className="min-w-0 truncate text-lg font-semibold max-md:text-sm" title={title}>{title}</h2>
        <div className="tnum flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground max-md:text-[10px]">
          <span className="whitespace-nowrap">
            在线 {nodes.filter((n) => n.online).length} / {nodes.length} · ↓ {compact(sum((n) => n.metrics?.net_rx ?? null))}/s · ↑ {compact(sum((n) => n.metrics?.net_tx ?? null))}/s
          </span>
          <span className="whitespace-nowrap">总流量 ↓ {bytes(totalRx)} · ↑ {bytes(totalTx)}</span>
        </div>
      </div>
      <Table className="text-center text-sm @max-3xl:text-[10px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            {heads.map(([col, label], i) => (
              <TableHead key={i} className={cn("h-8 border-t px-1.5 text-center font-semibold @max-3xl:px-0.5", COL[col])}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:h-[29px] [&_td]:border-t [&_td]:px-1.5 [&_td]:py-1 @max-3xl:[&_td]:px-0.5">
          {nodes.map((n, i) => <Row key={n.id} node={n} index={i} site={site} />)}
        </TableBody>
      </Table>
    </section>
  )
}
