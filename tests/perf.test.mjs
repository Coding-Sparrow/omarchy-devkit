import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

// Everything except the regex tester runs on the shell's UI thread, often on
// clipboard content, which is attacker-controlled. Each tool must stay fast on
// worst-case input up to the 1 MiB clipboard limit. Super-linear regexes or
// quadratic loops fail here long before they could freeze the shell.
const dir = path.dirname(fileURLToPath(import.meta.url))
const T = {}
vm.createContext(T)
vm.runInContext(fs.readFileSync(path.join(dir, "..", "Tools.js"), "utf8"), T)

const N = 1 << 20
const BUDGET_MS = 1500
const MAX_PW_BYTES = Array.from({ length: 65536 }, (_, i) => i & 255)
const cases = {
  "detect: capitals": () => T.detect("A".repeat(N)),
  "detect: capitals then symbol": () => T.detect("A".repeat(N - 1) + "!"),
  "detect: base64-ish": () => T.detect("Ab".repeat(N / 2)),
  "detect: jwt-ish": () => T.detect("eyJ" + "a".repeat(N) + ".eyJ" + "a".repeat(N)),
  "detect: percent": () => T.detect("%".repeat(N)),
  "case: capitals at the cap": () => T.run("case", { input: "A".repeat(10000) }),
  "case: over the cap": () => T.run("case", { input: "A".repeat(N) }),
  "case: mixed at the cap": () => T.run("case", { input: "aB".repeat(5000) }),
  "url parse: long host": () => T.run("url", { mode: "parse", input: "http://" + "a".repeat(N) }),
  "url parse: colons": () => T.run("url", { mode: "parse", input: "http://" + "a:".repeat(N / 2) }),
  "url parse: at signs": () => T.run("url", { mode: "parse", input: "http://" + "@".repeat(N) }),
  "url parse: query": () => T.run("url", { mode: "parse", input: "a=b&".repeat(N / 4) }),
  "url decode": () => T.run("url", { mode: "decode", input: "%41".repeat(N / 3) }),
  "json: invalid numbers": () => T.run("json", { input: "[" + "1,".repeat(N / 2) + "x" }),
  "json: deep nesting": () => T.run("json", { input: "[".repeat(5000) + "]".repeat(4999) }),
  "json: long string": () => T.run("json", { input: '"' + "a".repeat(N) }),
  "base64 decode": () => T.run("base64", { mode: "decode", input: "QUJD".repeat(N / 4) }),
  "base64 encode": () => T.run("base64", { mode: "encode", input: "é".repeat(N / 2) }),
  "time: long digits": () => T.run("time", { input: "1".repeat(N) }),
  "time: junk": () => T.run("time", { input: "x".repeat(N) }),
  "jwt: junk": () => T.run("jwt", { input: "a.".repeat(N / 2) }),
  "diff: at the cell cap": () => T.run("diff", { input: "a\n".repeat(2000), input2: "b\n".repeat(2000) }),
  "diff: over the cell cap": () => T.run("diff", { input: "a\n".repeat(N / 4), input2: "b\n".repeat(N / 4) }),
  "password: largest draw": () => T.run("password", { length: 128, count: 64, upper: true, lower: true, digits: true, special: true, randomBytes: MAX_PW_BYTES }),
}

for (const [name, fn] of Object.entries(cases)) {
  const start = performance.now()
  fn()
  const ms = performance.now() - start
  assert.ok(ms < BUDGET_MS, `${name} took ${ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`)
}
console.log(`perf.test.mjs: ok (${Object.keys(cases).length} worst-case inputs under ${BUDGET_MS} ms)`)
