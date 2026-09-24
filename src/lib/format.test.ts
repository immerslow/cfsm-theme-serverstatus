/// <reference types="node" />
import assert from "node:assert/strict"

import { monthUsage } from "./adapt.ts"
import { axisTop, bytes, compact, daysUntil, pair, percent, quarters } from "./format.ts"

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
assert.equal(axisTop(0.4, 4, 10, 100), 4)
assert.equal(monthUsage({ month_rx: 1, month_tx: null, traffic_mode: "total" }), null)
assert.equal(monthUsage({ month_rx: 1, month_tx: 4, traffic_mode: "max" }), 4)
assert.equal(monthUsage({ month_rx: 1, month_tx: 4, traffic_mode: "dl" }), 1)

console.log("format ok")
