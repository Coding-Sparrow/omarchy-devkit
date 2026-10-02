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

// Every key a tool claims is declared in TOOLS, which both the Shortcut and the
// sidebar hint read. The original ten keep Ctrl+1…0 from before 0.2.
T.TOOLS.filter((t) => t.shortcut).forEach((t) => assert.match(t.shortcut, /^Ctrl\+(Shift\+)?[A-Za-z0-9]$/, t.id))
assert.equal(T.toolById("password").shortcut, "Ctrl+Shift+P")
assert.deepEqual(["json", "jwt", "base64", "url", "time", "uuid", "hash", "case", "regex", "diff"].map((id) => T.toolById(id).shortcut),
  ["Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9", "Ctrl+0"])
// Every tool sits in a known section, and ids are unique
for (const t of T.TOOLS) assert.ok(T.SECTIONS.some((s) => s.id === t.section), t.id)
assert.equal(new Set(T.TOOLS.map((t) => t.id)).size, T.TOOLS.length)

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
// Not strict JSON, but readable: repaired to strict JSON, with the strict error named
const lenient = run("json", { input: '{\n  "a": 1, // note\n}' })
assert.equal(lenient.error, "")
assert.equal(lenient.output, '{\n  "a": 1\n}')
assert.match(lenient.info, /^Not strict JSON \(Expected a double-quoted key at line 2, column 11\)\. Read anyway, allowing comments, trailing commas$/)
assert.equal(lenient.urgent, true)
assert.equal(run("json", { input: "{a:1, 'b': 'x', c: [1, 2,], d: True, e: 0xff}", mode: "minify" }).output, '{"a":1,"b":"x","c":[1,2],"d":true,"e":255}')
assert.equal(run("json", { input: '{"__proto__": {"x": 1}, // c\n}', mode: "minify" }).output, '{"__proto__":{"x":1}}')
assert.equal(run("json", { input: "{a: NaN}" }).error, "NaN has no JSON form at line 1, column 5")
assert.equal(run("json", { input: "[1 2]" }).error, "Expected ',' or ']' at line 1, column 4")
assert.equal(run("json", { input: "   " }).output, "")

// JWT
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = [b64u({ alg: "HS256", typ: "JWT" }), b64u({ sub: "42", name: "Zoë", iat: 1700000000, exp: 1700003600 }), "sig"].join(".")
const j = run("jwt", { input: "Bearer " + jwt })
assert.equal(j.error, "")
assert.match(j.output, /"name": "Zoë"/)
assert.match(j.output, /exp:  2023-11-14T23:13:20.000Z  \(1 month ago\)/)
assert.equal(j.info, "HS256 · EXPIRED · signature not checked")
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

// ---- tool shortcuts are unique and leave the window's own keys alone
const keys = T.TOOLS.filter((t) => t.shortcut).map((t) => t.shortcut)
assert.equal(new Set(keys).size, keys.length)
for (const k of keys) assert.ok(!["Ctrl+Shift+C", "Ctrl+Shift+V", "Ctrl+Shift+Tab", "Ctrl+Shift+S", "Ctrl+K", "Ctrl+L", "Ctrl+D", "Ctrl+P"].includes(k), k)

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
const yaml = (v) => run("yaml", { input: JSON.stringify(v), mode: "to-yaml" }).output
assert.equal(yaml({ a: 1, b: "x", c: [1, "two"], d: { e: null }, f: [], g: {} }), "a: 1\nb: x\nc:\n- 1\n- two\nd:\n  e: null\nf: []\ng: {}")
assert.equal(yaml({ on: "yes", n: "no", v: "1.0", t: "true", e: "", s: "a: b", h: "#x" }),
  '"on": "yes"\n"n": "no"\nv: "1.0"\nt: "true"\ne: ""\ns: "a: b"\nh: "#x"')
assert.equal(yaml([{ id: 1, tags: ["a"] }, { id: 2 }]), "- id: 1\n  tags:\n  - a\n- id: 2")
assert.equal(yaml({ note: "line1\nline2\n", x: "a\nb", z: "a\n\n" }), 'note: |\n  line1\n  line2\nx: |-\n  a\n  b\nz: "a\\n\\n"')
assert.equal(yaml("str"), "str")
let deep = 1; for (let i = 0; i < 300; i++) deep = [deep]
assert.match(run("yaml", { input: JSON.stringify(deep), mode: "to-yaml" }).error, /Nested more than 200/)

// ---- JSON → TypeScript
const ts = (v) => run("types", { input: JSON.stringify(v), mode: "ts" }).output
assert.equal(ts({ users: [{ id: 1, email: null }, { id: 2, email: "a", admin: true }], "user-agent": "x", mixed: [1, "a"], none: [] }),
  "export interface Root {\n  users: User[]\n  \"user-agent\": string\n  mixed: (string | number)[]\n  none: unknown[]\n}\n\n"
  + "export interface User {\n  id: number\n  email: string | null\n  admin?: boolean\n}")
assert.equal(ts([1, 2]), "export type Root = number[]")
// Identical shapes share one interface; different ones under one name get a suffix
assert.equal((ts({ home: { x: 1 }, work: { x: 2 } }).match(/interface/g) || []).length, 2)
assert.match(ts({ categories: [{ a: 1 }], boxes: [{ b: 1 }] }), /interface Category \{[\s\S]*interface Box \{/)

// ---- JSON ⇄ CSV
const csv = (v) => run("csv", { input: JSON.stringify(v), mode: "to-csv" })
assert.equal(csv([{ a: 1, b: "x,y" }, { a: 2, c: { d: 1 } }]).output, 'a,b,c\n1,"x,y",\n2,,"{""d"":1}"')
assert.equal(csv([[1, 2], ["a", 'q"']]).output, '1,2\na,"q"""')
assert.match(csv([1, 2]).error, /array of objects/)
const fromCsv = (input) => run("csv", { input, mode: "to-json" })
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

// ---- Markdown: GFM subset, escaped, never an <img>, safe links only
const md = (input) => run("markdown", { input, mode: "html" }).output
assert.equal(md("# Title\n\nSome **bold**, *it*, _it_, ~~gone~~ and `<code>`."),
  "<h1>Title</h1>\n<p>Some <b>bold</b>, <i>it</i>, <i>it</i>, <s>gone</s> and <code>&lt;code&gt;</code>.</p>")
assert.equal(md("Title\n====\n\nSub\n---"), "<h1>Title</h1>\n<h2>Sub</h2>")
assert.equal(md("- a\n- b\n  - c\n\n1. x\n2. y"), "<ul><li>a</li><li>b\n<ul><li>c</li></ul></li></ul>\n<ol><li>x</li><li>y</li></ol>")
assert.equal(md("3. three\n4. four"), '<ol start="3"><li>three</li><li>four</li></ol>')
assert.equal(md("- [x] done\n- [ ] todo"), "<ul><li>☑ done</li><li>☐ todo</li></ul>")
assert.equal(md("```js\nif (a < b) {}\n```"), "<p><small>js</small></p><pre>if (a &lt; b) {}</pre>")
assert.equal(md("> quote\n> more"), "<blockquote><p>quote more</p></blockquote>")
assert.equal(md("| a | b |\n|:--|--:|\n| 1 | `x\\|y` |"),
  '<table><tr><th align="left">a</th><th align="right">b</th></tr><tr><td align="left">1</td><td align="right"><code>x|y</code></td></tr></table>')
assert.equal(md("a  \nb"), "<p>a<br>b</p>")
assert.equal(md("***"), "<hr>")
assert.equal(md("\\*not em\\*"), "<p>*not em*</p>")
assert.equal(md("see https://example.com/a."), '<p>see <a href="https://example.com/a">https://example.com/a</a>.</p>')
assert.equal(md("[ok](https://x.y) [rel](docs/a.md) [bad](javascript:alert) [bad2](file:///etc/passwd)"),
  '<p><a href="https://x.y">ok</a> <a href="docs/a.md">rel</a> bad bad2</p>')
// Raw HTML is shown, never interpreted; images never become <img>
const hostile = md('<script>alert(1)</script> <img src=x onerror=alert(1)> ![alt](https://e.com/x.png) <b>hi</b>')
assert.doesNotMatch(hostile, /<(script|img|b)\b/)
assert.match(hostile, /&lt;script&gt;/)
assert.match(hostile, /\[image: alt\]/)
assert.doesNotMatch(md(Array(50).fill("![a](http://t/a.png)").join(" ") + "\n\n> ".repeat(30) + "[x](http://t)"), /<img/i)
// The preview carries theme colours; the HTML to copy does not
const prev = run("markdown", { input: "# Hi", mode: "preview", theme: { accent: "#ff0000", dim: "#888888", code: "#222222", border: "#444444" } })
assert.match(prev.html, /color: #ff0000/)
assert.equal(prev.output, "<h1>Hi</h1>")
assert.equal(run("markdown", { input: "# Hi", mode: "html" }).html, undefined)
assert.match(run("markdown", { input: "x".repeat(200000) }).error, /128 KiB/)
assert.match(run("markdown", { input: "one two three" }).info, /^3 words/)

// ---- Samples: every tool with input has one, and it runs cleanly in every mode
for (const t of T.TOOLS) {
  const modes = t.modes.length ? t.modes.map((m) => m.value) : [""]
  for (const mode of modes) {
    const s = T.sample(t.id, mode)
    // Generators take no input; views and the image readers start from your own data.
    if (t.kind === "generator" || t.kind === "view" || t.id === "qrread" || (t.id === "base64img" && mode === "encode") ||
        (t.id === "hash" && mode === "file")) { assert.equal(s, null, t.id + " " + mode); continue }
    assert.ok(s && s.input, `${t.id} ${mode} has a sample`)
    const r = run(t.id, { ...s, useReplace: !!s.replacement, mode })
    assert.equal(r.error, "", `${t.id} ${mode} sample: ${r.error}`)
    // Job tools finish in bin/devkit-helper (tests/helpers.test.py covers that half).
    if (t.job && r.job) continue
    assert.ok(r.output || (r.pairs && r.pairs.length) || (r.rows && r.rows.length), `${t.id} ${mode} sample has output`)
  }
}
// sample() returns a copy, so loading it cannot change the table
const s1 = T.sample("json", "pretty2"); s1.input = "changed"
assert.notEqual(T.sample("json", "pretty2").input, "changed")
// The sample JWT is genuinely HS256-signed (secret: devkit-sample-secret)
{
  const crypto = await import("node:crypto")
  const [h, p, sig] = T.sample("jwt", "decode").input.split(".")
  assert.equal(crypto.createHmac("sha256", "devkit-sample-secret").update(h + "." + p).digest("base64url"), sig)
}
assert.equal(T.detect(T.sample("markdown", "preview").input), "markdown")
assert.equal(T.detect("# just a heading\nand some text"), "")


// ================================================================ 0.2 tools

// Values from the vm context have that context's prototypes; compare as data.
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m)

// ---- registry: options, placeholders, legacy routes, search
deq(T.legacyRoute("json", "yaml"), { tool: "yaml", mode: "to-yaml" })
deq(T.legacyRoute("json", "from-csv"), { tool: "csv", mode: "to-json" })
assert.equal(T.legacyRoute("json", "minify"), null)
deq(T.toolOptions("jwt", "sign").map((o) => o.id), ["secret", "alg", "secretB64"])
deq(T.toolOptions("jwt", "decode").map((o) => o.id), ["secret", "secretB64"])
deq(T.optionDefaults("lorem"), { count: "3", classic: true })
assert.equal(T.placeholderFor("yaml", "to-json"), "Paste YAML…")
assert.equal(T.searchTools("json")[0].id, "json")
assert.equal(T.searchTools("yaml")[0].id, "yaml")
assert.equal(T.searchTools("sha256")[0].id, "hash")
assert.equal(T.searchTools("snowflake")[0].id, "ids")
assert.equal(T.searchTools("jwt")[0].id, "jwt")
assert.equal(T.searchTools("qr")[0].id, "qr")
assert.ok(T.searchTools("zzzzqqq").length === 0)
assert.equal(T.searchTools("").length, T.TOOLS.length)
assert.equal(T.toolById("nope").id, "json")

// ---- JSON query
const jq = (input, query, mode) => run("json", { input, mode: mode || "minify", opts: { query } })
const doc = JSON.stringify({ items: [{ sku: "a", qty: 1, tags: ["x"] }, { sku: "b", qty: 3 }], meta: { sku: "m", n: null } })
assert.equal(jq(doc, ".items[0].sku").output, '"a"')
assert.equal(jq(doc, "$.items[*].sku").output, '["a","b"]')
assert.equal(jq(doc, ".items[].qty").output, "[1,3]")
assert.equal(jq(doc, "items[-1].sku").output, '"b"')
assert.equal(jq(doc, "..sku").output, '["a","b","m"]')
assert.equal(jq(doc, ".items[?(@.qty > 1)].sku").output, '["b"]')
assert.equal(jq(doc, ".items[?(@.tags)].sku").output, '["a"]')
assert.equal(jq(doc, '.meta["sku"]').output, '"m"')
assert.equal(jq(doc, ".meta.n").output, "null")
assert.equal(jq(doc, ".items[0:1]").output, '[{"sku":"a","qty":1,"tags":["x"]}]')
assert.equal(jq(doc, ".").output, doc)
assert.match(jq(doc, ".missing").info, /No match/)
assert.match(jq(doc, ".items[").error, /unclosed/)

// ---- YAML → JSON
const y2j = (input) => { const r = run("yaml", { input, mode: "to-json" }); return r.error ? r : JSON.parse(r.output) }
deq(y2j("a: 1\nb: [x, 'y', {z: null}]\nc: no\nd: ~\ne: 1.5\nf: '0123'\ng: \"t\\tab\""),
  { a: 1, b: ["x", "y", { z: null }], c: "no", d: null, e: 1.5, f: "0123", g: "t\tab" })
deq(y2j("- a\n- b: 1\n  c: 2\n- - x\n  - y"), ["a", { b: 1, c: 2 }, ["x", "y"]])
deq(y2j("key:\n- 1\n- 2"), { key: [1, 2] })
deq(y2j("base: &b {x: 1, y: 2}\nchild:\n  <<: *b\n  y: 3"), { base: { x: 1, y: 2 }, child: { y: 3, x: 1 } })
deq(y2j("lit: |\n  a\n   b\nfold: >-\n  c\n  d\n"), { lit: "a\n b\n", fold: "c d" })
deq(y2j("url: http://x.y:80/z # comment\nhash: 'a # b'"), { url: "http://x.y:80/z", hash: "a # b" })
deq(y2j("---\na: 1\n---\nb: 2\n"), [{ a: 1 }, { b: 2 }])
deq(y2j("n: 0x10\no: 0o17\nbig: 12e3\ns: !!str 42"), { n: 16, o: 15, big: 12000, s: "42" })
assert.match(y2j("a: b: c").error, /^Line 1:/)
assert.match(y2j("a:\n  b: 1\n   c: 2").error, /^Line 3: Bad indentation/)
assert.match(y2j("a: *nope").error, /Unknown alias/)
assert.match(y2j("a:\n\t- 1").error, /Tabs/)
assert.match(run("yaml", { input: "a: yes", mode: "to-json" }).info, /YAML 1\.2/)
// JSON → YAML → JSON round trip
{
  const v = JSON.parse(T.sample("yaml", "to-yaml").input)
  deq(y2j(run("yaml", { input: JSON.stringify(v), mode: "to-yaml" }).output), v)
  const tricky = { s: "yes", n: "123", e: "", m: "line1\nline2\n", q: "a: b", h: "#x", l: [[]], o: {}, u: "ü" }
  deq(y2j(run("yaml", { input: JSON.stringify(tricky), mode: "to-yaml" }).output), tricky)
}

// ---- JSON → Types
const ty = (v, mode, root) => run("types", { input: JSON.stringify(v), mode, opts: { root } }).output
const order = JSON.parse(T.SAMPLE_ORDER)
assert.match(ty(order, "ts"), /^export interface Root \{/)
assert.match(ty(order, "ts", "order"), /^export interface Order \{/)
const go = ty(order, "go")
assert.match(go, /^type Root struct \{/)
assert.match(go, /\tID +string +`json:"id"`/)
assert.match(go, /\tShippedAt +string +`json:"shipped-at"`/)
assert.match(go, /\tGift +bool +`json:"gift,omitempty"`/)
assert.match(go, /\tQty +int64 /)
assert.match(go, /\tPrice +float64 /)
const rs = ty({ type: "x", userID: 1, "self": true, n: null, list: [1.5] }, "rust")
assert.match(rs, /pub r#type: String,/)
assert.match(rs, /#\[serde\(rename = "userID"\)\]\n    pub user_id: i64,/)
assert.match(rs, /#\[serde\(rename = "self"\)\]\n    pub self_: bool,/)
assert.match(rs, /pub n: serde_json::Value,/)
assert.match(rs, /pub list: Vec<f64>,/)
const zod = ty([{ a: 1, b: "x" }, { a: 2.5 }], "zod")
assert.match(zod, /a: z\.number\(\),/)
assert.match(zod, /b: z\.string\(\)\.optional\(\),/)
assert.match(zod, /export const Root = z\.array\(RootItem\)/)
const schema = JSON.parse(ty([{ a: 1, b: "x" }, { a: 2 }], "schema"))
assert.equal(schema.type, "array")
deq(schema.items.required, ["a"])
assert.equal(schema.items.properties.a.type, "integer")

// ---- XML / HTML / CSS / SQL
const xml = (input, mode) => run("xml", { input, mode: mode || "format" })
assert.equal(xml('<a x="1"><b>t</b><c/></a>').output, '<a x="1"><b>t</b><c /></a>')
assert.equal(xml("<root>" + "<item>value</item>".repeat(8) + "</root>").output.split("\n").length, 10)
assert.match(xml("<a><b></a>").error, /Expected <\/b> but found <\/a> at line 1, column 7/)
assert.match(xml("<a>").error, /<a> is never closed/)
assert.match(xml("<a>1 < 2</a>").error, /Unescaped '<'/)
assert.equal(xml("<a>\n  <b> t </b>\n</a>", "minify").output, "<a><b>t</b></a>")
assert.match(xml("<a/><b/>").info, /More than one root/)
const html = (input, mode) => run("html", { input, mode: mode || "format" })
assert.equal(html("<ul><li>one<li>two</ul>").output, "<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>")
assert.equal(html("<div><p>a<p>b</div>").output, "<div>\n  <p>a</p>\n  <p>b</p>\n</div>")
assert.equal(html("<p>Some <b>bold</b> and <a href=x>a link</a></p>").output, '<p>Some <b>bold</b> and <a href="x">a link</a></p>')
assert.match(html("<pre>  keep\n    this</pre>").output, /  keep\n    this/)
assert.match(html("<script>if (a < b) {}</script>").output, /if \(a < b\) \{\}/)
assert.equal(html("<p>a <b>b</b> <i>c</i></p>", "minify").output, "<p>a <b>b</b> <i>c</i></p>")
assert.equal(html("<div>\n  <p>x</p>\n</div>", "minify").output, "<div><p>x</p></div>")
const css = (input, mode) => run("css", { input, mode: mode || "format" }).output
assert.equal(css("a,b{color:red;margin:0}"), "a,\nb {\n  color: red;\n  margin: 0;\n}")
assert.equal(css("@media (x){a{b:c}}"), "@media (x) {\n  a {\n    b: c;\n  }\n}")
assert.equal(css('a { background: url("x;y.png") }', "minify"), 'a{background:url("x;y.png")}')
assert.equal(css("/* x */ a { color : red ; }\n/*! keep */", "minify"), "a{color:red}/*! keep */")
assert.match(run("css", { input: "a{", mode: "format" }).error, /never closed/)
assert.match(run("css", { input: "a}", mode: "format" }).error, /Unexpected '}'/)
const sql = (input, mode, lower) => run("sql", { input, mode: mode || "format", opts: { lower } }).output
assert.equal(sql("select a, b from t where x = 1 and y between 1 and 2"),
  "SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y BETWEEN 1 AND 2")
assert.equal(sql("SELECT count(*) FROM t", "format", true), "select\n  count(*)\nfrom\n  t")
assert.match(sql("select * from a where id in (select id from b)"), /IN \(\n    SELECT\n      id\n    FROM\n      b\n  \)/)
assert.equal(sql("SELECT a , b FROM t -- c\nWHERE x = 'it''s' AND y::int > 2", "minify"), "SELECT a, b FROM t WHERE x = 'it''s' AND y::int > 2")
assert.match(sql("select 1; select 2;"), /SELECT\n  1;\n\nSELECT\n  2;/)

// ---- HTML preview: only a safe subset survives
const hp = run("htmlpreview", { input: '<h1 onclick="x()">T</h1><a href="javascript:alert(1)">j</a><a href="https://ok">o</a><img src="file:///etc/passwd" alt="pic"><script>alert(1)</script><style>*{}</style><iframe src="https://x"></iframe><p style="x">&lt;b&gt;</p>', mode: "sanitized" })
assert.doesNotMatch(hp.output, /onclick|javascript:|<img|<script|<style|<iframe|file:|style=/)
assert.match(hp.output, /<a href="https:\/\/ok">o<\/a>/)
assert.match(hp.output, /\[image: pic\]/)
assert.match(hp.output, /<p>&lt;b&gt;<\/p>/)
assert.equal(run("htmlpreview", { input: "<b>x</b>", mode: "sanitized" }).html, undefined)
assert.match(run("htmlpreview", { input: "<b>x</b>", mode: "preview", theme: { accent: "#f00", dim: "#888", code: "#222", border: "#444" } }).html, /<b>x<\/b>/)

// ---- Unicode
const uni = run("unicode", { input: "pаy\u200b", mode: "inspect" })
assert.equal(uni.pairs.length, 4)
assert.match(uni.pairs[1][1], /looks like Latin 'a'.*Cyrillic.*UTF-8 D0 B0/)
assert.match(uni.pairs[3][1], /invisible.*ZERO WIDTH SPACE/)
assert.equal(uni.pairs[1][2], "а")      // the copy value is the character itself
assert.equal(uni.urgent, true)
assert.match(uni.info, /mixed scripts: Latin \+ Cyrillic/)
assert.equal(run("unicode", { input: "é😀\n\u200b", mode: "escape-js" }).output, "\\u00E9\\u{1F600}\n\\u200B")
assert.equal(run("unicode", { input: "a\u00a0b\u200bc\ufeff", mode: "strip" }).output, "a bc")
assert.equal(T.unicodeBlock(0x1F600), "Emoji: Emoticons")
assert.equal(T.unicodeBlock(0x41), "Basic Latin")

// ---- ID inspector
const idp = (s, k) => (run("ids", { input: s }).pairs.find((p) => p[0] === k) || [])[1]
assert.match(idp("018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10", "Type"), /v7/)
assert.match(idp("018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10", "Created"), /^2024-04-30T00:32:15\.230Z/)
assert.match(idp("c232ab00-9414-11ec-b3c8-9f6bdeced846", "Created"), /^2022-02-22T19:22:22\.000Z/)
assert.match(idp("f47ac10b-58cc-4372-a567-0e02b2c3d479", "Type"), /v4 · random/)
assert.equal(idp("00000000-0000-0000-0000-000000000000", "Type"), "Nil UUID")
assert.match(idp("01ARZ3NDEKTSV4RRFFQ69G5FAV", "Created"), /^2016-07-30T23:54:10\.259Z/)
assert.match(idp("0ujtsYcgvSTl8PAuAdqWYSMnLOv", "Created"), /^2017-10-10T04:00:47\.000Z/)
assert.match(idp("507f1f77bcf86cd799439011", "Created"), /^2012-10-17T21:13:27\.000Z/)
assert.match(idp("9m4e2mr0ui3e8a215n4g", "Created"), /^2011-03-22T17:50:19\.000Z/)
assert.match(idp("1541815603606036480", "Twitter / X time"), /^2022-06-28T16:07:40\.105Z/)
assert.match(idp("175928847299117063", "Discord time"), /^2016-04-30T11:18:25\.796Z/)
assert.match(run("ids", { input: "hello" }).error, /Not an ID format/)
assert.match(run("ids", { input: "507f1f77bcf86cd799439011\nnope" }).info, /2 IDs: ObjectId · 1 not recognised/)
// A v7 UUID's ULID twin decodes to the same moment
{
  const asUlid = idp("018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10", "As ULID")
  assert.equal(idp(asUlid, "Unix ms"), String(0x018f2c6a9b7e))
}

// ---- Text statistics, Lorem
const st = (s, k) => (run("stats", { input: s }).pairs.find((p) => p[0] === k) || [])[1]
assert.equal(st("Hello world. Bye!\n\nNew", "Words"), "4")
assert.equal(st("Hello world. Bye!\n\nNew", "Sentences"), "2")
assert.equal(st("Hello world. Bye!\n\nNew", "Paragraphs"), "2")
assert.equal(st("héllo 😀", "Characters"), "7  (8 UTF-16 units)")
assert.equal(st("héllo 😀", "Bytes (UTF-8)"), "11")
assert.equal(st("日本語 テキスト", "Words"), "2")
const lorem = (mode, count, seed, classic) => run("lorem", { mode, opts: { count, seed, classic } }).output
assert.equal(lorem("paragraphs", 3, 7).split("\n\n").length, 3)
assert.match(lorem("paragraphs", 1, 7), /^Lorem ipsum dolor sit amet, consectetur adipiscing elit, /)
assert.equal(lorem("words", 5, 7).split(" ").length, 5)
assert.equal(lorem("words", 3, 7, true), "lorem ipsum dolor")
assert.equal(lorem("sentences", 4, 9), lorem("sentences", 4, 9))         // seeded: stable
assert.notEqual(lorem("sentences", 4, 9, false), lorem("sentences", 4, 10, false))

// ---- Passwords: token alphabets
const tok = (mode, length) => run("password", { mode, length, count: 3, randomBytes: secure(4000) }).output.split("\n")
for (const t of tok("hex", 32)) assert.match(t, /^[0-9a-f]{32}$/)
for (const t of tok("base64url", 43)) assert.match(t, /^[A-Za-z0-9_-]{43}$/)
for (const t of tok("pin", 6)) assert.match(t, /^\d{6}$/)
for (const t of tok("alnum", 20)) assert.match(t, /^[A-Za-z0-9]{20}$/)
assert.match(run("password", { mode: "pin", length: 6, count: 1, randomBytes: zeros(100) }).info, /6 digits · 19 bits each · weak/)

// ---- Case: one variant per line (chain steps)
assert.equal(run("case", { input: "user id\nAccount Name", mode: "snake_case" }).output, "user_id\naccount_name")
assert.equal(T.CASE_NAMES.length, T.caseVariants("a b").length)

// ---- JWT: verification and signing hand off to the helper
{
  const jv = run("jwt", { input: T.SAMPLE_JWT, mode: "decode", opts: { secret: "devkit-sample-secret" } })
  assert.equal(jv.job.cmd, "jwt-verify")
  assert.equal(jv.job.payload.alg, "HS256")
  assert.equal(jv.job.payload.signingInput, T.SAMPLE_JWT.split(".").slice(0, 2).join("."))
  const ok = T.finish("jwt", { mode: "decode" }, jv, { valid: true })
  assert.match(ok.output, /✓ Signature verified \(HS256\)$/)
  assert.match(ok.info, /✓ signature valid/)
  const bad = T.finish("jwt", { mode: "decode" }, jv, { valid: false })
  assert.match(bad.info, /✗ invalid signature/)
  assert.equal(bad.urgent, true)
  assert.match(run("jwt", { input: T.SAMPLE_JWT, mode: "payload" }).output, /"name": "Ada Lovelace"/)
  const none = [b64u({ alg: "none" }), b64u({ sub: 1 }), ""].join(".")
  assert.match(run("jwt", { input: none, mode: "decode" }).info, /unsigned/)
  assert.equal(run("jwt", { input: none, mode: "decode" }).urgent, true)
  const sign = run("jwt", { input: '{"sub":"42"}', mode: "sign", opts: { secret: "s", alg: "HS384" } })
  assert.equal(sign.job.cmd, "jwt-sign")
  assert.equal(sign.job.payload.signingInput, b64u({ alg: "HS384", typ: "JWT" }) + "." + b64u({ sub: "42" }))
  const crypto = await import("node:crypto")
  const sig = crypto.createHmac("sha384", "s").update(sign.job.payload.signingInput).digest("base64url")
  assert.equal(T.finish("jwt", { mode: "sign" }, sign, { signature: sig }).output, sign.job.payload.signingInput + "." + sig)
  assert.match(run("jwt", { input: "[1]", mode: "sign", opts: { secret: "s" } }).error, /JSON object/)
}

// ---- Hash: digests from the helper, compared with what you expect
{
  const hp2 = run("hash", { input: "abc", mode: "text", opts: {} })
  deq(hp2.job, { cmd: "hash", payload: { key: "", text: "abc" } })
  deq(run("hash", { input: " ~/x.iso ", mode: "file", opts: {} }).job.payload, { key: "", path: "~/x.iso" })
  const resp = { digests: { md5: "900150983cd24fb0d6963f7d28e17f72", sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                            sha384: "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7", crc32: "352441c2" }, bytes: 3, hmac: false }
  const hr = T.finish("hash", { mode: "text", opts: {} }, hp2, resp)
  deq(hr.pairs.map((p) => p[0]), ["MD5", "SHA-256", "SHA-384", "CRC32", "SRI"])
  assert.equal(hr.pairs[4][1], "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn")
  const ok = T.finish("hash", { mode: "text", opts: { expect: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  abc.txt" } }, hp2, resp)
  assert.equal(ok.info, "✓ Matches SHA-256")
  assert.equal(T.finish("hash", { mode: "text", opts: { expect: "deadbeef" } }, hp2, resp).urgent, true)
  assert.equal(T.finish("hash", { mode: "text", opts: { expect: "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn" } }, hp2, resp).info, "✓ Matches SHA-384")
  assert.equal(T.finish("hash", { mode: "text", opts: { upper: true } }, hp2, resp).pairs[0][1], "900150983CD24FB0D6963F7D28E17F72")
  assert.equal(T.finish("hash", { mode: "text", opts: { base64: true } }, hp2, resp).pairs[0][1], "kAFQmDzST7DWlj99KOF/cg==")
  assert.match(T.finish("hash", { mode: "text", opts: {} }, hp2, { digests: { sha256: "00" }, bytes: 3, hmac: true }).pairs[0][0], /^HMAC-SHA-256$/)
}

// ---- QR: Wi-Fi payloads and capacity
assert.equal(T.qrPayload("p@ss;word", "wifi", { ssid: "Café, \"Home\"", security: "WPA" }), 'WIFI:T:WPA;S:Café\\, \\"Home\\";P:p@ss\\;word;;')
assert.equal(T.qrPayload("", "wifi", { ssid: "Open", security: "nopass", hidden: true }), "WIFI:T:nopass;S:Open;H:true;;")
deq(run("qr", { input: "hi", mode: "text", opts: { level: "H" } }).job, { cmd: "qr", payload: { text: "hi", level: "H" } })
assert.match(run("qr", { input: "x".repeat(1300), mode: "text", opts: { level: "H" } }).error, /more than a QR code holds at level H/)
assert.equal(T.finish("qrread", {}, {}, { codes: [{ type: "QR-Code", data: "WIFI:T:WPA;S:Home;P:se\\;cret;;" }] }).pairs[1][1], "se;cret")

// ---- Base64 image: the type comes from the bytes, not the label
{
  const r = run("base64img", { input: "data:image/jpeg;base64," + T.SAMPLE_PNG, mode: "decode" })
  assert.equal(r.sniffed, "image/png")
  assert.equal(r.declared, "image/jpeg")
  const done = T.finish("base64img", { mode: "decode" }, r, { path: "/run/x.png", mime: "image/png", width: 2, height: 2, bytes: 79 })
  assert.match(done.pairs.find((p) => p[0] === "⚠ Declared")[1], /image\/jpeg, but the bytes are image\/png/)
  assert.equal(done.image, "/run/x.png")
  assert.equal(run("base64img", { input: 'url("data:image/png;base64,' + T.SAMPLE_PNG + '")', mode: "decode" }).sniffed, "image/png")
  assert.equal(run("base64img", { input: T.SAMPLE_PNG, mode: "decode" }).sniffed, "image/png")
  const svg = run("base64img", { input: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'), mode: "decode" })
  assert.equal(svg.sniffed, "image/svg+xml")
  assert.match(run("base64img", { input: "data:text/plain;base64,aGVsbG8gd29ybGQgdGhpcyBpcyB0ZXh0", mode: "decode" }).error, /not an image/)
  const enc = T.finish("base64img", { mode: "encode" }, {}, { base64: "AAAA", mime: "image/png", width: 1, height: 1, bytes: 3, path: "/p" })
  assert.equal(enc.output, "data:image/png;base64,AAAA")
  assert.equal(enc.pairs.find((p) => p[0] === "CSS")[2], 'url("data:image/png;base64,AAAA")')
}

// ---- Chains
{
  const c = T.chainRun([{ tool: "url", mode: "decode" }, { tool: "base64", mode: "decode" }, { tool: "json", mode: "minify", opts: { query: ".a" } }],
    encodeURIComponent(Buffer.from('{"a": [1, 2]}').toString("base64")), NOW, false)
  assert.equal(c.error, "")
  assert.equal(c.output, "[1,2]")
  assert.equal(c.steps.length, 3)
  const broken = T.chainRun([{ tool: "base64", mode: "decode" }, { tool: "json", mode: "pretty2" }], "aGVsbG8=", NOW, false)
  assert.equal(broken.failedAt, 1)
  assert.match(broken.error, /^Step 2 \(JSON\): /)
  assert.match(T.chainRun([{ tool: "regex", mode: "matches", opts: { pattern: "a" } }], "a", NOW, false).steps[0].error, /worker/)
  assert.equal(T.chainRun([{ tool: "regex", mode: "matches", opts: { pattern: "\\d+", flags: "g" } }], "a1 b22", NOW, true).output, "1\n22")
  assert.equal(T.chainRun([{ tool: "regex", mode: "group", opts: { pattern: "(\\w)=", flags: "g" } }], "a= b=", NOW, true).output, "a\nb")
  assert.equal(T.chainRun([{ tool: "regex", mode: "replace", opts: { pattern: "o", flags: "g", replacement: "0" } }], "foo", NOW, true).output, "f00")
  assert.match(T.chainRun([{ tool: "hash", mode: "text" }], "x", NOW, false).error, /cannot be a chain step/)
  assert.equal(T.chainNeedsWorker([{ tool: "url" }, { tool: "regex" }]), true)
  assert.equal(T.chainNeedsWorker([{ tool: "url" }]), false)
  assert.ok(T.chainTools().every((t) => t.kind !== "image" && t.kind !== "generator" && t.chain !== false))
  assert.ok(T.chainTools().some((t) => t.id === "jwt"))
  deq(T.chainStep("regex"), { tool: "regex", mode: "matches", opts: { flags: "g" } })
  deq(T.chainModes("jwt").map((m) => m.value), ["payload", "header", "decode"])
  deq(T.chainOptions("jwt", "payload"), [])
  // Every built-in chain runs cleanly on its own sample
  for (const ch of T.DEFAULT_CHAINS) {
    const input = ch.input !== undefined ? ch.input : T.SAMPLE_JWT
    const r = T.chainRun(ch.steps, input, NOW, true)
    assert.equal(r.error, "", ch.name + ": " + r.error)
    assert.ok(r.output.length > 0, ch.name)
  }
}

// ---- Detection for the new tools
for (const [s, t] of [
  ["data:image/png;base64," + T.SAMPLE_PNG, "base64img"], ["018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10", "ids"],
  ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "ids"], ["507f1f77bcf86cd799439011", "ids"], ["<?xml version=\"1.0\"?><a/>", "xml"],
  ["<note><to>x</to></note>", "xml"], ["<div><p>x</p></div>", "html"], ["<!DOCTYPE html><html></html>", "html"],
  ["SELECT id FROM users WHERE x = 1", "sql"], ["a{color:red}", "css"], [".btn { margin: 0 }", "css"],
  ["name: devkit\nversion: 2\ntags:\n  - a", "yaml"], ["---\na: 1\nb: 2", "yaml"], ["pаypal.com", "unicode"],
  ["{a: 1, // c\n}", "json"], ["hello\u200bworld", "unicode"]]) assert.equal(T.detect(s), t, s)
for (const s of ["Content of a note: hello", "select a sentence please", "<b>"]) assert.notEqual(T.detect(s), "sql", s)
assert.equal(T.detectMode("yaml", "a: 1"), "to-json")
assert.equal(T.detectMode("url", "https://x"), "parse")
assert.equal(T.detectMode("url", "a%20b"), "decode")

console.log("tools.test.mjs: ok")
