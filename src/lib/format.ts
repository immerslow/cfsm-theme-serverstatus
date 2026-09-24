const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

const unitOf = (n: number) => Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1)

export function bytes(n: number | null, digits?: number): string {
  if (n === null || !Number.isFinite(n) || n < 1) return n === null ? "—" : "0 B"
  const i = unitOf(n)
  const v = n / 1024 ** i
  return `${v.toFixed(i === 0 ? 0 : (digits ?? (v >= 100 ? 0 : v >= 10 ? 1 : 2)))} ${UNITS[i]}`
}

export function pair(used: number | null, total: number | null): string {
  if (used === null || total === null) return "—"
  if (used > 0 && total > 0 && unitOf(used) === unitOf(total)) {
    const i = unitOf(total)
    const f = (n: number) => (n / 1024 ** i).toFixed(i === 0 ? 0 : 2)
    return `${f(used)} / ${f(total)} ${UNITS[i]}`
  }
  return `${bytes(used)} / ${bytes(total)}`
}

export function axisBytes(v: number): string {
  if (!v || v < 0) return "0 B"
  const unit = Math.min(Math.floor(Math.log(v) / Math.log(1024)), 5)
  return bytes(v, v / 1024 ** unit >= 100 ? 0 : 1).replace(".0 ", " ")
}

export function rate(n: number | null): string {
  return n === null ? "—" : `${bytes(n, 1)}/s`
}

export function compact(n: number | null): string {
  if (n === null) return "—"
  if (!n || n < 1) return "0B"
  const i = unitOf(n)
  const v = n / 1024 ** i
  return `${Number(v.toFixed(i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2))}${UNITS[i][0]}`
}

export function distro(os: string): string {
  const name = os.trim().split(/\s+/)[0] ?? ""
  const version = os.match(/\d+(?:\.\d+)?/)?.[0]
  return version ? `${name} ${version}` : name
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s >= 86400) return `${Math.floor(s / 86400)} 天`
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function percent(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null
  return Math.min(100, (used / total) * 100)
}

export function uptime(seconds: number | null): string {
  if (!seconds) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d} 天 ${h} 小时` : h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`
}

export function daysUntil(date?: string | null, now = Date.now()): number | null {
  if (!date) return null
  const target = new Date(`${date}T00:00:00`).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - now) / 86400000)
}

export const FOREVER = "∞"

const SYMBOLS: Record<string, string> = { USD: "$", CNY: "¥", EUR: "€", GBP: "£", JPY: "¥", "¥": "¥", "$": "$", "€": "€" }

export function money(amount: number, currency: string): string {
  const symbol = SYMBOLS[currency]
  if (symbol && symbol === currency) return `${symbol}${amount.toFixed(2)}`
  return `${symbol ?? ""}${amount.toFixed(2)}${symbol ? "" : currency ? ` ${currency}` : ""}`
}

export const CYCLES: Record<string, string> = {
  month: "月付",
  monthly: "月付",
  quarter: "季付",
  quarterly: "季付",
  half_year: "半年付",
  semiannual: "半年付",
  year: "年付",
  yearly: "年付",
  two_year: "两年付",
  biennial: "两年付",
  three_year: "三年付",
  triennial: "三年付",
  once: "一次性",
  onetime: "一次性",
}

const HHMMSS = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const HHMM = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" })
const MDHHMM = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })

export function clockFor(hours: number): (ms: number) => string {
  if (hours < 1) return (ms) => HHMMSS.format(ms)
  return hours <= 24 ? (ms) => HHMM.format(ms) : (ms) => MDHHMM.format(ms)
}

export function osName(name: string): string {
  return name.replace("GNU/Linux ", "").replace(/\s*\([^)]*\)\s*$/, "")
}

export function cpuName(name: string): string {
  return name
    .replace(/\((R|TM|r|tm)\)/g, "")
    .replace(/\s+(CPU|Processor)\b/g, "")
    .replace(/\s+\d+-Core\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const TICK_STEPS = [1 / 6, 1 / 2, 1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * 60_000)

export function timeTicks(from: number, to: number, count = 8): number[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= count) ?? TICK_STEPS[TICK_STEPS.length - 1]
  const zone = new Date(from).getTimezoneOffset() * 60_000
  const ticks: number[] = []
  for (let t = Math.ceil((from - zone) / step) * step + zone; t <= to; t += step) ticks.push(t)
  return ticks
}

const LADDER: Record<number, number[]> = {
  10: [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10],
  1024: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
}

export function axisTop(max: number, floor: number, base = 10, cap = Infinity): number {
  const target = Math.min(cap, Math.max(max, floor)) / 4
  if (!(target > 0)) return Math.min(cap, floor)
  const scale = base ** Math.floor(Math.log(target) / Math.log(base))
  const step = LADDER[base].map((m) => m * scale).find((n) => n >= target)
  return Math.min(cap, (step ?? target) * 4)
}

export function quarters(top: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => top * f)
}

export function despike(values: (number | null)[], window = 7, sigmas = 3): (number | null)[] {
  const half = window >> 1
  return values.map((v, i) => {
    if (v === null) return v
    const near = values.slice(Math.max(0, i - half), i + half + 1).filter((n): n is number => n !== null)
    if (!near.length) return v
    const mid = median(near)
    const mad = Math.max(median(near.map((n) => Math.abs(n - mid))), 1)
    return Math.abs(v - mid) > sigmas * 1.4826 * mad ? mid : v
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const half = sorted.length >> 1
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
}

export function flagUrl(code: string): string {
  return `/flags/${code.trim().toLowerCase()}.svg`
}

const OS_ICONS: [string, string][] = [
  ["alma", "os-alma.svg"], ["alpine", "os-alpine.webp"], ["centos", "os-centos.svg"],
  ["debian", "os-debian.svg"], ["ubuntu", "os-ubuntu.svg"], ["elementary", "os-ubuntu.svg"],
  ["macos", "os-macos.svg"], ["darwin", "os-macos.svg"], ["windows", "os-windows.svg"],
  ["arch", "os-arch.svg"], ["kali", "os-kail.svg"], ["istore", "os-istore.png"],
  ["openwrt", "os-openwrt.svg"], ["immortalwrt", "os-openwrt.svg"], ["nix", "os-nix.svg"],
  ["rocky", "os-rocky.svg"], ["fedora", "os-fedora.svg"], ["suse", "os-openSUSE.svg"],
  ["gentoo", "os-gentoo.svg"], ["redhat", "os-redhat.svg"], ["rhel", "os-redhat.svg"],
  ["mint", "os-mint.svg"], ["manjaro", "os-manjaro-.svg"], ["armbian", "os-armbian.png"],
  ["synology", "os-synology.ico"], ["proxmox", "os-proxmox.ico"], ["alibaba", "os-alibaba.svg"],
  ["opencloud", "os-opencloud.svg"], ["oracle", "os-oracle.svg"],
]

export function osIconUrl(os: string): string {
  const name = os.toLowerCase()
  const file = OS_ICONS.find(([key]) => name.includes(key))?.[1] ?? "os-unknown.svg"
  return `/os-icons/${file}`
}
