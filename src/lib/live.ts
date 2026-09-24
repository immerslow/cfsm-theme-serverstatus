import { useEffect, useState } from "react"

import { adaptBatch, adaptList, adaptNode, adaptSite, mergeSample, settleDelay, type Node, type Sample, type Site } from "./adapt"
import { ApiError, apiBases, request, wsUrl } from "./http"

const FALLBACK_MS = 60_000
const MIN_FALLBACK_MS = 5_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000
const STABLE_MS = 10_000
const PING_MS = 30_000
const ONLINE_MS = 5 * 60 * 1000
const POLICY_VIOLATION = 1008
const MAX_IDS = 500

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

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, MAX_IDS)
}

export function useFleet(): Fleet {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [error, setError] = useState("")
  const [closed, setClosed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let stopped = false
    const sockets = new Map<string, WebSocket>()
    const attempts = new Map<string, number>()
    const retries = new Map<string, ReturnType<typeof setTimeout>>()
    const pings = new Map<string, ReturnType<typeof setInterval>>()
    const stables = new Map<string, ReturnType<typeof setTimeout>>()
    const lifetimes = new Map<string, ReturnType<typeof setTimeout>>()
    const pending = new Map<string, (Sample & { base: string })[]>()
    let fallback: ReturnType<typeof setInterval> | null = null
    let flush: ReturnType<typeof setTimeout> | null = null
    let expireTimer: ReturnType<typeof setInterval> | null = null
    let current: Node[] = []
    let timeoutMinutes = 0
    const bases = apiBases()

    const apply = (next: Node[]) => {
      current = next
      setNodes(next)
      setError("")
      setClosed(false)
    }

    const pull = () =>
      Promise.allSettled(bases.map((base) => request(base, "/api/servers").then((payload) => adaptList(payload, base))))
        .then((settled) => {
          if (stopped) return
          const next = settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])
          const failures = settled.filter((result) => result.status === "rejected")
          if (next.length || !failures.length) apply(next)
          if (failures.length === settled.length) {
            const cause = failures[0].reason
            const message = cause instanceof Error ? cause.message : "网络错误"
            setError(message || "网络错误")
            if (cause instanceof ApiError && cause.status === 401) setClosed(true)
          }
        })

    const stopFallback = () => {
      if (!fallback) return
      clearInterval(fallback)
      fallback = null
    }

    const startFallback = () => {
      if (fallback || stopped || document.hidden) return
      const delay = Math.max(FALLBACK_MS, MIN_FALLBACK_MS)
      fallback = setInterval(() => { void pull() }, delay)
    }

    const clearSocketTimers = (base: string) => {
      const ping = pings.get(base)
      const stable = stables.get(base)
      const lifetime = lifetimes.get(base)
      if (ping) clearInterval(ping)
      if (stable) clearTimeout(stable)
      if (lifetime) clearTimeout(lifetime)
      pings.delete(base)
      stables.delete(base)
      lifetimes.delete(base)
    }

    const schedule = (base: string) => {
      if (stopped || retries.has(base) || document.hidden) return
      const attempt = attempts.get(base) ?? 0
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempt, 5))
      attempts.set(base, attempt + 1)
      startFallback()
      retries.set(base, setTimeout(() => {
        retries.delete(base)
        if (!stopped && document.visibilityState !== "hidden") connect(base)
      }, delay))
    }

    const flushPending = () => {
      flush = null
      if (stopped || document.hidden || !pending.size) {
        pending.clear()
        return
      }
      let next = current
      for (const samples of pending.values()) {
        for (const sample of samples) {
          next = next.map((node) => node.id === sample.id && node.base === sample.base ? mergeSample(node, sample) : node)
        }
      }
      pending.clear()
      apply(next)
    }

    const queue = (base: string, samples: Sample[]) => {
      if (!samples.length || stopped || document.hidden) return
      const tagged = samples.map((sample) => ({ ...sample, base }))
      const list = pending.get(base)
      if (list) list.push(...tagged)
      else pending.set(base, [...tagged])
      if (flush) return
      flush = setTimeout(flushPending, settleDelay(current.map((node) => node.report_interval)))
    }

    const connect = (base: string) => {
      if (stopped || sockets.has(base) || document.hidden) return
      const ids = unique(current.filter((node) => node.base === base).map((node) => node.id))
      if (!ids.length) return
      let socket: WebSocket
      try {
        socket = new WebSocket(wsUrl(base, "all"))
      } catch {
        schedule(base)
        return
      }
      sockets.set(base, socket)
      socket.onopen = () => {
        if (sockets.get(base) !== socket) return
        socket.send(JSON.stringify({ type: "subscribe", scope: "all", ids }))
        stopFallback()
        stables.set(base, setTimeout(() => {
          if (sockets.get(base) === socket && socket.readyState === WebSocket.OPEN) attempts.set(base, 0)
          stables.delete(base)
        }, STABLE_MS))
        pings.set(base, setInterval(() => {
          if (sockets.get(base) === socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }))
          }
        }, PING_MS))
        if (timeoutMinutes > 0) {
          lifetimes.set(base, setTimeout(() => {
            if (sockets.get(base) !== socket || stopped) return
            sockets.delete(base)
            clearSocketTimers(base)
            socket.close(1000, "connection lifetime exceeded")
          }, timeoutMinutes * 60_000))
        }
      }
      socket.onmessage = (event) => {
        if (sockets.get(base) !== socket) return
        queue(base, adaptBatch(JSON.parse(String(event.data))))
      }
      socket.onclose = (event) => {
        if (sockets.get(base) !== socket) return
        sockets.delete(base)
        clearSocketTimers(base)
        pending.delete(base)
        if (stopped || event.code === POLICY_VIOLATION) return
        schedule(base)
      }
    }

    const closeAll = () => {
      for (const socket of sockets.values()) socket.close()
      sockets.clear()
      for (const timer of [...retries.values(), ...stables.values(), ...lifetimes.values()]) clearTimeout(timer)
      for (const timer of pings.values()) clearInterval(timer)
      retries.clear()
      pings.clear()
      stables.clear()
      lifetimes.clear()
      pending.clear()
      if (flush) clearTimeout(flush)
      flush = null
      stopFallback()
    }

    void Promise.all(bases.map((base) =>
      request(base, "/api/config")
        .then((payload) => adaptSite(payload, base))
        .catch(() => adaptSite({}, base)),
    )).then((sites) => {
      if (stopped) return
      const next = sites.find((item) => item.base === bases[0]) ?? sites[0]
      timeoutMinutes = next.ws_timeout_minutes
      setSite(next)
    })
    void pull().then(() => { if (!stopped) bases.forEach(connect) })
    expireTimer = setInterval(() => {
      if (current.some((node) => node.online && node.last_seen !== null && Date.now() - node.last_seen > ONLINE_MS)) {
        apply(expire(current, Date.now()))
      }
    }, 30_000)

    const onHide = () => {
      if (document.hidden) closeAll()
      else void pull().then(() => { if (!stopped) bases.forEach(connect) })
    }
    document.addEventListener("visibilitychange", onHide)

    return () => {
      stopped = true
      closeAll()
      if (expireTimer) clearInterval(expireTimer)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [tick])

  return { nodes, site, error, closed, refresh: () => setTick((n) => n + 1) }
}

export function useServer(id: string | null, list: Node[] | null, timeoutMinutes = 0) {
  const known = list?.find((node) => node.id === id) ?? null
  const [node, setNode] = useState<Node | null>(known)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    const base = known?.base ?? apiBases()[0]
    let stopped = false
    let socket: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let fallback: ReturnType<typeof setInterval> | null = null
    let attempt = 0
    const pull = () =>
      request(base, `/api/server?id=${encodeURIComponent(id)}`)
        .then((payload) => {
          const next = adaptNode(payload, base)
          if (!stopped && next) {
            setNode((prev) => next && prev
              ? { ...next, show_price: prev.show_price, show_expire: prev.show_expire, show_traffic: prev.show_traffic, show_probes: prev.show_probes }
              : next)
          }
        })
        .catch((cause: unknown) => {
          if (!stopped) setError(cause instanceof Error ? (cause.message || "网络错误") : "网络错误")
        })
    const stopFallback = () => {
      if (!fallback) return
      clearInterval(fallback)
      fallback = null
    }
    const startFallback = () => {
      if (fallback || stopped || document.hidden) return
      fallback = setInterval(() => { void pull() }, Math.max(FALLBACK_MS, MIN_FALLBACK_MS))
    }
    const connect = () => {
      if (stopped || socket || document.hidden) return
      try {
        socket = new WebSocket(wsUrl(base, id))
      } catch {
        startFallback()
        return
      }
      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: "subscribe", scope: id, ids: [] }))
        stopFallback()
        attempt = 0
        ping = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }))
        }, PING_MS)
        if (timeoutMinutes > 0) {
          setTimeout(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.close(1000, "connection lifetime exceeded")
          }, timeoutMinutes * 60_000)
        }
      }
      socket.onmessage = (event) => {
        const samples = adaptBatch(JSON.parse(String(event.data))).filter((sample) => sample.id === id)
        if (!samples.length) return
        setNode((prev) => samples.reduce((acc, sample) => acc ? mergeSample(acc, sample) : acc, prev))
      }
      socket.onclose = (event) => {
        socket = null
        if (ping) clearInterval(ping)
        ping = null
        if (stopped || event.code === POLICY_VIOLATION || document.hidden) return
        startFallback()
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempt, 5))
        attempt += 1
        retry = setTimeout(connect, delay)
      }
    }
    void pull()
    connect()
    const onHide = () => {
      if (document.hidden) {
        socket?.close()
        socket = null
        stopFallback()
      } else {
        void pull().then(() => { if (!stopped) connect() })
      }
    }
    document.addEventListener("visibilitychange", onHide)
    return () => {
      stopped = true
      if (ping) clearInterval(ping)
      if (retry) clearTimeout(retry)
      stopFallback()
      socket?.close()
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [id, known?.base, timeoutMinutes])

  return { node: node ?? known, error }
}
