import { useState } from "react"

import { Dot, Flag } from "@/components/ServerTable"
import { Input } from "@/components/ui/input"
import type { Node } from "@/lib/adapt"
import { Link } from "@/lib/route"

export function NodePicker({ nodes, selected }: { nodes: Node[]; selected: string }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q ? nodes.filter((n) => `${n.name} ${n.group} ${n.region} ${n.os}`.toLowerCase().includes(q)) : nodes
  return (
    <aside className="flex min-h-0 flex-col max-md:max-h-52 max-md:border-b max-md:pb-2 md:sticky md:top-16 md:max-h-[calc(100svh-6rem)] md:self-start md:border-r md:pr-4">
      <Input type="search" placeholder="搜索节点…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
      <nav className="mt-2 min-h-0 overflow-y-auto">
        {shown.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">没有匹配的节点</p>}
        {shown.map((n) => (
          <Link
            key={n.id}
            href={`#/server/${encodeURIComponent(n.id)}`}
            aria-current={n.id === selected ? "page" : undefined}
            className="flex items-center gap-2 border-b px-2 py-2 text-sm transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-primary"
          >
            <Dot node={n} className="size-2" />
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            <Flag code={n.region} className="text-xs text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </aside>
  )
}
