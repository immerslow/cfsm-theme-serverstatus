export type Probe = number | null | false

export type ProbeKey = "ct" | "cu" | "cm" | "bd" | "node_1" | "node_2" | "node_3" | "node_4"

export const PROBE_KEYS: ProbeKey[] = ["ct", "cu", "cm", "bd", "node_1", "node_2", "node_3", "node_4"]

export const DEFAULT_PROBE_LABELS: Record<ProbeKey, string> = {
  ct: "电信",
  cu: "联通",
  cm: "移动",
  bd: "BGP",
  node_1: "Node 1",
  node_2: "Node 2",
  node_3: "Node 3",
  node_4: "Node 4",
}

export type Metrics = {
  cpu: number | null
  load: [number | null, number | null, number | null]
  mem_total: number | null
  mem_used: number | null
  swap_total: number | null
  swap_used: number | null
  disk_total: number | null
  disk_used: number | null
  net_rx: number | null
  net_tx: number | null
  tcp: number | null
  udp: number | null
  procs: number | null
}

export type Node = {
  id: string
  base: string
  name: string
  sort: number
  group: string
  region: string
  online: boolean
  deployed: boolean
  last_seen: number | null
  boot_time: number | null
  os: string
  kernel: string
  arch: string
  cpu_name: string
  cpu_cores: number | null
  agent_version: string
  report_interval: number | null
  price: number | null
  currency: string
  billing_cycle: string
  expires_at: string | null
  traffic_limit: number | null
  traffic_mode: string
  traffic_reset_day: number | null
  total_rx: number | null
  total_tx: number | null
  month_rx: number | null
  month_tx: number | null
  metrics: Metrics | null
  ping: Record<ProbeKey, Probe>
  loss: Record<ProbeKey, Probe>
  show_price: boolean
  show_expire: boolean
  show_traffic: boolean
  show_probes: boolean
}

export type Site = {
  base: string
  title: string
  version: string
  is_public: boolean
  authorization: boolean
  turnstile_enabled: boolean
  turnstile_site_key: string
  probe_labels: Record<ProbeKey, string>
  ws_timeout_minutes: number
  theme_options: Record<string, unknown>
}

export type HistoryPoint = {
  ts: number
  cpu: number | null
  load: number | null
  mem_used: number | null
  disk_used: number | null
  net_rx: number | null
  net_tx: number | null
  month_rx: number | null
  month_tx: number | null
  probes: Record<ProbeKey, Probe>
  loss: Record<ProbeKey, Probe>
}

const ONLINE_MS = 5 * 60 * 1000
const MIB = 1024 * 1024

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function nonneg(value: unknown): number | null {
  const n = num(value)
  return n !== null && n >= 0 ? n : null
}

/** `false` 未配置，`null` 超时，数字是有效读数。缺字段按未配置处理。 */
export function probe(value: unknown): Probe {
  if (value === false || value === undefined) return false
  if (value === null) return null
  const n = num(value)
  return n !== null && n >= 0 ? n : false
}

function probes(input: Record<string, unknown>, prefix: "ping" | "loss"): Record<ProbeKey, Probe> {
  return Object.fromEntries(PROBE_KEYS.map((key) => [key, probe(input[`${prefix}_${key}`])])) as Record<ProbeKey, Probe>
}

function loads(value: unknown): [number | null, number | null, number | null] {
  const parts = (str(value) ?? "").split(/\s+/).map(num)
  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null]
}

const TRAFFIC_POWER: Record<string, number> = { b: 0, kb: 1, kib: 1, mb: 2, mib: 2, gb: 3, gib: 3, tb: 4, tib: 4 }

/** CFSM 流量配额是 GB 数字。空白、0、-1 都视为不限额。 */
export function trafficBytes(value: unknown): number | null {
  const text = str(value)
  if (!text || text === "0" || text === "-1") return null
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2]?.toLowerCase()
  return amount * (unit ? 1024 ** TRAFFIC_POWER[unit] : 1024 ** 3)
}

function priceOf(value: unknown): number | null {
  const text = str(value)
  if (!text || text === "0" || text === "-1") return null
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? n : null
}

function onlineOf(input: Record<string, unknown>, now: number): boolean {
  if (typeof input.is_online === "boolean") return input.is_online
  const seen = num(input.last_updated) ?? num(input.timestamp)
  return seen !== null && now - seen <= ONLINE_MS
}

function metricsOf(input: Record<string, unknown>): Metrics | null {
  const cpu = num(input.cpu)
  const mem = nonneg(input.ram_total)
  const disk = nonneg(input.disk_total)
  if (cpu === null && mem === null && disk === null) return null
  const load = loads(input.load_avg)
  return {
    cpu,
    load,
    mem_total: mem === null ? null : mem * MIB,
    mem_used: nonneg(input.ram_used) === null ? null : nonneg(input.ram_used)! * MIB,
    swap_total: nonneg(input.swap_total) === null ? null : nonneg(input.swap_total)! * MIB,
    swap_used: nonneg(input.swap_used) === null ? null : nonneg(input.swap_used)! * MIB,
    disk_total: disk === null ? null : disk * MIB,
    disk_used: nonneg(input.disk_used) === null ? null : nonneg(input.disk_used)! * MIB,
    net_rx: nonneg(input.net_in_speed),
    net_tx: nonneg(input.net_out_speed),
    tcp: nonneg(input.tcp_conn),
    udp: nonneg(input.udp_conn),
    procs: nonneg(input.processes),
  }
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

export function adaptNode(value: unknown, base: string, site: { show_price?: boolean; show_expire?: boolean; show_traffic?: boolean; show_probes?: boolean } = {}, now = Date.now()): Node | null {
  const input = rec(value)
  const id = input && str(input.id)
  if (!input || !id) return null
  const own = rec(input.sysConfig) ?? {}
  const metrics = metricsOf(input)
  const cores = nonneg(input.cpu_cores)
  const mem = nonneg(input.ram_total)
  return {
    id,
    base,
    name: str(input.name) ?? id,
    sort: num(input.sort_order) ?? 0,
    group: str(input.server_group) ?? "",
    region: str(input.region) ?? "",
    online: onlineOf(input, now),
    deployed: (cores ?? 0) > 0 || (mem ?? 0) > 0,
    last_seen: num(input.last_updated) ?? num(input.timestamp),
    boot_time: num(input.boot_time),
    os: str(input.os) ?? "",
    kernel: str(input.kernel_version) ?? "",
    arch: str(input.arch) ?? "",
    cpu_name: str(input.cpu_info) ?? "",
    cpu_cores: cores,
    agent_version: str(input.agent_version) ?? "",
    report_interval: nonneg(input.wss_report_interval),
    price: priceOf(input.price),
    currency: str(input.currency) ?? "",
    billing_cycle: str(input.billing_cycle) ?? "",
    expires_at: str(input.expire_date),
    traffic_limit: trafficBytes(input.traffic_limit),
    traffic_mode: (str(input.traffic_calc_type) ?? "total").toLowerCase(),
    traffic_reset_day: nonneg(input.reset_day),
    total_rx: nonneg(input.net_rx),
    total_tx: nonneg(input.net_tx),
    month_rx: nonneg(input.net_rx_monthly),
    month_tx: nonneg(input.net_tx_monthly),
    metrics,
    ping: probes(input, "ping"),
    loss: probes(input, "loss"),
    show_price: boolOf(own.show_price, site.show_price ?? true),
    show_expire: boolOf(own.show_expire, site.show_expire ?? true),
    show_traffic: boolOf(own.show_tf, site.show_traffic ?? true),
    show_probes: boolOf(own.show_three_net_details, site.show_probes ?? false),
  }
}

export function adaptList(value: unknown, base: string, now = Date.now()): Node[] {
  const input = rec(value)
  if (!input || !Array.isArray(input.servers)) return []
  const sys = rec(input.sysConfig) ?? {}
  const site = {
    show_price: boolOf(sys.show_price, true),
    show_expire: boolOf(sys.show_expire, true),
    show_traffic: boolOf(sys.show_tf, true),
    show_probes: boolOf(sys.show_three_net_details, false),
  }
  return input.servers.flatMap((item) => {
    const node = adaptNode(item, base, site, now)
    return node ? [node] : []
  })
}

export function adaptSite(value: unknown, base: string): Site {
  const input = rec(value) ?? {}
  const labels = { ...DEFAULT_PROBE_LABELS }
  const custom: [ProbeKey, string][] = [
    ["ct", "custom_ct_name"], ["cu", "custom_cu_name"], ["cm", "custom_cm_name"], ["bd", "custom_bd_name"],
  ]
  for (const [key, field] of custom) {
    const name = str(input[field])
    if (name) labels[key] = name
  }
  for (const key of ["node_1", "node_2", "node_3", "node_4"] as const) {
    const name = str(input[`${key}_name`])
    if (name) labels[key] = name
  }
  return {
    base,
    title: str(input.site_title) ?? "ServerStatus",
    version: str(input.version) ?? "",
    is_public: input.is_public !== false,
    authorization: input.authorization === true,
    turnstile_enabled: input.turnstile_enabled === true,
    turnstile_site_key: str(input.turnstile_site_key) ?? "",
    probe_labels: labels,
    ws_timeout_minutes: Math.max(0, Math.min(1440, num(input.frontend_ws_timeout_minutes) ?? 0)),
    theme_options: rec(input.theme_options) ?? {},
  }
}

function sampleData(sample: Record<string, unknown>): Record<string, unknown> | null {
  return rec(sample.data) ?? rec(sample.payload) ?? rec(sample.metrics)
}

export type Sample = { id: string; ts: number | null; data: Record<string, unknown> }

export function adaptBatch(value: unknown): Sample[] {
  const input = rec(value)
  if (!input || input.type !== "batchUpdate" || !Array.isArray(input.updates)) return []
  return input.updates.flatMap((update) => {
    const row = rec(update)
    const id = row && str(row.serverId)
    if (!row || !id || !Array.isArray(row.samples)) return []
    return row.samples.flatMap((sample) => {
      const item = rec(sample)
      const data = item && sampleData(item)
      if (!item || !data) return []
      return [{ id, ts: num(item.ts), data }]
    })
  })
}

/** 同一轮分节点消息收齐后一次应用。间隔取最快上报周期的一半，限制在 250～1000ms。 */
export function settleDelay(intervals: readonly (number | null)[]): number {
  const seconds = intervals.filter((value): value is number => value !== null && value > 0)
  if (!seconds.length) return 1_000
  return Math.min(1_000, Math.max(250, Math.min(...seconds) * 500))
}

/** 只覆盖样本里真正出现的字段，未知节点不凭空创建。 */
export function mergeSample(node: Node, sample: Sample, now = Date.now()): Node {
  if (node.id !== sample.id) return node
  const patch = adaptNode({ ...sample.data, id: node.id }, node.base, {}, now)
  if (!patch) return { ...node, online: true, last_seen: now }
  const data = sample.data
  const metrics = node.metrics && patch.metrics
    ? {
        cpu: "cpu" in data ? patch.metrics.cpu : node.metrics.cpu,
        load: "load_avg" in data ? patch.metrics.load : node.metrics.load,
        mem_total: "ram_total" in data ? patch.metrics.mem_total : node.metrics.mem_total,
        mem_used: "ram_used" in data ? patch.metrics.mem_used : node.metrics.mem_used,
        swap_total: "swap_total" in data ? patch.metrics.swap_total : node.metrics.swap_total,
        swap_used: "swap_used" in data ? patch.metrics.swap_used : node.metrics.swap_used,
        disk_total: "disk_total" in data ? patch.metrics.disk_total : node.metrics.disk_total,
        disk_used: "disk_used" in data ? patch.metrics.disk_used : node.metrics.disk_used,
        net_rx: "net_in_speed" in data ? patch.metrics.net_rx : node.metrics.net_rx,
        net_tx: "net_out_speed" in data ? patch.metrics.net_tx : node.metrics.net_tx,
        tcp: "tcp_conn" in data ? patch.metrics.tcp : node.metrics.tcp,
        udp: "udp_conn" in data ? patch.metrics.udp : node.metrics.udp,
        procs: "processes" in data ? patch.metrics.procs : node.metrics.procs,
      }
    : patch.metrics ?? node.metrics
  return {
    ...node,
    online: true,
    last_seen: now,
    boot_time: "boot_time" in data ? patch.boot_time : node.boot_time,
    metrics,
    os: "os" in data ? patch.os : node.os,
    kernel: "kernel_version" in data ? patch.kernel : node.kernel,
    arch: "arch" in data ? patch.arch : node.arch,
    cpu_name: "cpu_info" in data ? patch.cpu_name : node.cpu_name,
    cpu_cores: "cpu_cores" in data ? patch.cpu_cores : node.cpu_cores,
    report_interval: "wss_report_interval" in data ? patch.report_interval : node.report_interval,
    total_rx: "net_rx" in data ? patch.total_rx : node.total_rx,
    total_tx: "net_tx" in data ? patch.total_tx : node.total_tx,
    month_rx: "net_rx_monthly" in data ? patch.month_rx : node.month_rx,
    month_tx: "net_tx_monthly" in data ? patch.month_tx : node.month_tx,
    ping: PROBE_KEYS.some((key) => `ping_${key}` in data) ? patch.ping : node.ping,
    loss: PROBE_KEYS.some((key) => `loss_${key}` in data) ? patch.loss : node.loss,
    deployed: node.deployed || patch.deployed,
  }
}

export function adaptHistory(value: unknown): HistoryPoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    const input = rec(row)
    const ts = input && num(input.timestamp)
    if (!input || ts === null) return []
    const load = loads(input.load_avg)
    const mem = nonneg(input.ram_used)
    const disk = nonneg(input.disk_used)
    return [{
      ts,
      cpu: num(input.cpu),
      load: load[0],
      mem_used: mem === null ? null : mem * MIB,
      disk_used: disk === null ? null : disk * MIB,
      net_rx: nonneg(input.net_in_speed),
      net_tx: nonneg(input.net_out_speed),
      month_rx: nonneg(input.net_rx),
      month_tx: nonneg(input.net_tx),
      probes: probes(input, "ping"),
      loss: probes(input, "loss"),
    }]
  }).sort((a, b) => a.ts - b.ts)
}

export function monthUsage(node: Pick<Node, "month_rx" | "month_tx" | "traffic_mode">): number | null {
  const rx = node.month_rx
  const tx = node.month_tx
  if (node.traffic_mode === "dl" || node.traffic_mode === "down") return rx
  if (node.traffic_mode === "ul" || node.traffic_mode === "up") return tx
  if (rx === null || tx === null) return null
  if (node.traffic_mode === "max") return Math.max(rx, tx)
  return rx + tx
}

export function groupsOf(nodes: Pick<Node, "group">[]): string[] {
  return [...new Set(nodes.map((n) => n.group).filter(Boolean))]
}
