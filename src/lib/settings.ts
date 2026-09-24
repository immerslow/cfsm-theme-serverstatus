const KEY = "cfsm-serverstatus-settings"

export type Settings = {
  hide_offline: boolean
  default_group: string
}

export const DEFAULT_SETTINGS: Settings = { hide_offline: false, default_group: "" }

export function parseSettings(value: unknown): Settings {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    hide_offline: rec.hide_offline === true,
    default_group: typeof rec.default_group === "string" ? rec.default_group : "",
  }
}

export function loadLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? parseSettings(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveLocal(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function clearLocal() {
  localStorage.removeItem(KEY)
}

/** 浏览器覆盖优先，其次后端 theme_options，最后默认值。 */
export function resolveSettings(remote: unknown, local = loadLocal()): Settings {
  return local ?? parseSettings(remote)
}
