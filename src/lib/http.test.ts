/// <reference types="node" />
import assert from "node:assert/strict"

import { ApiError, NETWORK_ERROR, request } from "./http.ts"

const BASE = "https://status.example.com"
const realFetch = globalThis.fetch

const stub = (run: () => Promise<Response>) => {
  globalThis.fetch = run as unknown as typeof fetch
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

// 超时会重试：下一次换池里的另一条连接，可能已经活了。
{
  let calls = 0
  stub(async () => {
    if (++calls < 3) throw new DOMException("signal timed out", "TimeoutError")
    return json({ servers: [] })
  })
  assert.deepEqual(await request(BASE, "/api/servers"), { servers: [] })
  assert.equal(calls, 3, "第三次才成功")
}

// 重试用尽仍失败，按网络失败提示，不再报「请求超时」。
{
  let calls = 0
  stub(async () => {
    calls++
    throw new DOMException("signal timed out", "TimeoutError")
  })
  await assert.rejects(request(BASE, "/api/servers"), { status: null, message: NETWORK_ERROR })
  assert.equal(calls, 7, "首次加 6 次重试")
}

// 读正文时被打断（含超时）算网络失败，不是「响应不是 JSON」。
{
  const cut = {
    ok: false,
    status: 503,
    statusText: "",
    headers: new Headers({ "content-type": "text/plain" }),
    text: async () => { throw new DOMException("aborted", "AbortError") },
  }
  stub(async () => cut as unknown as Response)
  await assert.rejects(request(BASE, "/api/servers"), { status: null, message: NETWORK_ERROR })
}

// 200 里带 HTML 是反代的页面，不是 hub 的 JSON。
{
  stub(async () => new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } }))
  await assert.rejects(request(BASE, "/api/servers"), { status: 200, message: "收到的不是状态数据，稍后再试" })
}

// hub 的错误文案照原样显示，CFSM 的是 JSON。
{
  stub(async () => new Response(JSON.stringify({ message: "登录后才能查看超过 24 小时的历史" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  }))
  await assert.rejects(request(BASE, "/api/servers"), (e: unknown) =>
    e instanceof ApiError && e.message === "登录后才能查看超过 24 小时的历史" && e.code === "登录后才能查看超过 24 小时的历史")
}

// 非 JSON 的错误正文来自反代，按状态说明而不是浏览器原文。
{
  stub(async () => new Response("<html>502 Bad Gateway</html>", {
    status: 502,
    headers: { "content-type": "text/html" },
  }))
  await assert.rejects(request(BASE, "/api/servers"), { status: 502, message: NETWORK_ERROR })
}

// 调用方取消不重试，也不算超时。
{
  let calls = 0
  const controller = new AbortController()
  stub(async () => {
    calls++
    controller.abort()
    throw new DOMException("aborted", "AbortError")
  })
  await assert.rejects(request(BASE, "/api/servers", { signal: controller.signal }), { code: "abort" })
  assert.equal(calls, 1, "取消后不再重试")
}

// POST 不重试：重复一次未必安全，保存主题配置会写两次。
{
  let calls = 0
  stub(async () => {
    calls++
    throw new DOMException("signal timed out", "TimeoutError")
  })
  await assert.rejects(
    request(BASE, "/api/theme_options", { method: "POST", body: { theme_options: { hide_offline: true } } }),
    { status: null, message: NETWORK_ERROR },
  )
  assert.equal(calls, 1, "POST 只发一次")
}

globalThis.fetch = realFetch
console.log("http ok")
