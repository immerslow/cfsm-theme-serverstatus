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

export async function request(base: string, path: string, init?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }): Promise<unknown> {
  const method = init?.method ?? "GET"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort("timeout"), 15_000)
  const onAbort = () => controller.abort(init?.signal?.reason)
  init?.signal?.addEventListener("abort", onAbort, { once: true })
  try {
    const res = await fetch(apiUrl(base, path), {
      method,
      headers: headers(method),
      body: method === "POST" ? JSON.stringify(init?.body) : undefined,
      credentials: "include",
      signal: controller.signal,
    })
    const text = await res.text()
    const payload: unknown = text ? JSON.parse(text) : null
    if (!res.ok) {
      if (res.status === 401) writeStorage(STORAGE_KEYS.jwt, null)
      if (res.status === 403) writeStorage(STORAGE_KEYS.turnstileVerified, null)
      const { message, code } = messageOf(payload, res.statusText || "请求失败")
      throw new ApiError(res.status, message, code)
    }
    return payload
  } catch (cause) {
    if (cause instanceof ApiError) throw cause
    if (cause instanceof SyntaxError) throw new ApiError(null, "响应不是 JSON", "parse")
    const timedOut = controller.signal.reason === "timeout"
    throw new ApiError(null, timedOut ? "请求超时" : "网络错误", timedOut ? "timeout" : "network")
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener("abort", onAbort)
  }
}
