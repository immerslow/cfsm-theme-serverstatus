/// <reference types="node" />
import assert from "node:assert/strict"

import { parseSettings, resolveSettings } from "./settings.ts"

assert.deepEqual(parseSettings(null), { hide_offline: false, default_group: "", group_view: "cards" })
assert.deepEqual(
  parseSettings({ hide_offline: true, default_group: "香港", group_view: "tabs", extra: 1 }),
  { hide_offline: true, default_group: "香港", group_view: "tabs" },
)
assert.deepEqual(
  parseSettings({ hide_offline: "yes", default_group: 3, group_view: "cards" }),
  { hide_offline: false, default_group: "", group_view: "cards" },
)
// 旧的主题配置没有 group_view，按每组一张表。
assert.equal(parseSettings({}).group_view, "cards")
assert.equal(parseSettings({ group_view: "别的" }).group_view, "cards")
assert.deepEqual(
  resolveSettings({ hide_offline: true, default_group: "东京" }, null),
  { hide_offline: true, default_group: "东京", group_view: "cards" },
)
assert.deepEqual(
  resolveSettings({ hide_offline: true }, { hide_offline: false, default_group: "本地", group_view: "tabs" }),
  { hide_offline: false, default_group: "本地", group_view: "tabs" },
)

console.log("settings ok")
