import { useEffect, useState, type ComponentProps } from "react"

export type Route =
  | { name: "home" }
  | { name: "server"; id: string }
  | { name: "settings" }

const read = (): Route => {
  const hash = location.hash.replace(/^#/, "") || "/"
  const server = hash.match(/^\/server\/([^/?#]+)/)
  if (server) return { name: "server", id: decodeURIComponent(server[1]) }
  if (hash.startsWith("/settings")) return { name: "settings" }
  return { name: "home" }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const sync = () => setRoute(read())
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])
  return route
}

export function href(route: Route): string {
  if (route.name === "server") return `#/server/${encodeURIComponent(route.id)}`
  if (route.name === "settings") return "#/settings"
  return "#/"
}

export function Link({ href: to, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (!to.startsWith("#")) return
        e.preventDefault()
        if (location.hash === to || (to === "#/" && (location.hash === "" || location.hash === "#"))) return
        location.hash = to
      }}
      {...props}
    />
  )
}
