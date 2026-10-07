/// <reference types="node" />
import assert from "node:assert/strict"

import { monthUsage } from "./adapt.ts"
import {
  axisBytes, axisTop, byteTop, bytes, compact, daysUntil, pair, percent, quarters, RATE_FLOOR, rateAxis, smooth,
  withGaps,
} from "./format.ts"

assert.equal(bytes(null), "—")
assert.equal(bytes(0), "0 B")
assert.equal(bytes(1024), "1.00 KB")
assert.equal(bytes(100 * 1024), "100 KB")
assert.equal(pair(300 * 1024 ** 2, 900 * 1024 ** 2), "300.00 / 900.00 MB")
assert.equal(pair(null, 10), "—")
assert.equal(compact(null), "—")
assert.equal(compact(4.91 * 1024), "4.91K")
assert.equal(percent(null, 10), null)
assert.equal(percent(50, 0), null)
assert.equal(daysUntil("2026-01-10", new Date("2026-01-08T12:00:00").getTime()), 2)
assert.equal(daysUntil(""), null)
assert.deepEqual(quarters(100), [0, 25, 50, 75, 100])
assert.equal(axisTop(0.4, 4, 100), 4)
assert.equal(axisTop(63, 4, 100), 80)
assert.equal(axisTop(200, 4, 100), 100)

// byteTop: 轴顶取自 2 的幂，四条刻度才都印得出整值。
assert.deepEqual(quarters(byteTop(32 * 1024 ** 2, 1024)).map(axisBytes), ["0 B", "8 MB", "16 MB", "24 MB", "32 MB"])
assert.deepEqual(quarters(byteTop(2_621_440, 1024)).map(axisBytes), ["0 B", "1 MB", "2 MB", "3 MB", "4 MB"])
assert.deepEqual(quarters(byteTop(1_258_291, 1024)).map(axisBytes), ["0 B", "512 KB", "1 MB", "1.5 MB", "2 MB"])

// withGaps: 超过常规间距两倍的空档里插一行空行；缺一个桶或上报间隔长的 agent 不插。
const gapped = (list: number[]) => withGaps(list.map((ts) => ({ ts, v: 1 }))).map((r) => ("v" in r ? r.ts : -r.ts))
assert.deepEqual(gapped([0, 60, 120, 180, 600, 660]), [0, 60, 120, 180, -390, 600, 660], "离线的一段断开")
assert.deepEqual(gapped([0, 60, 180, 240]), [0, 60, 180, 240], "缺一个桶不断开")
assert.deepEqual(gapped([0, 300, 600, 900, 1200]), [0, 300, 600, 900, 1200], "五分钟上报一次的 agent 照常连线")
assert.deepEqual(gapped([0, 60, 300, 600, 900, 1200]), [0, 60, 300, 600, 900, 1200], "间隔不齐时按中位数而非最小值")
assert.deepEqual(gapped([0, 60, 660]), [0, 60, -360, 660], "两段间隔时较短的一段是常规间隔")
assert.deepEqual(gapped([0]), [0], "单点")
assert.deepEqual(gapped([]), [], "空")

// percent 不封顶：超额读作 212%，进度条自己止于满格。
assert.equal(percent(212, 100), 212)

// rateAxis: 从不大于最慢速率的那档到不小于最快的那档，标签都是整值，最多六个。
const axis = (low: number, high: number) => {
  const { domain, ticks } = rateAxis(low, high)
  return [domain.map(axisBytes), ticks.map(axisBytes)]
}
assert.deepEqual(axis(209, 70 * 1024 ** 2), [
  ["1 KB", "100 MB"], ["1 KB", "10 KB", "100 KB", "1 MB", "10 MB", "100 MB"],
], "空闲 209 B/s 落在标了的底上，突发 70 MB/s")
assert.deepEqual(axis(744, 229 * 1024 ** 2), [["1 KB", "1 GB"], ["1 KB", "100 KB", "10 MB", "1 GB"]], "七档隔一档标")
assert.deepEqual(axis(300, 1.5 * 1024 ** 3), [["1 KB", "10 GB"], ["10 KB", "1 MB", "100 MB", "10 GB"]], "八档从顶往下数")
assert.deepEqual(axis(5 * 1024 ** 2, 80 * 1024 ** 2), [["1 MB", "100 MB"], ["1 MB", "10 MB", "100 MB"]], "底随最慢的速率上移")
assert.deepEqual(axis(1100, 5100), [["1 KB", "10 KB"], ["1 KB", "10 KB"]], "不到一档时也有一档")
assert.deepEqual(axis(1024, 1024), [["1 KB", "10 KB"], ["1 KB", "10 KB"]], "正好落在档上")
assert.deepEqual(axis(0, 0), [["1 KB", "10 KB"], ["1 KB", "10 KB"]], "全是零")
assert.deepEqual(axis(Infinity, 0), [["1 KB", "10 KB"], ["1 KB", "10 KB"]], "空窗口：最小值的初值是 Infinity")
assert.equal(RATE_FLOOR, 1024, "轴底是 1 KB/s")
assert.equal(monthUsage({ month_rx: 1, month_tx: null, traffic_mode: "total" }), 1)
assert.equal(monthUsage({ month_rx: null, month_tx: null, traffic_mode: "total" }), null)
assert.equal(monthUsage({ month_rx: 1, month_tx: 4, traffic_mode: "max" }), 4)
assert.equal(monthUsage({ month_rx: 1, month_tx: 4, traffic_mode: "dl" }), 1)
assert.equal(monthUsage({ month_rx: 1, month_tx: 4, traffic_mode: "down" }), 5)
assert.equal(monthUsage({ month_rx: null, month_tx: 4, traffic_mode: "ul" }), 4)
assert.equal(monthUsage({ month_rx: null, month_tx: 4, traffic_mode: "dl" }), null)

// smooth: 逐桶的抖动压下去，持续的变化不动，短于窗口的突发被抹平。
{
  const flat = smooth([20, 20, 20, 20, 20], 3)
  assert.deepEqual(flat, [20, 20, 20, 20, 20], "本来是平的就不动")
  const raw = [20, 40, 20, 40, 20, 40, 20]
  const noisy = smooth(raw, 3)
  // 平均不会造出原数据里没有的高点或低点，只把锯齿的幅度压小。
  const range = (list: (number | null)[]) => Math.max(...list.map((v) => v!)) - Math.min(...list.map((v) => v!))
  assert.ok(noisy.every((v) => v! >= 20 && v! <= 40), "平滑后仍在原数据的范围内")
  assert.ok(range(noisy) < range(raw), `幅度被压小（${range(raw)} -> ${range(noisy)}）`)
  // 一个持续到整窗的台阶：多数窗口里的点都在台阶上，平均仍落在台阶上。
  const step = smooth([10, 10, 10, 10, 10, 10, 30, 30, 30, 30, 30, 30], 3)
  assert.ok(step[10]! > 25 && step[10]! <= 30, `台阶后的读数仍在台阶上（得到 ${step[10]}）`)
  assert.ok(step[5]! < 20, `台阶前的读数仍在台阶下（得到 ${step[5]}）`)
  // 超时按空缺算而不是当 0，否则一段超时会把平均值拽向 0。
  assert.equal(smooth([20, null, 20], 3)[1], null, "空缺处仍为空缺，线不接过去")
  assert.equal(smooth([20, null, 20], 3)[0], 20, "窗口按样本数算，不受空缺影响")
  assert.equal(smooth([null, null], 3)[0], null, "全是空缺")
  assert.deepEqual(smooth([], 3), [], "空")
}

console.log("format ok")
