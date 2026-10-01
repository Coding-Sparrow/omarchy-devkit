import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

// Everything except the regex tester runs on the shell's UI thread, often on
// clipboard content, which is attacker-controlled. Each tool must stay fast on
// worst-case input up to the 1 MiB clipboard limit. Super-linear regexes or
// quadratic loops fail here long before they could freeze the shell.
// tests/perf-v4.qml runs the same cases in Qt's engine, which is slower.
const dir = path.dirname(fileURLToPath(import.meta.url))
const T = {}
vm.createContext(T)
vm.runInContext(fs.readFileSync(path.join(dir, "..", "Tools.js"), "utf8"), T)
vm.runInContext(fs.readFileSync(path.join(dir, "perf-cases.js"), "utf8"), T)

const BUDGET_MS = 1500
const cases = T.perfCases(T)
for (const [name, fn] of Object.entries(cases)) {
  const start = performance.now()
  fn()
  const ms = performance.now() - start
  assert.ok(ms < BUDGET_MS, `${name} took ${ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`)
}
console.log(`perf.test.mjs: ok (${Object.keys(cases).length} worst-case inputs under ${BUDGET_MS} ms)`)
