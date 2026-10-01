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

// ---- shortcuts for the tools past Ctrl+0 are unique
const keys = T.TOOLS.slice(10).map((t) => t.shortcut)
assert.equal(new Set(keys).size, keys.length)
for (const k of keys) assert.ok(!["Ctrl+Shift+C", "Ctrl+Shift+V", "Ctrl+Shift+Tab"].includes(k), k)

// ---- Number base: exact at any size, two's complement, prefixes and modes
const num = (input, mode) => run("number", { input, mode })
const npair = (r, k) => (r.pairs.find((p) => p[0] === k) || [])[1]
assert.equal(npair(num("0xff"), "Decimal"), "255")
assert.equal(npair(num("255"), "Hex"), "0xFF")
assert.equal(npair(num("0b1111_1111"), "Octal"), "0o377")
assert.equal(npair(num("0o17"), "Decimal"), "15")
assert.equal(npair(num("deadbeef"), "Decimal"), "3,735,928,559")
assert.equal(npair(num("10", "bin"), "Decimal"), "2")
assert.equal(npair(num("10", "hex"), "Decimal"), "16")
assert.match(num("ff", "dec").error, /base-10/)
const big = "f".repeat(64)
assert.equal(npair(num("0x" + big), "Decimal").replace(/,/g, ""), (2n ** 256n - 1n).toString())
for (const v of ["0", "1", "18446744073709551615", "340282366920938463463374607431768211457", "9007199254740993"]) {
  assert.equal(npair(num(v), "Hex"), "0x" + BigInt(v).toString(16).toUpperCase(), v)
  assert.equal(npair(num(v), "Binary").replace(/^0b| /g, ""), BigInt(v).toString(2), v)
}
assert.equal(npair(num("-1"), "int8"), "0xFF")
assert.equal(npair(num("-1"), "int64"), "0xFFFF_FFFF_FFFF_FFFF")
assert.equal(npair(num("-128"), "int8"), "0x80")
assert.equal(npair(num("-129"), "int8"), undefined)
assert.equal(npair(num("-129"), "int16"), "0xFF7F")
assert.equal(npair(num("-9223372036854775808"), "int64"), "0x8000_0000_0000_0000")
assert.equal(npair(num("0xFFFFFFFF"), "As int32"), "-1")
assert.equal(npair(num("0x8000000000000000"), "As int64"), "-9,223,372,036,854,775,808")
assert.equal(npair(num("65"), "Character"), "U+0041  A")
assert.equal(npair(num("0x1F600"), "Character"), "U+1F600  😀")
assert.equal(npair(num("1 000 000"), "Hex"), "0xF4240")
assert.match(num("12x").error, /Not a valid/)
assert.match(num("1".repeat(2000)).error, /Too long/)

// ---- Color
const col = (input) => run("color", { input })
const cpair = (r, k) => (r.pairs.find((p) => p[0] === k) || [])[1]
assert.equal(cpair(col("#ff8800"), "RGB"), "rgb(255 136 0)")
assert.equal(cpair(col("#f80"), "HEX"), "#ff8800")
assert.equal(cpair(col("ff8800"), "HSL"), "hsl(32 100% 50%)")
assert.equal(cpair(col("rgb(255, 136, 0)"), "HEX"), "#ff8800")
assert.equal(cpair(col("rgb(100% 0% 0%)"), "HEX"), "#ff0000")
assert.equal(cpair(col("hsl(120 100% 25%)"), "HEX"), "#008000")
assert.equal(cpair(col("hsl(120deg, 100%, 25%)"), "HEX"), "#008000")
assert.equal(cpair(col("hsv(0 100% 100%)"), "HEX"), "#ff0000")
assert.equal(cpair(col("rgba(33ccffee)"), "HEX"), "#33ccffee")      // Hyprland
assert.equal(cpair(col("#33ccffee"), "Hyprland"), "rgba(33ccffee)")
assert.equal(cpair(col("#33ccffee"), "Qt / Android"), "#ee33ccff")
assert.equal(cpair(col("rgb(0 0 0 / 50%)"), "HEX"), "#00000080")
assert.equal(cpair(col("tomato"), "HEX"), "#ff6347")
assert.equal(cpair(col("#ff6347"), "CSS name"), "tomato")
assert.equal(cpair(col("#ffffff"), "On black"), "21:1  AAA")
assert.equal(cpair(col("#777777"), "On white"), "4.48:1  AA large text only")
// OKLCH: CSS Color 4 reference values, and a round trip
assert.equal(cpair(col("#ff0000"), "OKLCH"), "oklch(62.8% 0.258 29.2)")
assert.equal(cpair(col("#ffffff"), "OKLCH"), "oklch(100% 0 0)")
for (const h of ["#ff8800", "#123456", "#4cb86a", "#000000", "#ffffff"])
  assert.equal(cpair(col(cpair(col(h), "OKLCH")), "HEX"), h, h)
assert.equal(col("#ff8800").swatch.r, 1)
assert.match(col("not a colour").error, /Not a colour/)
assert.match(col("rgb(1 2)").error, /Not a colour/)

// ---- Escape
const esc = (input, mode) => run("escape", { input, mode }).output
assert.equal(esc(`<a href="x">Tom & 'Jerry'</a>`, "html"), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;")
assert.equal(esc("&lt;b&gt; caf&eacute; &copy; &#x1F600; &#169; &yuml; &bogus; &#xD800;", "html-decode"), "<b> café © 😀 © ÿ &bogus; &#xD800;")
for (const s of ["", "plain", `a "b" \\ c`, "tab\there\nnew\r\u0001\u2028", "é 😀"]) {
  const e = esc(s, "escape")
  if (s) assert.equal(JSON.parse('"' + e + '"'), s, s)
  if (s) assert.equal(esc(e, "unescape"), s, s)
}
assert.equal(esc(`"a\\nb\\t\\u00e9 \\u{1F600} \\x41"`, "unescape"), "a\nb\té 😀 A")
assert.match(run("escape", { input: "\\q", mode: "unescape" }).info, /Unknown escape \\q/)
assert.equal(esc("it's $HOME", "shell"), `'it'\\''s $HOME'`)
assert.equal(esc("plain-arg_1.txt", "shell"), "plain-arg_1.txt")

// ---- Lines
const lines = (input, mode) => run("lines", { input, mode })
assert.equal(lines("file10\nfile2\nFile1\nb\na", "sort").output, "a\nb\nFile1\nfile2\nfile10")
assert.equal(lines("v1.10\nv1.9\nv1.09\nv1.2", "sort").output, "v1.2\nv1.9\nv1.09\nv1.10")
assert.equal(lines("a\nb\nc", "sort-desc").output, "c\nb\na")
assert.equal(lines("b\na\nb\nc\na", "unique").output, "b\na\nc")
assert.equal(lines("x\ny\nx\nx", "count").output, "3  x\n1  y")
assert.equal(lines("p\nq\nr\nq\np\nz\nz\nz", "count").output, "3  z\n2  p\n2  q\n1  r")
assert.equal(lines("1\n2\n3", "reverse").output, "3\n2\n1")
assert.equal(lines("  a  \n\n\t b\n", "trim").output, "a\nb")
assert.equal(lines("__proto__\nconstructor\n__proto__", "unique").output, "__proto__\nconstructor")
assert.equal(lines("é😀\nb", "sort").info, "2 lines · 2 unique · 2 words · 5 chars · 8 bytes")
assert.match(lines("a\n".repeat(200001), "sort").error, /Too many lines/)

// ---- JSON → YAML
const yaml = (v) => run("json", { input: JSON.stringify(v), mode: "yaml" }).output
assert.equal(yaml({ a: 1, b: "x", c: [1, "two"], d: { e: null }, f: [], g: {} }), "a: 1\nb: x\nc:\n- 1\n- two\nd:\n  e: null\nf: []\ng: {}")
assert.equal(yaml({ on: "yes", n: "no", v: "1.0", t: "true", e: "", s: "a: b", h: "#x" }),
  '"on": "yes"\n"n": "no"\nv: "1.0"\nt: "true"\ne: ""\ns: "a: b"\nh: "#x"')
assert.equal(yaml([{ id: 1, tags: ["a"] }, { id: 2 }]), "- id: 1\n  tags:\n  - a\n- id: 2")
assert.equal(yaml({ note: "line1\nline2\n", x: "a\nb", z: "a\n\n" }), 'note: |\n  line1\n  line2\nx: |-\n  a\n  b\nz: "a\\n\\n"')
assert.equal(yaml("str"), "str")
let deep = 1; for (let i = 0; i < 300; i++) deep = [deep]
assert.match(run("json", { input: JSON.stringify(deep), mode: "yaml" }).error, /Nested more than 200/)

// ---- JSON → TypeScript
const ts = (v) => run("json", { input: JSON.stringify(v), mode: "ts" }).output
assert.equal(ts({ users: [{ id: 1, email: null }, { id: 2, email: "a", admin: true }], "user-agent": "x", mixed: [1, "a"], none: [] }),
  "export interface Root {\n  users: User[]\n  \"user-agent\": string\n  mixed: (string | number)[]\n  none: unknown[]\n}\n\n"
  + "export interface User {\n  id: number\n  email: string | null\n  admin?: boolean\n}")
assert.equal(ts([1, 2]), "export type Root = number[]")
// Identical shapes share one interface; different ones under one name get a suffix
assert.equal((ts({ home: { x: 1 }, work: { x: 2 } }).match(/interface/g) || []).length, 2)
assert.match(ts({ categories: [{ a: 1 }], boxes: [{ b: 1 }] }), /interface Category \{[\s\S]*interface Box \{/)

// ---- JSON ⇄ CSV
const csv = (v) => run("json", { input: JSON.stringify(v), mode: "csv" })
assert.equal(csv([{ a: 1, b: "x,y" }, { a: 2, c: { d: 1 } }]).output, 'a,b,c\n1,"x,y",\n2,,"{""d"":1}"')
assert.equal(csv([[1, 2], ["a", 'q"']]).output, '1,2\na,"q"""')
assert.match(csv([1, 2]).error, /array of objects/)
const fromCsv = (input) => run("json", { input, mode: "from-csv" })
assert.deepEqual(JSON.parse(fromCsv('name,age,zip,ok\n"Doe, J",42,00123,true\r\nAnn,,9,false\n').output),
  [{ name: "Doe, J", age: 42, zip: "00123", ok: true }, { name: "Ann", age: null, zip: 9, ok: false }])
assert.deepEqual(JSON.parse(fromCsv("a\tb\n1\t\"x\ny\"").output), [{ a: 1, b: "x\ny" }])
assert.deepEqual(JSON.parse(fromCsv("a;b\n1;2").output), [{ a: 1, b: 2 }])
assert.match(fromCsv('a\n"open').error, /Unclosed quote/)
// CSV → JSON → CSV round trip
const table = [{ a: "1,2", b: 'say "hi"', c: "line\nbreak" }]
assert.deepEqual(JSON.parse(fromCsv(csv(table).output).output), table)

// ---- ULID: spec example timestamp, Crockford alphabet, sorted batch
const UL = Array.from({ length: 160 }, (_, i) => (i * 37 + 11) & 255)
const ul = run("uuid", { mode: "ulid", count: 10, nowMs: 1469918176385, randomBytes: UL }).output.split("\n")
assert.equal(ul.length, 10)
for (const u of ul) assert.match(u, /^01ARYZ6S41[0-9A-HJKMNP-TV-Z]{16}$/)
assert.deepEqual([...ul].sort(), ul)
assert.equal(new Set(ul).size, 10)
assert.equal(run("uuid", { mode: "ulid", count: 1, nowMs: 1469918176385, randomBytes: Array(16).fill(255) }).output, "01ARYZ6S41ZZZZZZZZZZZZZZZZ")
assert.equal(run("uuid", { mode: "ulid", count: 1, nowMs: 0, randomBytes: Array(16).fill(0) }).output, "0".repeat(26))

// ---- Clipboard detection for the new tools
for (const [s, t] of [["#ff8800", "color"], ["rgb(1 2 3)", "color"], ["oklch(70% 0.1 50)", "color"], ["0xdeadbeef", "number"], ["0b1010", "number"]])
  assert.equal(T.detect(s), t, s)
for (const s of ["#zzz", "123", "rgb(nope)"]) assert.notEqual(T.detect(s), "color", s)

console.log("tools.test.mjs: ok")
