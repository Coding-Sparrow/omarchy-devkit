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

// The first ten tools take Ctrl+1…0 from their sidebar position; anything past
// that must declare its own key, which both the Shortcut and the tooltip read.
T.TOOLS.slice(10).forEach((t) => assert.match(t.shortcut, /^Ctrl\+(Shift\+)?[A-Za-z0-9]$/))
assert.equal(T.toolById("password").shortcut, "Ctrl+Shift+P")

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

// UUID: only ever built from supplied CSPRNG bytes
const secure = (n) => [...crypto.getRandomValues(new Uint8Array(n))]
const v4 = run("uuid", { mode: "v4", count: 3, randomBytes: secure(48) }).output.split("\n")
assert.equal(v4.length, 3)
for (const id of v4) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
assert.equal(new Set(v4).size, 3)
const v7 = run("uuid", { mode: "v7", count: 1, randomBytes: secure(16) }).output
assert.match(v7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
assert.equal(parseInt(v7.replace(/-/g, "").slice(0, 12), 16), NOW)
// Known bytes -> known UUID, so no other randomness source can be involved.
assert.equal(run("uuid", { mode: "v4", count: 1, randomBytes: Array(16).fill(0xff) }).output, "ffffffff-ffff-4fff-bfff-ffffffffffff")
// Not enough secure bytes: refuse, never fall back.
const short = run("uuid", { mode: "v4", count: 2, randomBytes: secure(31) })
assert.equal(short.output, "")
assert.match(short.error, /secure random bytes/)
assert.equal(run("uuid", { mode: "v4", count: 1 }).output, "")
assert.match(run("uuid", { mode: "v4", count: 1, randomBytes: [...Array(15).fill(1), 256] }).error, /Invalid random bytes/)
assert.equal(T.uuidBytesNeeded(9999), 500 * 16)
assert.equal(run("uuid", { mode: "v4", count: 9999, randomBytes: secure(8000) }).output.split("\n").length, 500)
assert.doesNotMatch(fs.readFileSync(path.join(dir, "..", "Tools.js"), "utf8").replace(/\/\/.*$/gm, ""), /Math\.random/)
assert.doesNotMatch(fs.readFileSync(path.join(dir, "..", "DevKit.qml"), "utf8").replace(/\/\/.*$/gm, ""), /Math\.random/)

// Password: options and character sets, backed only by the CSPRNG byte pool.
const zeros = (n) => Array(n).fill(0)
const pw = { length: 4, count: 1, upper: true, lower: true, digits: true, special: true }
// With all-zero bytes every unbiased draw lands on index 0, so the result is
// fully determined by the algorithm — no hidden randomness source.
assert.equal(run("password", { ...pw, randomBytes: zeros(64) }).output, "0!Aa")
// 4 characters is under the weak threshold, so it is flagged rather than
// silently presented as a strong password.
const shortPw = run("password", { ...pw, randomBytes: zeros(64) })
assert.equal(shortPw.info, "1 × 4 chars · 24 bits each · weak")
assert.equal(shortPw.urgent, true)

const bulkPw = run("password", { length: 20, count: 5, upper: true, lower: true, digits: true, special: true, randomBytes: zeros(1000) })
const pws = bulkPw.output.split("\n")
assert.equal(pws.length, 5)
assert.equal(bulkPw.urgent, false)
for (const line of pws) {
  assert.equal(line.length, 20)
  // One character from every selected set is guaranteed.
  assert.ok(/[A-Z]/.test(line) && /[a-z]/.test(line) && /[0-9]/.test(line) && /[^A-Za-z0-9]/.test(line))
}

// The letter sets skip the look-alikes "I" and "l"; exclude trims more.
const letterSets = T.passwordAlphabet({ upper: true, lower: true })
assert.equal(letterSets.length, 2)
assert.doesNotMatch(letterSets.join(""), /[Il]/)
assert.equal(T.passwordAlphabet({ upper: true, exclude: "A,B,C" })[0], "DEFGHJKLMNOPQRSTUVWXYZ")
assert.equal(T.passwordExcluded("O, 0 ,l1"), "O0l1")
const exclPw = run("password", { length: 30, count: 20, upper: true, digits: true, exclude: "A,0", randomBytes: zeros(4000) })
assert.doesNotMatch(exclPw.output, /[A0]/)

// No usable character set is an error, never an empty or weaker password.
assert.match(run("password", { ...pw, upper: false, lower: false, digits: false, special: false, randomBytes: zeros(64) }).error, /at least one character set/)
assert.match(run("password", { length: 8, count: 1, upper: true, exclude: "ABCDEFGHJKLMNOPQRSTUVWXYZ", randomBytes: zeros(64) }).error, /at least one character set/)
assert.match(run("password", { length: 128, count: 100, upper: true, randomBytes: zeros(70000) }).error, /Too many characters/)

// An empty or unreadable length — the moment a field is cleared to retype it —
// falls back to the default instead of a 1-character, low-entropy password.
assert.equal(T.passwordLength(""), 16)
assert.equal(T.passwordLength("abc"), 16)
const defaultedPw = run("password", { ...pw, length: "", randomBytes: zeros(128) })
assert.equal(defaultedPw.output.length, 16)
assert.equal(defaultedPw.info, "1 × 16 chars · 97 bits each")

// A result under the weak threshold says so, so an alphabet excluded down to a
// single character cannot pass as a strong password.
const weakPw = run("password", { length: 8, count: 1, upper: false, lower: false, digits: false, special: true, exclude: "!,@,#,$,%,^,&", randomBytes: zeros(64) })
assert.equal(weakPw.output, "********")
assert.equal(weakPw.urgent, true)
assert.equal(weakPw.info, "1 × 8 chars · 0 bits each · weak")

// Too few secure bytes: refuse, never fall back.
assert.match(run("password", { ...pw, randomBytes: zeros(10) }).error, /secure random bytes/)
assert.equal(run("password", { ...pw }).output, "")
assert.match(run("password", { ...pw, randomBytes: [...zeros(63), 256] }).error, /Invalid random bytes/)
// A draw never asks the helper for more than it can return in one call.
assert.equal(T.passwordCount(9999), 100)
assert.equal(T.passwordCount(300), 100)   // matches the field's validator top
assert.equal(T.passwordLength(9999), 128)
assert.ok(T.passwordBytesNeeded(64, 128) <= 65536)

// Case
const c = run("case", { input: "parseHTTPResponse_code-v2" }).output
assert.match(c, /camelCase {8}parseHttpResponseCodeV2/)
assert.match(c, /snake_case {7}parse_http_response_code_v2/)
assert.match(c, /SCREAMING_SNAKE {2}PARSE_HTTP_RESPONSE_CODE_V2/)
assert.match(c, /kebab-case {7}parse-http-response-code-v2/)

assert.match(run("case", { input: "HTTPResponse" }).output, /PascalCase {7}HttpResponse/)
assert.match(run("case", { input: "a".repeat(10001) }).error, /10000 characters max/)

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

// Cron: next runs in UTC from NOW (Mon 2024-01-01 12:00 UTC)
const cron = (input, extra) => run("cron", { input, mode: "utc", ...extra })
const pair = (r, k) => (r.pairs.find((p) => p[0] === k) || [])[1]
const next = (r) => [...(r.pairs || [])].filter((p) => /^Next \d+$/.test(p[0])).map((p) => p[1].slice(0, 20))
assert.equal(T.toolById("cron").shortcut, "Ctrl+Shift+R")
assert.deepEqual(next(cron("*/5 * * * *")).slice(0, 2), ["2024-01-01 12:05 Mon", "2024-01-01 12:10 Mon"])
assert.equal(next(cron("* * * * *")).length, 10)
assert.equal(pair(cron("0 9 * * 1-5"), "Description"), "At 09:00, on Monday through Friday")
assert.deepEqual(next(cron("0 9 * * MON-FRI")).slice(0, 2), ["2024-01-02 09:00 Tue", "2024-01-03 09:00 Wed"])
assert.equal(pair(cron("*/15 9-17 * * 1-5"), "Description"), "Every 15 minutes, between 09:00 and 17:59, on Monday through Friday")
assert.equal(pair(cron("0 */2 * * *"), "Description"), "At minute 0, every 2 hours")
assert.equal(pair(cron("0 0 1 JAN-MAR/2 *"), "Description"), "At 00:00, on day 1 of the month, in January and March")
// 0 and 7 are both Sunday; names and numbers agree
assert.deepEqual(next(cron("0 12 * * 7")), next(cron("0 12 * * SUN")))
assert.deepEqual(next(cron("0 12 * * 0")), next(cron("0 12 * * sun")))
// Both day fields restricted: either one matches (1st/15th OR Friday)
assert.deepEqual(next(cron("0 0 1,15 * 5")).slice(0, 3), ["2024-01-05 00:00 Fri", "2024-01-12 00:00 Fri", "2024-01-15 00:00 Mon"])
// A starred day field (even with a step) makes it AND: odd days that are Mondays
assert.deepEqual(next(cron("0 0 */2 * 1")).slice(0, 2), ["2024-01-15 00:00 Mon", "2024-01-29 00:00 Mon"])
// "5/15" is "5-59/15"
assert.equal(pair(cron("5/15 * * * *"), "Minute"), "5/15  →  5, 20, 35, 50")
// Leap days, and dates that never exist
assert.deepEqual(next(cron("0 0 29 2 *")).slice(0, 3), ["2024-02-29 00:00 Thu", "2028-02-29 00:00 Tue", "2032-02-29 00:00 Sun"])
const never = cron("0 0 30 2 *")
assert.equal(next(never).length, 0)
assert.equal(never.urgent, true)
assert.match(never.info, /Never runs/)
// Macros, crontab lines with a command, comments and VAR= lines
assert.deepEqual(next(cron("@daily")), next(cron("0 0 * * *")))
assert.equal(pair(cron("@weekly /usr/bin/backup --all"), "Command"), "/usr/bin/backup --all")
const tab = cron("# nightly\nMAILTO=me@example.com\n30 2 * * * /bin/job\n0 3 * * * /bin/other")
assert.equal(pair(tab, "Command"), "/bin/job")
assert.match(tab.info, /^First of 2 lines/)
// Never runs strictly at "now"; starts from the next minute
assert.equal(next(cron("0 12 * * *"))[0], "2024-01-02 12:00 Tue")
// Errors
assert.match(cron("61 * * * *").error, /^Minute: 61 is out of range \(0–59\)/)
assert.match(cron("0 25 * * *").error, /^Hour: 25 is out of range/)
assert.match(cron("0 0 0 * *").error, /^Day of month: 0 is out of range/)
assert.match(cron("0 0 * 13 *").error, /^Month: 13 is out of range/)
assert.match(cron("* * * *").error, /Expected 5 fields/)
assert.match(cron("0 0 L * *").error, /Quartz/)
assert.match(cron("0 */5 * * * ?").error, /seconds field/)
assert.match(cron("5-1 * * * *").error, /goes backwards/)
assert.match(cron("*/0 * * * *").error, /positive/)
assert.match(cron("0 0 * * FOO").error, /not a valid value/)
assert.match(cron("@reboot").error, /no schedule/)
assert.match(cron("@often").error, /Unknown macro/)
assert.match(cron("x".repeat(2000)).error, /Too long/)
assert.equal(cron("").info, "Enter a cron expression or pick a preset")
// Every preset parses and runs
T.CRON_PRESETS.forEach((p) => assert.equal(next(cron(p.expr)).length, 10, p.expr))
// Clipboard detection
for (const s of ["*/5 * * * *", "0 9 * * MON-FRI", "@daily", "0 0 1 */3 *"]) assert.equal(T.detect(s), "cron", s)
for (const s of ["1 2 3 4 5", "hello there my good friend"]) assert.equal(T.detect(s), "", s)

console.log("tools.test.mjs: ok")
