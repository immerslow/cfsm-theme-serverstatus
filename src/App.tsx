import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { ArrowUp, ChartLine, House, Moon, Settings as SettingsIcon, Sun, UserRound, type LucideIcon } from "lucide-react"

import { NodePicker } from "@/components/NodePicker"
import { ServerTables } from "@/components/ServerTable"
import { SettingsView } from "@/components/SettingsView"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useFleet, useServer } from "@/lib/live"
import { adminUrl } from "@/lib/http"
import mark from "@/assets/mark.svg"
import { Link, useRoute } from "@/lib/route"
import { resolveSettings, type Settings } from "@/lib/settings"

const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)
const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

function useTheme() {
  const [saved, setSaved] = useState(() => localStorage.getItem("theme"))
  const system = useSyncExternalStore(
    (notify) => {
      DARK_MEDIA.addEventListener("change", notify)
      return () => DARK_MEDIA.removeEventListener("change", notify)
    },
    () => DARK_MEDIA.matches,
  )
  const dark = saved ? saved === "dark" : system
  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark])
  return [dark, () => {
    const next = dark ? "light" : "dark"
    localStorage.setItem("theme", next)
    setSaved(next)
  }] as const
}

function Toolbox({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const sync = () => setScrolled(scrollY > 200)
    addEventListener("scroll", sync, { passive: true })
    return () => removeEventListener("scroll", sync)
  }, [])
  const style = "size-10 bg-card/85 text-primary shadow-md backdrop-blur hover:bg-card hover:text-primary max-md:size-9"
  return (
    <div className="fixed right-3 bottom-5 z-20 flex flex-col gap-2.5 max-md:bottom-3">
      {scrolled && (
        <Button variant="ghost" size="icon" className={style} title="回到顶部" onClick={() => scrollTo({ top: 0, behavior: "smooth" })}>
          <ArrowUp />
        </Button>
      )}
      <Button variant="ghost" size="icon" className={style} title="切换主题" onClick={toggle}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </div>
  )
}

function NavItem({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className="inline-flex items-center gap-1.5 px-3.5 text-sm transition-colors hover:text-primary aria-[current=page]:text-primary max-sm:px-2.5">
      <Icon className="size-3.5" />
      {children}
    </Link>
  )
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const route = useRoute()
  const { nodes, site, error, refresh } = useFleet()
  const openId = route.name === "server" ? route.id : null
  const { node: selected, error: detailError } = useServer(openId, nodes, site?.ws_timeout_minutes ?? 0)
  const remote = site ? resolveSettings(site.theme_options, null) : null
  const [override, setOverride] = useState<Settings | null>(null)
  const settings = override ?? remote ?? resolveSettings(null)
  useEffect(() => { void loadDetail() }, [])
  useEffect(() => {
    const name = selected?.name
    document.title = [name, site?.title || "ServerStatus"].filter(Boolean).join(" · ")
  }, [selected?.name, site?.title, route.name])

  const sorted = useMemo(() => {
    const list = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    const grouped = settings.default_group ? list.filter((node) => node.group === settings.default_group) : list
    return settings.hide_offline ? grouped.filter((node) => node.online || !node.deployed) : grouped
  }, [nodes, settings])

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-nav shadow-[0_1px_10px_rgb(0_0_0/0.1)]">
        <div className="mx-auto flex h-12 w-[95vw] max-w-[1680px] items-stretch max-md:w-full max-md:px-2">
          <Link href="#/" className="mr-5 flex min-w-0 items-center gap-2 text-lg max-sm:mr-1 max-sm:text-base">
            <img src={mark} alt="" className="size-5 shrink-0" />
            <span className="truncate">{site?.title || "ServerStatus"}</span>
          </Link>
          <nav className="flex shrink-0 items-stretch">
            <NavItem href="#/" active={route.name === "home"} icon={House}>首页</NavItem>
            {sorted.length > 0 && (
              <NavItem href={`#/server/${encodeURIComponent(openId ?? sorted[0].id)}`} active={route.name === "server"} icon={ChartLine}>监控</NavItem>
            )}
            <NavItem href="#/settings" active={route.name === "settings"} icon={SettingsIcon}>设置</NavItem>
          </nav>
          <a href={site ? adminUrl(site.base) : "/admin#admin"} className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-3.5 text-sm transition-colors hover:text-primary max-sm:px-2">
            <UserRound className="size-3.5" />
            <span className="max-sm:sr-only">{site?.authorization ? "后台" : "登录"}</span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-[95vw] max-w-[1680px] flex-1 space-y-4 py-5 max-md:w-full max-md:px-2 max-md:py-2.5">
        {error && (
          <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
            <button onClick={refresh} className="ml-2 underline">重试</button>
          </p>
        )}
        {route.name === "settings" ? (
          <SettingsView site={site} value={settings} onChange={setOverride} />
        ) : !nodes ? (
          <Skeleton className="h-80" />
        ) : route.name === "home" ? (
          sorted.length === 0 ? <p className="rounded-md border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">还没有节点</p> : <ServerTables nodes={sorted} site={site} />
        ) : selected ? (
          <div className="grid gap-5 rounded-md border bg-card p-5 text-card-foreground shadow-sm max-md:gap-3 max-md:p-2.5 md:grid-cols-[220px_minmax(0,1fr)]">
            <NodePicker nodes={sorted} selected={selected.id} />
            <div className="min-w-0">
              {detailError && <p className="mb-3 text-sm text-destructive">{detailError}</p>}
              <Suspense fallback={<Skeleton className="h-96" />}>
                <NodeDetail node={selected} site={site} />
              </Suspense>
            </div>
          </div>
        ) : (
          <p className="rounded-md border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
            节点不存在或未公开。<Link href="#/" className="text-primary hover:underline">返回列表</Link>
          </p>
        )}
      </main>

      <footer className="pb-5 text-center text-xs text-muted-foreground max-md:pb-3">
        {site?.title || "ServerStatus"} | ServerStatus | Powered by{" "}
        <a href="https://github.com/huilang-me/CF-Server-Monitor/" target="_blank" rel="noreferrer" className="hover:text-primary">
          CF-Server-Monitor{site?.version ? ` ${site.version}` : ""}
        </a>
      </footer>
      <Toolbox dark={dark} toggle={toggleTheme} />
    </div>
  )
}
