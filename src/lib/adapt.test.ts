/// <reference types="node" />
import assert from "node:assert/strict"

import { adaptBatch, adaptHistory, adaptList, adaptNode, groupsOf, mergeSample, monthUsage, probe, settleDelay, trafficBytes } from "./adapt.ts"

assert.equal(probe(false), false)
assert.equal(probe(null), null)
assert.equal(probe(0), 0)
assert.equal(probe(undefined), false)
assert.equal(probe("12.5"), 12.5)
assert.equal(probe(-1), false)

assert.equal(trafficBytes("1TB"), 1024 ** 4)
assert.equal(trafficBytes("1.5 GiB"), 1.5 * 1024 ** 3)
assert.equal(trafficBytes(""), null)
assert.equal(trafficBytes("-1"), null)
assert.equal(trafficBytes("0"), null)

const now = 1_700_000_000_000
const list = adaptList({
  sysConfig: { show_price: false, show_expire: true, show_tf: true, show_three_net_details: true },
  servers: [{
    id: "a",
    name: "HK-01",
    server_group: "香港",
    sort_order: 2,
    region: "HK",
    cpu: 12.5,
    load_avg: "0.1 0.2 0.3",
    ram_total: 1024,
    ram_used: 512,
    disk_total: 10240,
    disk_used: 2048,
    net_in_speed: 1000,
    net_out_speed: 500,
    net_rx: 10,
    net_tx: 20,
    net_rx_monthly: 30,
    net_tx_monthly: 40,
    cpu_cores: 2,
    os: "Ubuntu 22.04",
    price: "0",
    traffic_limit: "1TB",
    traffic_calc_type: "max",
    ping_ct: 20,
    ping_cu: null,
    loss_ct: 0,
    boot_time: String(now - 3_600_000),
    last_updated: now,
  }, { id: "", name: "drop" }, { name: "noid" }],
}, "https://status.example", now)

assert.equal(list.length, 1)
assert.equal(list[0].metrics?.mem_total, 1024 * 1024 * 1024)
assert.equal(list[0].metrics?.mem_used, 512 * 1024 * 1024)
assert.equal(list[0].show_price, false)
assert.equal(list[0].show_probes, true)
assert.equal(list[0].ping.ct, 20)
assert.equal(list[0].ping.cu, null)
assert.equal(list[0].ping.cm, false)
assert.equal(list[0].loss.ct, 0)
assert.equal(list[0].online, true)
assert.equal(list[0].boot_time, now - 3_600_000)
assert.equal(list[0].price, null)
assert.equal(monthUsage(list[0]), 40)
assert.deepEqual(groupsOf(list), ["香港"])

const merged = mergeSample(list[0], { id: "a", ts: now, data: { cpu: 40 } }, now)
assert.equal(merged.metrics?.cpu, 40)
assert.equal(merged.metrics?.mem_used, list[0].metrics?.mem_used)
assert.equal(merged.os, "Ubuntu 22.04")
assert.equal(merged.online, true)

const stale = adaptNode({ id: "b", name: "old", last_updated: now - 6 * 60 * 1000, cpu_cores: 1 }, "https://status.example", {}, now)
assert.equal(stale?.online, false)
assert.equal(stale?.deployed, true)

assert.deepEqual(adaptBatch({ type: "hello" }), [])
assert.deepEqual(adaptBatch({
  type: "batchUpdate",
  updates: [{ serverId: "a", samples: [{ ts: 1, data: { cpu: 1 } }, { ts: 2, payload: { cpu: 2 } }, { metrics: { cpu: 3 } }] }],
}).map((s) => s.data.cpu), [1, 2, 3])
assert.equal(settleDelay([]), 1000)
assert.equal(settleDelay([null, 0]), 1000)
assert.equal(settleDelay([2, 4]), 1000)
assert.equal(settleDelay([0.4, 2]), 250)

const history = adaptHistory([
  { timestamp: 2000, cpu: 2, ram_used: null, ping_ct: false },
  { timestamp: 1000, cpu: 1, ram_used: 10, ping_ct: 15, loss_ct: null },
  { cpu: 9 },
])
assert.deepEqual(history.map((row) => row.ts), [1000, 2000])
assert.equal(history[0].mem_used, 10 * 1024 * 1024)
assert.equal(history[1].mem_used, null)
assert.equal(history[0].probes.ct, 15)
assert.equal(history[0].loss.ct, null)
assert.equal(history[1].probes.ct, false)

console.log("adapt ok")
