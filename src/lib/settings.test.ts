/// <reference types="node" />
import assert from "node:assert/strict"

import { parseSettings, resolveSettings } from "./settings.ts"

assert.deepEqual(parseSettings(null), { hide_offline: false, default_group: "" })
assert.deepEqual(parseSettings({ hide_offline: true, default_group: "香港", extra: 1 }), { hide_offline: true, default_group: "香港" })
assert.deepEqual(parseSettings({ hide_offline: "yes", default_group: 3 }), { hide_offline: false, default_group: "" })
assert.deepEqual(resolveSettings({ hide_offline: true, default_group: "东京" }, null), { hide_offline: true, default_group: "东京" })
assert.deepEqual(resolveSettings({ hide_offline: true }, { hide_offline: false, default_group: "本地" }), { hide_offline: false, default_group: "本地" })

console.log("settings ok")
