import { useEffect, useState } from "react"

import { adaptBatch, adaptList, adaptNode, adaptSite, mergeSample, type Node, type Site } from "./adapt"
import { ApiError, apiBases, request, wsUrl } from "./http"

const POLL_MS = 15_000
const RETRY_MS = 5_000
const PING_MS = 30_000
const ONLINE_MS = 5 * 60 * 1000

export type Fleet = {
  nodes: Node[] | null
  site: Site | null
  error: string
  closed: boolean
  refresh: () => void
}

function expire(nodes: Node[], now: number): Node[] {
  return nodes.map((node) =>
    node.online && node.last_seen !== null && now - node.last_seen > ONLINE_MS
      ? { ...node, online: false, metrics: node.metrics }
      : node,
  )
}

export function useFleet(): Fleet {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [error, setError] = useState("")
  const [closed, setClosed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let stopped = false
    let socket: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let expireTimer: ReturnType<typeof setInterval> | null = null
    let ping: ReturnType<typeof setInterval> | null = null
    const base = apiBases()[0]
    let current: Node[] = []
    let ids: string[] = []

    const apply = (next: Node[]) => {
      current = next
      ids = next.map((n) => n.id)
      setNodes(next)
      setError("")
      setClosed(false)
    }

    const pull = () =>
      request(base, "/api/servers")
        .then((payload) => { if (!stopped) apply(adaptList(payload, base)) })
        .catch((cause: unknown) => {
          if (stopped) return
          const message = cause instanceof Error ? cause.message : "网络错误"
          setError(message || "网络错误")
          if (cause instanceof ApiError && cause.status === 401) setClosed(true)
        })

    const reconnect = () => {
      if (stopped || retry) return
      poll ??= setInterval(pull, POLL_MS)
      retry = setTimeout(() => {
        retry = null
        if (!stopped && document.visibilityState !== "hidden") connect()
      }, RETRY_MS)
    }

    const connect = () => {
      if (stopped || socket) return
      try {
        socket = new WebSocket(wsUrl(base, "all"))
      } catch {
        reconnect()
        return
      }
      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: "subscribe", scope: "all", ids: ids.slice(0, 500) }))
        if (ping) clearInterval(ping)
        ping = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }))
        }, PING_MS)
      }
      socket.onmessage = (event) => {
        const samples = adaptBatch(JSON.parse(String(event.data)))
        if (!samples.length) return
        const now = Date.now()
        const known = new Map(current.map((node) => [node.id, node]))
        for (const sample of samples) {
          const node = known.get(sample.id)
          if (node) known.set(sample.id, mergeSample(node, sample, now))
        }
        apply(current.map((node) => known.get(node.id) ?? node))
        if (poll) {
          clearInterval(poll)
          poll = null
        }
      }
      socket.onclose = () => {
        socket = null
        if (ping) {
          clearInterval(ping)
          ping = null
        }
        if (!stopped) reconnect()
      }
    }

    void request(base, "/api/config")
      .then((payload) => { if (!stopped) setSite(adaptSite(payload, base)) })
      .catch(() => { if (!stopped) setSite(adaptSite({}, base)) })
    void pull().then(() => { if (!stopped) connect() })
    expireTimer = setInterval(() => {
      if (current.some((node) => node.online && node.last_seen !== null && Date.now() - node.last_seen > ONLINE_MS)) {
        apply(expire(current, Date.now()))
      }
    }, 30_000)

    const onHide = () => {
      if (document.hidden) {
        const current = socket
        socket = null
        current?.close()
      } else if (!socket && !retry) {
        void pull().then(() => { if (!stopped) connect() })
      }
    }
    document.addEventListener("visibilitychange", onHide)

    return () => {
      stopped = true
      socket?.close()
      if (poll) clearInterval(poll)
      if (retry) clearTimeout(retry)
      if (ping) clearInterval(ping)
      if (expireTimer) clearInterval(expireTimer)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [tick])

  return { nodes, site, error, closed, refresh: () => setTick((n) => n + 1) }
}

export function useServer(id: string | null, list: Node[] | null) {
  const known = list?.find((node) => node.id === id) ?? null
  const [node, setNode] = useState<Node | null>(known)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    const base = known?.base ?? apiBases()[0]
    let stopped = false
    let socket: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | null = null
    const pull = () =>
      request(base, `/api/server?id=${encodeURIComponent(id)}`)
        .then((payload) => {
          const next = adaptNode(payload, base)
          if (!stopped && next) setNode((prev) => next && prev ? { ...next, show_price: prev.show_price, show_expire: prev.show_expire, show_traffic: prev.show_traffic, show_probes: prev.show_probes } : next)
        })
        .catch((cause: unknown) => {
          if (!stopped) setError(cause instanceof Error ? (cause.message || "网络错误") : "网络错误")
        })
    void pull()
    try {
      socket = new WebSocket(wsUrl(base, id))
      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: "subscribe", scope: id, ids: [] }))
        ping = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }))
        }, PING_MS)
      }
      socket.onmessage = (event) => {
        const samples = adaptBatch(JSON.parse(String(event.data))).filter((sample) => sample.id === id)
        if (!samples.length) return
        setNode((prev) => samples.reduce((acc, sample) => acc ? mergeSample(acc, sample) : acc, prev))
      }
    } catch {
      /* REST already covers a missing socket */
    }
    return () => {
      stopped = true
      if (ping) clearInterval(ping)
      socket?.close()
    }
  }, [id, known?.base])

  return { node: node ?? known, error }
}
