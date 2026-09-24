import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const root = new URL("../dist/", import.meta.url)
const names = readdirSync(root)
const allowed = new Set(["index.html", "assets"])
const extra = names.filter((name) => !allowed.has(name))
if (extra.length) {
  console.error("dist 只允许 index.html 与 assets/，发现：" + extra.join(", "))
  process.exit(1)
}
if (!names.includes("index.html") || !statSync(join(root.pathname, "assets")).isDirectory()) {
  console.error("dist 缺少 index.html 或 assets/")
  process.exit(1)
}
console.log("dist ok")
