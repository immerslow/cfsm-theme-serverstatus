import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Site } from "@/lib/adapt"
import { request } from "@/lib/http"
import { clearLocal, parseSettings, saveLocal, type Settings } from "@/lib/settings"

export function SettingsView({ site, value, onChange }: { site: Site | null; value: Settings; onChange: (next: Settings) => void }) {
  const [draft, setDraft] = useState(value)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const dirty = draft.hide_offline !== value.hide_offline || draft.default_group !== value.default_group

  const saveBrowser = () => {
    saveLocal(draft)
    onChange(draft)
    setMessage("已保存到此浏览器")
  }

  const saveBackend = async () => {
    if (!site) return
    setSaving(true)
    setMessage("")
    try {
      const payload = await request(site.base, "/api/theme_options", {
        method: "POST",
        body: { theme_options: { ...site.theme_options, ...draft } },
      })
      const saved = payload && typeof payload === "object" && "theme_options" in payload
        ? parseSettings((payload as { theme_options: unknown }).theme_options)
        : draft
      clearLocal()
      onChange(saved)
      setDraft(saved)
      setMessage("已保存到 CFSM，所有访客可见")
    } catch (cause) {
      setMessage(cause instanceof Error ? `保存失败：${cause.message || "需要先在管理端登录"}` : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-5 rounded-md border bg-card p-5 text-card-foreground shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">主题设置</h2>
        <p className="mt-1 text-sm text-muted-foreground">只影响这套表格主题。管理端配置仍在 CFSM 后台。</p>
      </div>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>隐藏离线节点</span>
        <input type="checkbox" checked={draft.hide_offline} onChange={(e) => setDraft({ ...draft, hide_offline: e.target.checked })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span>默认分组</span>
        <Input value={draft.default_group} placeholder="留空显示全部" onChange={(e) => setDraft({ ...draft, default_group: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={saveBrowser} disabled={!dirty}>保存到此浏览器</Button>
        <Button variant="ghost" onClick={saveBackend} disabled={!dirty || saving || !site?.authorization}>{saving ? "保存中…" : "保存到 CFSM"}</Button>
        <Button
          variant="ghost"
          onClick={() => {
            clearLocal()
            const next = parseSettings(site?.theme_options)
            setDraft(next)
            onChange(next)
            setMessage("已回到后端配置")
          }}
        >
          使用后端配置
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {!site?.authorization && <p className="text-xs text-muted-foreground">保存到 CFSM 需要先在管理端登录。</p>}
    </section>
  )
}
