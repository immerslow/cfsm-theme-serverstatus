export const STORAGE_KEYS = {
  jwt: "jwt_token",
  turnstileToken: "turnstile_token",
  turnstileVerified: "turnstile_verified",
} as const

export class ApiError extends Error {
  status: number | null
  code: string | null
  constructor(status: number | null, message: string, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

/** 纯静态部署用 `<meta name="apiBase">`，逗号分隔；缺省时用当前页面同源。 */
export function apiBases(doc: Document = document, loc: Location = location): string[] {
  const content = doc.querySelector<HTMLMetaElement>('meta[name="apiBase"]')?.content ?? ""
  const parsed = [...new Set(content.split(",").map((s) => originOf(s.trim())).filter((s): s is string => !!s))]
  if (parsed.length) return parsed
  const fallback = originOf(loc.origin)
  if (!fallback) throw new Error("缺少可用的 API 地址")
  return [fallback]
}

export function apiUrl(base: string, path: string): string {
  return new URL(path.startsWith("/") ? path : "/" + path, base).toString()
}

export function adminUrl(base: string): string {
  return apiUrl(base, "/admin") + "#admin"
}

export function wsUrl(base: string, subscribe: string): string {
  const url = new URL(base)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/api/ws"
  url.search = ""
  url.searchParams.set("subscribe", subscribe)
  if (url.host !== location.host) {
    const token = readStorage(STORAGE_KEYS.jwt)
    if (token) url.searchParams.set("token", token)
  }
  return url.toString()
}

function headers(method: string): Headers {
  const h = new Headers({ Accept: "application/json" })
  if (method === "POST") h.set("Content-Type", "application/json")
  const token = readStorage(STORAGE_KEYS.jwt)
  if (token) h.set("Authorization", "Bearer " + token)
  const verified = readStorage(STORAGE_KEYS.turnstileVerified)
  const turnstile = readStorage(STORAGE_KEYS.turnstileToken)
  if (verified) h.set("X-Turnstile-Verified", verified)
  else if (turnstile) h.set("X-Turnstile-Token", turnstile)
  return h
}

function messageOf(payload: unknown, fallback: string): { message: string; code: string | null } {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const rec = payload as Record<string, unknown>
    const message = typeof rec.error === "string" ? rec.error : typeof rec.message === "string" ? rec.message : fallback
    const code = typeof rec.message === "string" ? rec.message : typeof rec.error === "string" ? rec.error : null
    return { message, code }
  }
  return { message: typeof payload === "string" && payload.trim() ? payload : fallback, code: null }
}

/**
 * 单次请求最多等多久。浏览器把请求发到一条已悄悄断开的连接上时，会一直挂着：
 * HTTP/1.1 下实测 300 秒仍未返回，nginx 默认就是 HTTP/1.1。
 */
const TIMEOUT = 20_000

/**
 * 超时后还能重试几次。中止会关掉那条连接，下一次从池里换一条，而池里可能还有死
 * 连接；Chrome 每主机留六条，四条死掉时第五次才成功。全是 GET，重复安全。
 */
const RETRIES = 6

export const NETWORK_ERROR = "网络连接失败，稍后再试"

export async function request(base: string, path: string, init?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }): Promise<unknown> {
  const method = init?.method ?? "GET"
  const url = apiUrl(base, path)
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT)
    const onAbort = () => controller.abort()
    init?.signal?.addEventListener("abort", onAbort, { once: true })
    try {
      const res = await fetch(url, {
        method,
        headers: headers(method),
        body: method === "POST" ? JSON.stringify(init?.body) : undefined,
        credentials: "include",
        signal: controller.signal,
      })
      const text = await res.text()
      // 200 里带 HTML 是反代的页面，不是 hub 的 JSON。
      let payload: unknown = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          // hub 的错误是 JSON；不是 JSON 的正文来自反代的错误页或 CDN 的挑战。
          throw new ApiError(res.status, res.ok ? "收到的不是状态数据，稍后再试" : NETWORK_ERROR, "parse")
        }
      }
      if (!res.ok) {
        if (res.status === 401) writeStorage(STORAGE_KEYS.jwt, null)
        if (res.status === 403) {
          writeStorage(STORAGE_KEYS.turnstileToken, null)
          writeStorage(STORAGE_KEYS.turnstileVerified, null)
        }
        const { message, code } = messageOf(payload, res.statusText || NETWORK_ERROR)
        throw new ApiError(res.status, message, code)
      }
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const verified = (payload as Record<string, unknown>).turnstile_verified
        if (typeof verified === "string") {
          writeStorage(STORAGE_KEYS.turnstileVerified, verified)
          writeStorage(STORAGE_KEYS.turnstileToken, null)
        }
      }
      return payload
    } catch (cause) {
      if (cause instanceof ApiError) throw cause
      // 调用方主动取消不是网络故障，也不重试。
      if (init?.signal?.aborted) throw new ApiError(null, NETWORK_ERROR, "abort")
      // 读正文时超时同样落在这里，所以正文读一半被打断也算网络失败，而不是
      // 「响应不是 JSON」或浏览器给的英文原文。Chrome 在响应到达前把超时叫
      // TimeoutError、读正文时叫 AbortError；这里只有我们的定时器会中止。
      const timedOut = controller.signal.aborted || (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError"))
      if (method !== "GET" || !timedOut || attempt === RETRIES) {
        throw new ApiError(null, NETWORK_ERROR, timedOut ? "timeout" : "network")
      }
    } finally {
      clearTimeout(timeout)
      init?.signal?.removeEventListener("abort", onAbort)
    }
  }
}
