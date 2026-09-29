import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

// Load Tools.js the way QML does: as a plain script whose top-level
// declarations become properties of the context.
const dir = path.dirname(fileURLToPath(import.meta.url))
const T = {}
vm.createContext(T)
vm.runInContext(fs.readFileSync(path.join(dir, "..", "Tools.js"), "utf8"), T)

const NOW = Date.UTC(2024, 0, 1, 12, 0, 0)
const run = (tool, state) => T.run(tool, { nowMs: NOW, ...state })

// UTF-8 + Base64 round trip, incl. astral chars
for (const s of ["", "hello", "héllo wörld", "日本語", "emoji 😀 ok"]) {
  assert.equal(T.utf8Decode(T.utf8Encode(s)), s)
  assert.equal(Buffer.from(T.utf8Encode(s)).toString("utf8"), s)
}
assert.equal(run("base64", { input: "héllo 😀", mode: "encode" }).output, Buffer.from("héllo 😀").toString("base64"))
assert.equal(run("base64", { input: "a?b>", mode: "encode-url" }).output, Buffer.from("a?b>").toString("base64url"))
assert.equal(run("base64", { input: "aMOpbGxvIPCfmIA=", mode: "decode" }).output, "héllo 😀")
assert.equal(run("base64", { input: "aMOpbGxvIPCfmIA", mode: "decode" }).output, "héllo 😀") // no padding
assert.match(run("base64", { input: "!!!", mode: "decode" }).error, /Not valid/)
assert.match(run("base64", { input: "AAEC/w==", mode: "decode" }).info, /binary, 4 bytes/)
assert.equal(T.utf8Decode([0xff]), null)
assert.equal(T.utf8Decode([0xe6, 0x97]), null) // truncated sequence

// JSON
assert.equal(run("json", { input: '{"b":1,"a":[1,2]}', mode: "minify" }).output, '{"b":1,"a":[1,2]}')
assert.equal(run("json", { input: '{"b":1,"a":{"d":1,"c":2}}', mode: "sort" }).output,
  JSON.stringify({ a: { c: 2, d: 1 }, b: 1 }, null, 2))
assert.match(run("json", { input: '{"a":1}' }).info, /Valid JSON · 1 keys, depth 1/)
assert.equal(run("json", { input: '{\n  "a": 1,\n}' }).error, "Trailing comma at line 3, column 1")
assert.equal(run("json", { input: "{a:1}" }).error, "Expected a double-quoted key at line 1, column 2")
assert.equal(run("json", { input: "[1 2]" }).error, "Expected ',' or ']' at line 1, column 4")
assert.equal(run("json", { input: "   " }).output, "")

// JWT
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = [b64u({ alg: "HS256", typ: "JWT" }), b64u({ sub: "42", name: "Zoë", iat: 1700000000, exp: 1700003600 }), "sig"].join(".")
const j = run("jwt", { input: "Bearer " + jwt })
assert.equal(j.error, "")
assert.match(j.output, /"name": "Zoë"/)
assert.match(j.output, /exp:  2023-11-14T23:13:20.000Z  \(1 month ago\)/)
assert.equal(j.info, "HS256 · EXPIRED")
assert.equal(j.urgent, true)
assert.match(run("jwt", { input: "a.b" }).error, /three dot-separated parts/)

// URL
assert.equal(run("url", { input: "a b&c=d/é", mode: "encode" }).output, "a%20b%26c%3Dd%2F%C3%A9")
assert.equal(run("url", { input: "a%20b+c", mode: "decode" }).output, "a b c")
assert.match(run("url", { input: "%E0%A4%A", mode: "decode" }).error, /Malformed/)
const u = run("url", { input: "https://me@api.example.com:8443/v1/items?q=hello%20world&tag=a&tag=b&flag#top", mode: "parse" }).output
assert.match(u, /Host {6}api\.example\.com/)
assert.match(u, /Port {6}8443/)
assert.match(u, / {2}q = hello world/)
assert.match(u, / {2}flag = $/m)
assert.match(u, /Fragment {2}top/)

// Time
assert.match(run("time", { input: "1700000000" }).output, /ISO 8601 UTC {2}2023-11-14T22:13:20.000Z/)
assert.equal(run("time", { input: "1700000000000" }).info, "Read as milliseconds")
assert.equal(run("time", { input: "1700000000000000" }).info, "Read as microseconds")
assert.match(run("time", { input: "2024-01-01T11:00:00Z" }).output, /Unix \(s\) {6}1704106800/)
assert.match(run("time", { input: "2024-01-01T11:00:00Z" }).output, /Relative {6}1 hour ago/)
assert.equal(run("time", { input: "" }).info, "Read as now")
assert.match(run("time", { input: "not a date" }).error, /Could not read/)

// UUID
let seed = 1
const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) & 255
const v4 = run("uuid", { mode: "v4", count: 3, rng }).output.split("\n")
assert.equal(v4.length, 3)
for (const id of v4) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const v7 = run("uuid", { mode: "v7", count: 1, rng }).output
assert.match(v7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
assert.equal(parseInt(v7.replace(/-/g, "").slice(0, 12), 16), NOW)
assert.equal(run("uuid", { mode: "v4", count: 9999, rng }).output.split("\n").length, 500)

// Case
const c = run("case", { input: "parseHTTPResponse_code-v2" }).output
assert.match(c, /camelCase {8}parseHttpResponseCodeV2/)
assert.match(c, /snake_case {7}parse_http_response_code_v2/)
assert.match(c, /SCREAMING_SNAKE {2}PARSE_HTTP_RESPONSE_CODE_V2/)
assert.match(c, /kebab-case {7}parse-http-response-code-v2/)

// Regex
const r = run("regex", { pattern: "(?<user>\\w+)@(\\w+)\\.com", flags: "g", input: "a@b.com\nc@d.com" })
assert.equal(r.info, "2 matches")
assert.match(r.output, /#2 {2}line 2, index 8 {2}"c@d.com"/)
assert.match(r.output, /\$1 <user> = "c"/)
assert.equal(run("regex", { pattern: "x*", flags: "g", input: "abc" }).info, "4 matches") // zero-width safe
assert.equal(run("regex", { pattern: "o", flags: "", input: "foo" }).info, "1 match")
assert.equal(run("regex", { pattern: "(\\w+)@", flags: "g", input: "a@ b@", replacement: "[$1]", useReplace: true }).output, "[a] [b]")
assert.equal(run("regex", { pattern: "o", flags: "", input: "foo", replacement: "0", useReplace: true }).output, "f0o")
assert.match(run("regex", { pattern: "(", flags: "g", input: "x" }).error, /./)

// Diff
const d = run("diff", { input: "a\nb\nc\nd", input2: "a\nB\nc\nd\ne" })
assert.deepEqual([...d.rows].map((x) => x.t + x.s), [" a", "-b", "+B", " c", " d", "+e"])
assert.equal(d.info, "+2  −1")
assert.equal(run("diff", { input: "x\ny", input2: "x\ny" }).info, "Identical")

// Detect
assert.equal(T.detect(jwt), "jwt")
assert.equal(T.detect('{"a":1}'), "json")
assert.equal(T.detect("1700000000"), "time")
assert.equal(T.detect("https://example.com/x?y=1"), "url")
assert.equal(T.detect("a%20b"), "url")
assert.equal(T.detect(Buffer.from("hello world, this is text").toString("base64")), "base64")
assert.equal(T.detect("justaword"), "")
assert.equal(T.detect("some plain sentence"), "")

// Named groups on an engine without match.groups (Qt's V4, used by the shell).
// Simulate it by stripping .groups from every exec() result.
const V4 = {}
vm.createContext(V4)
vm.runInContext(`
  (function () {
    var NativeRegExp = RegExp
    function V4RegExp(p, f) {
      var re = new NativeRegExp(p, f)
      var exec = re.exec
      re.exec = function (s) { var m = exec.call(re, s); if (m) delete m.groups; return m }
      return re
    }
    RegExp = V4RegExp
  })()
`, V4)
vm.runInContext(fs.readFileSync(path.join(dir, "..", "Tools.js"), "utf8"), V4)
const named = V4.run("regex", { pattern: "(?<kind>\\w+) id=(?<id>\\d+)", flags: "g", input: "order id=1042" })
assert.match(named.output, /\$1 <kind> = "order"/)
assert.match(named.output, /\$2 <id> = "1042"/)
assert.deepEqual([...T.groupNames("(a)(?:b)(?<x>c)(?=d)\\(e\\)[(](?<y>f(g))(?<!h)")], ["", "x", "y", ""])
// $<name> in replacements, on both engines
for (const E of [T, V4]) {
  assert.equal(E.run("regex", { pattern: "(?<user>\\w+)@(?<host>\\w+)", flags: "g", input: "a@b c@d",
    replacement: "$<host>/$<user>", useReplace: true }).output, "b/a d/c")
}

console.log("tools.test.mjs: ok")
