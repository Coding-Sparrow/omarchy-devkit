// DevKit tool logic. Pure functions only: no QML, no I/O, no globals beyond
// the ECMAScript built-ins, so the same file loads in the Quickshell V4 engine
// and in node's vm for tests (tests/tools.test.mjs).

var TOOLS = [
  { id: "json", badge: "{ }", name: "JSON", description: "Format, minify, validate and sort JSON",
    modes: [{ value: "pretty2", label: "Format 2" }, { value: "pretty4", label: "Format 4" },
            { value: "minify", label: "Minify" }, { value: "sort", label: "Sort keys" },
            { value: "yaml", label: "→ YAML" }, { value: "ts", label: "→ TS" },
            { value: "csv", label: "→ CSV" }, { value: "from-csv", label: "CSV →" }],
    placeholder: "Paste JSON… (or CSV for CSV →)" },
  { id: "jwt", badge: "JWT", name: "JWT Decoder", description: "Decode header, payload and time claims (signature is not verified)",
    modes: [], placeholder: "Paste a JWT (eyJ…)" },
  { id: "base64", badge: "B64", name: "Base64", description: "Encode and decode Base64 / Base64URL (UTF-8)",
    modes: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" },
            { value: "encode-url", label: "Encode URL-safe" }],
    placeholder: "Text to encode, or Base64 to decode…" },
  { id: "url", badge: "%", name: "URL", description: "Encode, decode and break down URLs and query strings",
    modes: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" },
            { value: "parse", label: "Parse" }],
    placeholder: "https://example.com/path?q=hello%20world" },
  { id: "time", badge: "TS", name: "Timestamp", description: "Unix epoch ⇄ human dates (s, ms, µs, ns, ISO 8601)",
    modes: [], placeholder: "1700000000, 1700000000000, 2024-05-01T10:00:00Z or empty for now" },
  { id: "uuid", badge: "ID", name: "UUID", description: "Generate UUID v4 / v7 and ULIDs",
    modes: [{ value: "v4", label: "v4 random" }, { value: "v7", label: "v7 time-ordered" }, { value: "ulid", label: "ULID" }],
    placeholder: "" },
  { id: "hash", badge: "#", name: "Hash", description: "MD5, SHA-1, SHA-256, SHA-512 of UTF-8 text",
    modes: [], placeholder: "Text to hash…" },
  { id: "case", badge: "Aa", name: "Case Converter", description: "camelCase, snake_case, kebab-case and friends",
    modes: [], placeholder: "some variable name" },
  { id: "regex", badge: ".*", name: "Regex Tester", description: "Test JavaScript regular expressions, groups and replace",
    modes: [], placeholder: "Test text…" },
  { id: "diff", badge: "±", name: "Text Diff", description: "Line-by-line diff of two texts",
    modes: [], placeholder: "Original text…" },
  { id: "password", badge: "PW", name: "Password Generator", description: "CSPRNG passwords; letter sets skip I and l",
    // Tools past the tenth have no Ctrl+digit key, so they name their own.
    shortcut: "Ctrl+Shift+P", modes: [], placeholder: "" },
  { id: "cron", badge: "CR", name: "Cron", description: "Explain a cron expression and list its next runs",
    shortcut: "Ctrl+Shift+R",
    modes: [{ value: "local", label: "Local time" }, { value: "utc", label: "UTC" }],
    placeholder: "*/15 9-17 * * 1-5   (minute hour day month weekday), or @daily" },
  { id: "escape", badge: "\\n", name: "Escape", description: "HTML entities, string escapes and shell quoting",
    shortcut: "Ctrl+Shift+E",
    modes: [{ value: "html", label: "HTML encode" }, { value: "html-decode", label: "HTML decode" },
            { value: "escape", label: "Escape string" }, { value: "unescape", label: "Unescape" },
            { value: "shell", label: "Shell quote" }],
    placeholder: "Text to escape, or &lt;escaped&gt; text to decode…" },
  { id: "number", badge: "0x", name: "Number Base", description: "Decimal, hex, octal and binary, exact at any size",
    shortcut: "Ctrl+Shift+N",
    modes: [{ value: "auto", label: "Auto" }, { value: "dec", label: "From dec" }, { value: "hex", label: "From hex" },
            { value: "oct", label: "From oct" }, { value: "bin", label: "From bin" }],
    placeholder: "255, 0xff, 0b1111_1111, 0o377, -1 or a 128-bit hex value" },
  { id: "color", badge: "RGB", name: "Color", description: "HEX, RGB, HSL, OKLCH and Hyprland colours, with contrast",
    shortcut: "Ctrl+Shift+O", modes: [],
    placeholder: "#ff8800, rgb(255 136 0), hsl(32 100% 50%), oklch(70% 0.2 50), rgba(ff8800ff) or tomato" },
  { id: "lines", badge: "≡", name: "Lines", description: "Sort, dedupe, count and clean up lines, with text stats",
    shortcut: "Ctrl+Shift+L",
    modes: [{ value: "sort", label: "Sort" }, { value: "sort-desc", label: "Sort ↓" }, { value: "unique", label: "Unique" },
            { value: "count", label: "Count" }, { value: "reverse", label: "Reverse" }, { value: "trim", label: "Trim" }],
    placeholder: "One item per line…" },
  { id: "markdown", badge: "MD", name: "Markdown", description: "Live GitHub-flavoured preview, and Markdown to HTML",
    shortcut: "Ctrl+Shift+M",
    modes: [{ value: "preview", label: "Preview" }, { value: "html", label: "HTML" }],
    placeholder: "# Paste Markdown…" }
]

function toolById(id) {
  for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]
  return TOOLS[0]
}

function result(output, error, info) {
  return { output: output || "", error: error || "", info: info || "" }
}

// Labelled values, rendered as click-to-copy rows. `output` stays a plain
// aligned text version for "Copy all".
function withPairs(pairs, info) {
  var width = 0
  pairs.forEach(function (p) { width = Math.max(width, p[0].length) })
  var text = pairs.map(function (p) { return (p[0] + new Array(width + 3).join(" ")).slice(0, width + 2) + p[1] }).join("\n")
  return { output: text, error: "", info: info || "", pairs: pairs }
}

// ---------------------------------------------------------------- UTF-8

function utf8Encode(str) {
  var out = []
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var d = str.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

// Returns null when the bytes are not valid UTF-8.
function utf8Decode(bytes) {
  var out = ""
  for (var i = 0; i < bytes.length;) {
    var b = bytes[i], cp, n
    if (b < 0x80) { cp = b; n = 0 }
    else if ((b & 0xe0) === 0xc0) { cp = b & 31; n = 1 }
    else if ((b & 0xf0) === 0xe0) { cp = b & 15; n = 2 }
    else if ((b & 0xf8) === 0xf0) { cp = b & 7; n = 3 }
    else return null
    for (var k = 1; k <= n; k++) {
      var cb = bytes[i + k]
      if (cb === undefined || (cb & 0xc0) !== 0x80) return null
      cp = (cp << 6) | (cb & 63)
    }
    i += n + 1
    if (cp > 0xffff) { cp -= 0x10000; out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)) }
    else out += String.fromCharCode(cp)
  }
  return out
}

function isPrintable(text) {
  // Allow tabs/newlines; reject other C0 controls, which mean "binary".
  return !/[\x00-\x08\x0e-\x1f\x7f]/.test(text)
}

// ---------------------------------------------------------------- Base64

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function base64FromBytes(bytes, urlSafe) {
  var out = ""
  for (var i = 0; i < bytes.length; i += 3) {
    var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    var n = (a << 16) | ((b || 0) << 8) | (c || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += b === undefined ? "=" : B64[(n >> 6) & 63]
    out += c === undefined ? "=" : B64[n & 63]
  }
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return out
}

// Accepts standard or URL-safe alphabets, missing padding and whitespace.
// Returns null when the input is not Base64.
function bytesFromBase64(text) {
  var s = String(text).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")
  s = s.replace(/=+$/, "")
  if (s.length === 0 || s.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(s)) return null
  var out = []
  var bits = 0, value = 0
  for (var i = 0; i < s.length; i++) {
    value = (value << 6) | B64.indexOf(s[i])
    bits += 6
    if (bits >= 8) { bits -= 8; out.push((value >> bits) & 255) }
  }
  return out
}

function base64Tool(input, mode) {
  if (input === "") return result()
  if (mode === "encode" || mode === "encode-url") {
    var bytes = utf8Encode(input)
    return result(base64FromBytes(bytes, mode === "encode-url"), "", bytes.length + " bytes in")
  }
  var decoded = bytesFromBase64(input)
  if (!decoded) return result("", "Not valid Base64")
  var text = utf8Decode(decoded)
  if (text === null || !isPrintable(text)) {
    var hex = []
    for (var i = 0; i < Math.min(decoded.length, 512); i++) hex.push(("0" + decoded[i].toString(16)).slice(-2))
    return result(hex.join(" ") + (decoded.length > 512 ? " …" : ""), "", "binary, " + decoded.length + " bytes (hex)")
  }
  return result(text, "", decoded.length + " bytes")
}

// ---------------------------------------------------------------- JSON

// A small strict parser used only to report *where* invalid JSON breaks,
// because engine error messages differ (V4 vs V8) and rarely give a line.
function jsonErrorLocation(text) {
  var i = 0
  function fail(msg) { throw { at: i, msg: msg } }
  function ws() { while (i < text.length && " \t\n\r".indexOf(text[i]) !== -1) i++ }
  function value() {
    ws()
    var ch = text[i]
    if (ch === "{") return object()
    if (ch === "[") return array()
    if (ch === "\"") return string()
    if (ch === "-" || (ch >= "0" && ch <= "9")) return number()
    if (text.substr(i, 4) === "true") { i += 4; return }
    if (text.substr(i, 5) === "false") { i += 5; return }
    if (text.substr(i, 4) === "null") { i += 4; return }
    fail(ch === undefined ? "Unexpected end of input" : "Unexpected character '" + ch + "'")
  }
  function object() {
    i++; ws()
    if (text[i] === "}") { i++; return }
    for (;;) {
      ws(); if (text[i] !== "\"") fail("Expected a double-quoted key")
      string(); ws()
      if (text[i] !== ":") fail("Expected ':' after key")
      i++; value(); ws()
      if (text[i] === ",") { i++; ws(); if (text[i] === "}") fail("Trailing comma"); continue }
      if (text[i] === "}") { i++; return }
      fail("Expected ',' or '}'")
    }
  }
  function array() {
    i++; ws()
    if (text[i] === "]") { i++; return }
    for (;;) {
      value(); ws()
      if (text[i] === ",") { i++; ws(); if (text[i] === "]") fail("Trailing comma"); continue }
      if (text[i] === "]") { i++; return }
      fail("Expected ',' or ']'")
    }
  }
  function string() {
    i++
    while (i < text.length) {
      var ch = text[i]
      if (ch === "\"") { i++; return }
      if (ch === "\\") { i += 2; continue }
      if (ch === "\n") fail("Unterminated string")
      i++
    }
    fail("Unterminated string")
  }
  function digits() {
    var start = i
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i++
    return i - start
  }
  function number() {
    if (text[i] === "-") i++
    if (text[i] === "0") i++
    else if (digits() === 0) fail("Invalid number")
    if (text[i] === ".") { i++; if (digits() === 0) fail("Invalid number") }
    if (text[i] === "e" || text[i] === "E") {
      i++
      if (text[i] === "+" || text[i] === "-") i++
      if (digits() === 0) fail("Invalid number")
    }
  }
  try {
    value(); ws()
    if (i < text.length) fail("Unexpected content after JSON value")
    return null
  } catch (e) {
    if (e && e.msg === undefined) throw e
    var before = text.slice(0, e.at)
    var line = before.split("\n").length
    var col = e.at - before.lastIndexOf("\n")
    return e.msg + " at line " + line + ", column " + col
  }
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object") {
    var out = {}
    Object.keys(value).sort().forEach(function (k) { out[k] = sortKeysDeep(value[k]) })
    return out
  }
  return value
}

function jsonStats(value) {
  var keys = 0, depth = 0
  function walk(v, d) {
    if (d > depth) depth = d
    if (Array.isArray(v)) v.forEach(function (x) { walk(x, d + 1) })
    else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { keys++; walk(v[k], d + 1) })
  }
  walk(value, 0)
  return keys + " keys, depth " + depth
}

function jsonTool(input, mode) {
  if (input.trim() === "") return result()
  if (mode === "from-csv") return csvToJson(input)
  var parsed
  try { parsed = JSON.parse(input) } catch (e) {
    return result("", jsonErrorLocation(input) || String(e.message || e))
  }
  var out
  if ((mode === "yaml" || mode === "ts") && tooDeep(parsed, CONVERT_DEPTH_MAX))
    return result("", "Nested more than " + CONVERT_DEPTH_MAX + " levels deep")
  if (mode === "yaml") return result(toYaml(parsed), "", "YAML · " + jsonStats(parsed))
  if (mode === "ts") return result(toTypeScript(parsed), "", "TypeScript inferred from this sample")
  if (mode === "csv") {
    var csv = toCsv(parsed)
    if (csv.error) return result("", csv.error)
    return result(csv.text, "", csv.rows + " rows" + (csv.cols ? " × " + csv.cols + " columns" : ""))
  }
  if (mode === "minify") out = JSON.stringify(parsed)
  else if (mode === "sort") out = JSON.stringify(sortKeysDeep(parsed), null, 2)
  else out = JSON.stringify(parsed, null, mode === "pretty4" ? 4 : 2)
  return result(out, "", "Valid JSON · " + jsonStats(parsed))
}

// ---------------------------------------------------------------- Time

function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n }

function relative(ms, nowMs) {
  var diff = Math.round((ms - nowMs) / 1000)
  var abs = Math.abs(diff)
  var units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]
  if (abs < 5) return "just now"
  for (var i = 0; i < units.length; i++) {
    if (abs >= units[i][1]) {
      var n = Math.floor(abs / units[i][1])
      var label = n + " " + units[i][0] + (n === 1 ? "" : "s")
      return diff < 0 ? label + " ago" : "in " + label
    }
  }
  return "just now"
}

function localIso(d) {
  var off = -d.getTimezoneOffset()
  var sign = off >= 0 ? "+" : "-"
  off = Math.abs(off)
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " "
    + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
    + " (UTC" + sign + pad(Math.floor(off / 60)) + ":" + pad(off % 60) + ")"
}

// Parse epoch in s/ms/µs/ns (by magnitude) or any Date-parsable string.
function parseTime(input, nowMs) {
  var s = String(input).trim()
  if (s === "" || s.toLowerCase() === "now") return { ms: nowMs, unit: "now" }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    var n = Number(s), digits = s.replace(/^-/, "").split(".")[0].length
    if (digits <= 11) return { ms: n * 1000, unit: "seconds" }
    if (digits <= 14) return { ms: n, unit: "milliseconds" }
    if (digits <= 17) return { ms: n / 1000, unit: "microseconds" }
    return { ms: n / 1e6, unit: "nanoseconds" }
  }
  var t = Date.parse(s)
  if (isNaN(t)) return null
  return { ms: t, unit: "date string" }
}

function timeTool(input, nowMs) {
  var p = parseTime(input, nowMs)
  if (!p) return result("", "Could not read that as an epoch or a date")
  var d = new Date(p.ms)
  if (isNaN(d.getTime())) return result("", "Date out of range")
  var pairs = [
    ["Unix (s)", String(Math.floor(p.ms / 1000))],
    ["Unix (ms)", String(Math.floor(p.ms))],
    ["ISO 8601 UTC", d.toISOString()],
    ["Local", localIso(d)],
    ["RFC 2822", d.toUTCString()],
    ["Relative", relative(p.ms, nowMs)],
    ["Day of week", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()]]
  ]
  return withPairs(pairs, "Read as " + p.unit)
}

// ---------------------------------------------------------------- Cron

// Standard 5-field cron (crontab, Kubernetes, GitHub Actions): minute hour
// day-of-month month day-of-week, with lists, ranges, steps, names and macros.
var CRON_MAX = 1000             // real expressions are a few dozen characters
var CRON_RUNS = 10
var CRON_HORIZON_YEARS = 10     // Feb 29 schedules can skip 8 years (2096 → 2104)
var CRON_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
var CRON_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
                   "August", "September", "October", "November", "December"]
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var CRON_MACROS = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *"
}
var CRON_FIELDS = [
  { name: "Minute", min: 0, max: 59 },
  { name: "Hour", min: 0, max: 23 },
  { name: "Day of month", min: 1, max: 31 },
  { name: "Month", min: 1, max: 12, names: CRON_MONTHS },
  { name: "Day of week", min: 0, max: 7, names: CRON_DAYS }   // 0 and 7 are both Sunday
]
// Starting points for building an expression; the description updates as you edit.
var CRON_PRESETS = [
  { label: "Every 5 min", expr: "*/5 * * * *" },
  { label: "Hourly", expr: "0 * * * *" },
  { label: "Daily 09:00", expr: "0 9 * * *" },
  { label: "Weekdays 09:00", expr: "0 9 * * 1-5" },
  { label: "Monthly", expr: "0 0 1 * *" }
]

function cronValue(text, field) {
  if (/^\d+$/.test(text)) return Number(text)
  if (field.names) {
    var i = field.names.indexOf(text.toUpperCase())
    if (i >= 0) return i + field.min
  }
  return NaN
}

// One field into its parts and a lookup table; throws a readable message.
function cronField(text, field) {
  // `?` (Quartz "no specific value") reads as `*`. Both count as unrestricted
  // for the day-of-month / day-of-week rule below, with or without a step.
  text = text.replace(/^\?/, "*")
  var star = text.charAt(0) === "*"
  if (/[LW#]/i.test(field.names ? text.replace(/[A-Za-z]{3}/g, function (n) { return field.names.indexOf(n.toUpperCase()) >= 0 ? "" : n }) : text))
    throw field.name + ": L, W and # are Quartz extensions, not standard cron"
  var set = [], parts = []
  text.split(",").forEach(function (part) {
    if (part === "") throw field.name + ": empty item in a list"
    var bits = part.split("/")
    if (bits.length > 2) throw field.name + ": \"" + part + "\" has more than one /"
    var step = 1
    if (bits.length === 2) {
      if (!/^\d+$/.test(bits[1]) || Number(bits[1]) < 1) throw field.name + ": step \"" + bits[1] + "\" must be a positive number"
      step = Number(bits[1])
    }
    var lo, hi, kind
    if (bits[0] === "*") { lo = field.min; hi = field.max === 7 ? 6 : field.max; kind = "all" }
    else {
      var range = bits[0].split("-")
      if (range.length > 2) throw field.name + ": \"" + bits[0] + "\" is not a range"
      lo = cronValue(range[0], field)
      // "5/15" means "from 5, every 15", like "5-59/15".
      hi = range.length === 2 ? cronValue(range[1], field) : (bits.length === 2 ? field.max : lo)
      if (isNaN(lo) || isNaN(hi)) throw field.name + ": \"" + part + "\" is not a valid value"
      var bad = lo < field.min || lo > field.max ? lo : (hi < field.min || hi > field.max ? hi : null)
      if (bad !== null) throw field.name + ": " + bad + " is out of range (" + field.min + "–" + field.max + ")"
      if (lo > hi) throw field.name + ": range " + bits[0] + " goes backwards"
      kind = range.length === 2 || bits.length === 2 ? "range" : "value"
    }
    for (var v = lo; v <= hi; v += step) set[field.max === 7 && v === 7 ? 0 : v] = true
    parts.push({ kind: kind, lo: lo, hi: hi, step: step })
  })
  var values = []
  var top = field.max === 7 ? 6 : field.max    // 7 was folded into 0
  for (var v = field.min; v <= top; v++) if (set[v]) values.push(v)
  var size = top - field.min + 1
  return { text: text, star: star, set: set, values: values, parts: parts, all: values.length === size }
}

// Returns { fields, command, expr } or { error }. A crontab line may carry a
// command after the five fields; it is shown, never run.
function parseCron(line) {
  var s = String(line).trim()
  if (s.charAt(0) === "@") {
    var name = s.split(/\s+/)[0].toLowerCase()
    if (name === "@reboot") return { error: "@reboot runs once when cron starts; it has no schedule" }
    if (!CRON_MACROS.hasOwnProperty(name)) return { error: "Unknown macro " + name + " (use @yearly, @monthly, @weekly, @daily or @hourly)" }
    var rest = s.slice(name.length).trim()
    s = CRON_MACROS[name] + (rest ? " " + rest : "")
  }
  var tokens = s.split(/\s+/)
  if (tokens.length < 5) return { error: "Expected 5 fields (minute hour day month weekday); found " + tokens.length }
  if ((tokens.length === 6 || tokens.length === 7) && tokens.every(function (t) { return /^[\d*?,\/LW#-]+$/i.test(t) }))
    return { error: "Looks like Quartz/Spring cron with a seconds field; DevKit reads the standard 5-field format" }
  var fields = []
  try {
    for (var i = 0; i < 5; i++) fields.push(cronField(tokens[i], CRON_FIELDS[i]))
  } catch (e) {
    return { error: String(e) }
  }
  return { fields: fields, expr: tokens.slice(0, 5).join(" "), command: tokens.slice(5).join(" ") }
}

function cronDaysIn(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate() }

// Classic cron rule: when both day fields are restricted (neither starts with
// *), a day matches if EITHER matches; otherwise both must.
function cronDayMatches(f, y, mo, d) {
  var dom = !!f[2].set[d], wd = !!f[4].set[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
  return f[2].star || f[4].star ? dom && wd : dom || wd
}

// Next runs strictly after fromMs. Walks the calendar field by field, so a
// rare schedule costs a few thousand day checks, not millions of minutes.
function cronNext(f, fromMs, count, utc) {
  var s = new Date(Math.floor(fromMs / 60000) * 60000 + 60000)
  var sy = utc ? s.getUTCFullYear() : s.getFullYear()
  var smo = (utc ? s.getUTCMonth() : s.getMonth()) + 1
  var sd = utc ? s.getUTCDate() : s.getDate()
  var sh = utc ? s.getUTCHours() : s.getHours()
  var smi = utc ? s.getUTCMinutes() : s.getMinutes()
  var runs = []
  for (var y = sy; y <= sy + CRON_HORIZON_YEARS; y++) {
    for (var mo = y === sy ? smo : 1; mo <= 12; mo++) {
      if (!f[3].set[mo]) continue
      var firstMonth = y === sy && mo === smo
      for (var d = firstMonth ? sd : 1; d <= cronDaysIn(y, mo); d++) {
        if (!cronDayMatches(f, y, mo, d)) continue
        var today = firstMonth && d === sd
        for (var h = today ? sh : 0; h < 24; h++) {
          if (!f[1].set[h]) continue
          for (var mi = today && h === sh ? smi : 0; mi < 60; mi++) {
            if (!f[0].set[mi]) continue
            var ms = utc ? Date.UTC(y, mo - 1, d, h, mi) : new Date(y, mo - 1, d, h, mi).getTime()
            // A local time skipped by a DST change does not exist; skip it.
            if (!utc) { var t = new Date(ms); if (t.getHours() !== h || t.getMinutes() !== mi) continue }
            if (ms <= fromMs) continue
            runs.push(ms)
            if (runs.length >= count) return runs
          }
        }
      }
    }
  }
  return runs
}

function cronJoin(items) {
  if (items.length <= 1) return items.join("")
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1]
}

function cronName(v, i) {
  if (i === 3) return MONTH_NAMES[v - 1]
  if (i === 4) return DAY_NAMES[v % 7]
  return String(v)
}

// One field's parts in words: "every 2 hours", "Monday through Friday", "1 and 15"…
function cronParts(field, i, unit) {
  // Stepped months and weekdays read better as names: "in January and March".
  if (i >= 3 && field.parts.some(function (p) { return p.step > 1 }))
    return cronJoin(field.values.map(function (v) { return cronName(v, i) }))
  return cronJoin(field.parts.map(function (p) {
    var lo = cronName(p.lo, i), hi = cronName(p.hi, i)
    if (p.kind === "all") return p.step === 1 ? "every " + unit : "every " + p.step + " " + unit + "s"
    if (p.kind === "value") return i === 1 ? pad(p.lo) + ":00" : lo
    var span = i === 1 ? "between " + pad(p.lo) + ":00 and " + pad(p.hi) + ":59" : lo + " through " + hi
    if (p.step === 1) return span
    return "every " + p.step + " " + unit + "s " + (i === 1 ? span : "from " + span)
  }))
}

function cronDescribe(f) {
  var m = f[0], h = f[1], out = []
  var singles = function (x) { return x.parts.every(function (p) { return p.kind === "value" }) }
  var everyAll = function (x) { return x.parts.length === 1 && x.parts[0].kind === "all" }
  if (singles(m) && singles(h) && m.values.length * h.values.length <= 4) {
    var times = []
    h.values.forEach(function (hv) { m.values.forEach(function (mv) { times.push(pad(hv) + ":" + pad(mv)) }) })
    out.push("At " + cronJoin(times))
  } else {
    if (everyAll(m)) out.push(m.parts[0].step === 1 ? "Every minute" : "Every " + m.parts[0].step + " minutes")
    else if (singles(m)) out.push("At minute " + cronJoin(m.values.map(String)))
    else if (m.parts.length === 1 && m.parts[0].step > 1)
      out.push("Every " + m.parts[0].step + " minutes from minute " + m.parts[0].lo + " through " + m.parts[0].hi)
    else out.push("At " + cronParts(m, 0, "minute").replace(/(^|, | and )(\d+) through/g, "$1minutes $2 through"))
    if (everyAll(h) && h.parts[0].step === 1) { if (!everyAll(m)) out[0] += " past every hour" }
    else if (singles(h)) out.push(h.values.length === 1 ? "between " + pad(h.values[0]) + ":00 and " + pad(h.values[0]) + ":59"
                                                        : "during hours " + cronJoin(h.values.map(function (v) { return pad(v) })))
    else out.push(cronParts(h, 1, "hour"))
  }
  var dom = f[2], dow = f[4]
  var domText = everyAll(dom) ? cronParts(dom, 2, "day") : "on day " + cronParts(dom, 2, "day") + " of the month"
  var dowText = "on " + cronParts(dow, 4, "day")
  if (!dom.all && !dow.all) out.push(dom.star || dow.star ? domText + ", only if it is a " + cronJoin(dow.values.map(function (v) { return DAY_NAMES[v] }))
                                                          : domText + " or " + dowText)
  else if (!dom.all) out.push(domText)
  else if (!dow.all) out.push(dowText)
  if (!f[3].all) out.push("in " + cronParts(f[3], 3, "month"))
  return out.join(", ")
}

function cronValues(field, i) {
  if (field.all) return "every"
  var shown = field.values.slice(0, 12).map(function (v) { return i >= 3 ? cronName(v, i).slice(0, 3) : String(v) })
  return shown.join(", ") + (field.values.length > 12 ? ", … (" + field.values.length + " values)" : "")
}

function cronWhen(ms, nowMs, utc) {
  var d = new Date(ms)
  var g = function (local, u) { return utc ? d[u]() : d[local]() }
  return g("getFullYear", "getUTCFullYear") + "-" + pad(g("getMonth", "getUTCMonth") + 1) + "-" + pad(g("getDate", "getUTCDate"))
    + " " + pad(g("getHours", "getUTCHours")) + ":" + pad(g("getMinutes", "getUTCMinutes"))
    + " " + DAY_NAMES[g("getDay", "getUTCDay")].slice(0, 3) + "   " + relative(ms, nowMs)
}

function cronTool(input, mode, nowMs) {
  if (input.length > CRON_MAX) return result("", "Too long for a cron expression (" + CRON_MAX + " characters max)")
  // Accept a pasted crontab: read the first line that is not a comment or a
  // VAR=value setting.
  var lines = input.split("\n").map(function (l) { return l.trim() })
                   .filter(function (l) { return l !== "" && l.charAt(0) !== "#" && !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l) })
  if (lines.length === 0) return result("", "", "Enter a cron expression or pick a preset")
  var c = parseCron(lines[0])
  if (c.error) return result("", c.error)
  var utc = mode === "utc"
  var f = c.fields
  var pairs = [["Description", cronDescribe(f)]]
  for (var i = 0; i < 5; i++) pairs.push([CRON_FIELDS[i].name, f[i].text + "  →  " + cronValues(f[i], i)])
  if (c.command) pairs.push(["Command", c.command])
  var runs = cronNext(f, nowMs, CRON_RUNS, utc)
  runs.forEach(function (ms, k) { pairs.push(["Next " + (k + 1), cronWhen(ms, nowMs, utc)]) })
  var off = -new Date(nowMs).getTimezoneOffset()
  var zone = utc ? "UTC" : "local time (UTC" + (off >= 0 ? "+" : "-") + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60) + ")"
  var info = (lines.length > 1 ? "First of " + lines.length + " lines · " : "") + "Next runs in " + zone
  var r = withPairs(pairs, runs.length ? info : "Never runs: no matching date in the next " + CRON_HORIZON_YEARS + " years")
  if (!runs.length) r.urgent = true
  return r
}

// ---------------------------------------------------------------- JWT

function jwtTool(input, nowMs) {
  var token = input.trim().replace(/^Bearer\s+/i, "")
  if (token === "") return result()
  var parts = token.split(".")
  if (parts.length !== 3) return result("", "A JWT has three dot-separated parts; found " + parts.length)
  function part(idx, name) {
    var bytes = bytesFromBase64(parts[idx])
    var text = bytes && utf8Decode(bytes)
    if (text === null || text === undefined) throw name + " is not valid Base64URL"
    try { return JSON.parse(text) } catch (e) { throw name + " is not JSON" }
  }
  var header, payload
  try { header = part(0, "Header"); payload = part(1, "Payload") } catch (e) { return result("", String(e)) }

  var lines = ["HEADER", JSON.stringify(header, null, 2), "", "PAYLOAD", JSON.stringify(payload, null, 2), ""]
  var claims = []
  var status = ""
  ;["iat", "nbf", "exp"].forEach(function (k) {
    if (typeof payload[k] !== "number") return
    var ms = payload[k] * 1000
    claims.push((k + ":    ").slice(0, 5) + " " + new Date(ms).toISOString() + "  (" + relative(ms, nowMs) + ")")
  })
  if (typeof payload.exp === "number") status = payload.exp * 1000 < nowMs ? "EXPIRED" : "not expired"
  if (typeof payload.nbf === "number" && payload.nbf * 1000 > nowMs) status = "NOT YET VALID"
  if (claims.length) lines.push("TIME CLAIMS", claims.join("\n"), "")
  lines.push("SIGNATURE", parts[2] || "(none)", "", "Signature NOT verified — that needs the signing key.")
  var info = (header.alg ? header.alg : "?") + (status ? " · " + status : "")
  return { output: lines.join("\n"), error: "", info: info, urgent: status === "EXPIRED" || status === "NOT YET VALID" }
}

// ---------------------------------------------------------------- URL

function safeDecode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, " ")) } catch (e) { return s }
}

function urlTool(input, mode) {
  if (input === "") return result()
  if (mode === "encode") return result(encodeURIComponent(input))
  if (mode === "decode") {
    try { return result(decodeURIComponent(input.replace(/\+/g, " "))) } catch (e) { return result("", "Malformed percent-encoding") }
  }
  var s = input.trim()
  var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^@\/?#]*)@)?([^\/?#:]*|\[[^\]]*\])(?::(\d+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(s)
  var query, lines = []
  if (m) {
    lines.push("Scheme    " + m[1])
    if (m[2]) lines.push("User      " + safeDecode(m[2]))
    lines.push("Host      " + m[3])
    if (m[4]) lines.push("Port      " + m[4])
    lines.push("Path      " + (safeDecode(m[5]) || "/"))
    if (m[7] !== undefined) lines.push("Fragment  " + safeDecode(m[7]))
    query = m[6]
  } else {
    query = s.replace(/^\?/, "")
    if (query.indexOf("=") === -1) return result("", "Not a URL or query string")
  }
  if (query) {
    lines.push("", "QUERY PARAMETERS")
    query.split("&").forEach(function (pair) {
      if (!pair) return
      var eq = pair.indexOf("=")
      var k = safeDecode(eq === -1 ? pair : pair.slice(0, eq))
      var v = eq === -1 ? "" : safeDecode(pair.slice(eq + 1))
      lines.push("  " + k + " = " + v)
    })
  }
  return result(lines.join("\n"))
}

// ---------------------------------------------------------------- UUID

function hexBytes(bytes) {
  var h = ""
  for (var i = 0; i < bytes.length; i++) h += ("0" + bytes[i].toString(16)).slice(-2)
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20)
}

// `random` is exactly 16 bytes (0..255) from a CSPRNG. There is deliberately
// no Math.random() path: callers must supply secure bytes or get an error.
function uuid(version, nowMs, random) {
  var b = random.slice(0, 16)
  if (version === "v7") {
    var ms = Math.floor(nowMs)
    for (var j = 5; j >= 0; j--) { b[j] = ms % 256; ms = Math.floor(ms / 256) }
    b[6] = 0x70 | (b[6] & 0x0f)
  } else {
    b[6] = 0x40 | (b[6] & 0x0f)
  }
  b[8] = 0x80 | (b[8] & 0x3f)
  return hexBytes(b)
}

var UUID_MAX = 500

function uuidCount(count) {
  return Math.max(1, Math.min(UUID_MAX, Math.floor(Number(count) || 1)))
}

// Bytes of CSPRNG output needed for `count` UUIDs.
function uuidBytesNeeded(count) {
  return uuidCount(count) * 16
}

function uuidTool(mode, count, nowMs, randomBytes, upper) {
  var n = uuidCount(count)
  var bytes = randomBytes || []
  if (bytes.length < n * 16) return result("", "Waiting for secure random bytes…")
  for (var k = 0; k < n * 16; k++) {
    if (typeof bytes[k] !== "number" || bytes[k] < 0 || bytes[k] > 255 || bytes[k] !== Math.floor(bytes[k]))
      return result("", "Invalid random bytes")
  }
  if (mode === "ulid") return result(ulids(n, nowMs, bytes).join("\n"), "", n + " × ULID" + (n > 1 ? " · sorted" : ""))
  var out = []
  for (var i = 0; i < n; i++) out.push(uuid(mode, nowMs, bytes.slice(i * 16, i * 16 + 16)))
  var text = out.join("\n")
  return result(upper ? text.toUpperCase() : text, "", n + " × UUID " + (mode === "v7" ? "v7" : "v4"))
}

// ---------------------------------------------------------------- Password

// The letter sets skip the look-alikes "I" and "l", which read as the digit 1
// on their own.
var PASSWORD_SETS = {
  upper: "ABCDEFGHJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "0123456789",
  special: "!@#$%^&*"
}

var PASSWORD_LENGTH_MAX = 128
var PASSWORD_LENGTH_DEFAULT = 16
var PASSWORD_COUNT_MAX = 100
// count × length is capped so a single CSPRNG request can always cover a draw.
var PASSWORD_MAX_CHARS = 8192
// Below this many bits a result is called out as weak.
var PASSWORD_WEAK_BITS = 60

function passwordCount(count) {
  return Math.max(1, Math.min(PASSWORD_COUNT_MAX, Math.floor(Number(count) || 1)))
}

// An empty or unreadable length — the moment a field is cleared to retype it —
// falls back to the default rather than generating a 1-character password.
function passwordLength(length) {
  var n = Math.floor(Number(length))
  if (!isFinite(n) || n < 1) n = PASSWORD_LENGTH_DEFAULT
  return Math.min(PASSWORD_LENGTH_MAX, n)
}

// The exclude field is comma-separated. Each token's characters are dropped;
// whitespace and empty tokens are ignored, so "O,0" excludes both and "abc"
// excludes all three.
function passwordExcluded(text) {
  var out = ""
  String(text === undefined || text === null ? "" : text).split(",").forEach(function (token) {
    token = token.trim()
    for (var i = 0; i < token.length; i++) if (out.indexOf(token[i]) === -1) out += token[i]
  })
  return out
}

// Selected character sets with excluded characters removed. A set that ends
// up empty (fully excluded) drops out, so every returned set is usable.
function passwordAlphabet(opts) {
  var excluded = passwordExcluded(opts.exclude)
  var selected = []
  if (opts.upper) selected.push(PASSWORD_SETS.upper)
  if (opts.lower) selected.push(PASSWORD_SETS.lower)
  if (opts.digits) selected.push(PASSWORD_SETS.digits)
  if (opts.special) selected.push(PASSWORD_SETS.special)
  var sets = []
  selected.forEach(function (set) {
    var kept = ""
    for (var i = 0; i < set.length; i++) if (excluded.indexOf(set[i]) === -1) kept += set[i]
    if (kept.length) sets.push(kept)
  })
  return sets
}

function passwordValidate(opts) {
  if (passwordAlphabet(opts).length === 0)
    return "Select at least one character set (excluded characters may have emptied them)"
  if (passwordCount(opts.count) * passwordLength(opts.length) > PASSWORD_MAX_CHARS)
    return "Too many characters at once (" + PASSWORD_MAX_CHARS + " max)"
  return ""
}

// Bytes of CSPRNG output a request may consume: two bytes per draw plus the
// fixed work per password, with roughly 50% headroom over rejection sampling.
function passwordBytesNeeded(count, length) {
  return Math.min(65536, passwordCount(count) * (passwordLength(length) * 6 + 32))
}

// Unbiased draw in [0, k) from the byte stream, or -1 when it runs dry.
// Rejection sampling keeps every character equally likely; for the alphabets
// here (k ≤ ~95) the rejection chance per draw is under 0.15%.
function passwordDraw(state, k) {
  var limit = Math.floor(65536 / k) * k
  while (state.pos + 2 <= state.bytes.length) {
    var v = (state.bytes[state.pos] << 8) | state.bytes[state.pos + 1]
    state.pos += 2
    if (v < limit) return v % k
  }
  return -1
}

function passwordShuffle(state, items) {
  for (var i = items.length - 1; i > 0; i--) {
    var j = passwordDraw(state, i + 1)
    if (j < 0) return false
    var t = items[i]; items[i] = items[j]; items[j] = t
  }
  return true
}

// One password: a character from every selected set, filled to `length` from
// the combined alphabet, then shuffled so the guaranteed characters are not
// stuck at the front. Returns null when the byte stream runs out.
function passwordOne(sets, length, state) {
  var groups = sets.slice(0)
  if (!passwordShuffle(state, groups)) return null
  var chars = []
  for (var s = 0; s < groups.length && chars.length < length; s++) {
    var idx = passwordDraw(state, groups[s].length)
    if (idx < 0) return null
    chars.push(groups[s][idx])
  }
  var flat = sets.join("")
  while (chars.length < length) {
    var k = passwordDraw(state, flat.length)
    if (k < 0) return null
    chars.push(flat[k])
  }
  if (!passwordShuffle(state, chars)) return null
  return chars.join("")
}

// `randomBytes` must come from a CSPRNG. Like UUIDs there is no Math.random()
// path: too few bytes yields a "waiting" error, never a weaker password.
function passwordTool(opts, randomBytes) {
  var invalid = passwordValidate(opts)
  if (invalid) return result("", invalid)
  var bytes = randomBytes || []
  for (var b = 0; b < bytes.length; b++) {
    if (typeof bytes[b] !== "number" || bytes[b] < 0 || bytes[b] > 255 || bytes[b] !== Math.floor(bytes[b]))
      return result("", "Invalid random bytes")
  }
  var sets = passwordAlphabet(opts)
  var count = passwordCount(opts.count)
  var length = passwordLength(opts.length)
  var state = { bytes: bytes, pos: 0 }
  var out = []
  for (var i = 0; i < count; i++) {
    var pw = passwordOne(sets, length, state)
    if (pw === null) return result("", "Waiting for secure random bytes…")
    out.push(pw)
  }
  var alphabet = sets.join("").length
  var bits = Math.floor(length * Math.log(alphabet) / Math.LN2)
  var weak = bits < PASSWORD_WEAK_BITS
  return { output: out.join("\n"), error: "",
           info: count + " × " + length + " chars · " + bits + " bits each" + (weak ? " · weak" : ""),
           urgent: weak }
}

// ---------------------------------------------------------------- Case

var CASE_MAX = 10000

// Every pattern here is linear: no quantified group is followed by an
// overlapping one, so pasted input cannot trigger backtracking blowups.
function splitWords(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])(?=[A-Z][a-z])/g, "$1 ")
    .split(/[^A-Za-z0-9]+/)
    .filter(function (w) { return w.length > 0 })
    .map(function (w) { return w.toLowerCase() })
}

function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1) }

function caseVariants(input) {
  var w = splitWords(input)
  if (!w.length) return []
  return [
    ["camelCase", w[0] + w.slice(1).map(cap).join("")],
    ["PascalCase", w.map(cap).join("")],
    ["snake_case", w.join("_")],
    ["SCREAMING_SNAKE", w.join("_").toUpperCase()],
    ["kebab-case", w.join("-")],
    ["Train-Case", w.map(cap).join("-")],
    ["dot.case", w.join(".")],
    ["path/case", w.join("/")],
    ["Title Case", w.map(cap).join(" ")],
    ["Sentence case", cap(w.join(" "))],
    ["lower case", w.join(" ")],
    ["UPPER CASE", w.join(" ").toUpperCase()]
  ]
}

function caseTool(input) {
  if (input.trim() === "") return result()
  if (input.length > CASE_MAX) return result("", "Case conversion is for identifiers and short text (" + CASE_MAX + " characters max)")
  var v = caseVariants(input)
  if (!v.length) return result("", "No words found")
  return withPairs(v, "")
}

// ---------------------------------------------------------------- Regex

// Names of capturing groups by index (1-based; "" for unnamed), read from
// the pattern itself. Qt's V4 engine accepts (?<name>…) but does not fill
// match.groups or expand $<name>, so we cannot rely on the engine for this.
function groupNames(pattern) {
  var names = [""]
  var inClass = false
  for (var i = 0; i < pattern.length; i++) {
    var ch = pattern[i]
    if (ch === "\\") { i++; continue }
    if (inClass) { if (ch === "]") inClass = false; continue }
    if (ch === "[") { inClass = true; continue }
    if (ch !== "(") continue
    if (pattern[i + 1] !== "?") { names.push(""); continue }
    var named = /^\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i + 1))
    if (named) names.push(named[1])
    // Anything else after "(?" — (?: (?= (?! (?<= (?<! — does not capture.
  }
  return names.slice(1)
}

// A quantified group that itself contains a quantifier, e.g. (a+)+ or (.*a){20}.
// Such patterns can exhaust the engine's backtracking budget. Qt's V4 engine
// then reports "no match" instead of an error, so we warn about it. Linear:
// one pass over the (short) pattern.
function hasNestedQuantifier(pattern) {
  var stack = [], inClass = false
  for (var i = 0; i < pattern.length; i++) {
    var ch = pattern[i]
    if (ch === "\\") { i++; continue }
    if (inClass) { if (ch === "]") inClass = false; continue }
    if (ch === "[") { inClass = true; continue }
    if (ch === "(") { stack.push(false); continue }
    if ((ch === "*" || ch === "+" || ch === "{") && stack.length) stack[stack.length - 1] = true
    if (ch === ")" && stack.length) {
      var innerQuantified = stack.pop()
      var next = pattern[i + 1]
      if (innerQuantified && (next === "*" || next === "+" || next === "{")) return true
      if (innerQuantified && stack.length) stack[stack.length - 1] = true
    }
  }
  return false
}

// Rewrite $<name> to $N so named replacements work on every engine.
function expandNamedReplacement(replacement, names) {
  return replacement.replace(/\$\$|\$<([^>]*)>/g, function (all, name) {
    if (all === "$$") return all
    var idx = names.indexOf(name)
    return idx === -1 ? all : "$" + (idx + 1)
  })
}

// Runs user-supplied patterns, so it can backtrack catastrophically. The shell
// never calls this directly: bin/devkit-regex runs it in a separate `qml`
// process under a hard deadline and kills it on timeout.
var REGEX_MAX = 200000

function regexTool(pattern, flags, text, replacement, useReplace) {
  if (pattern === "") return result("", "", "Enter a pattern")
  if (text.length > REGEX_MAX) return result("", "Text too large for live matching (" + REGEX_MAX + " characters max)")
  var re
  try { re = new RegExp(pattern, flags.replace(/g/g, "") + "g") } catch (e) { return result("", String(e.message || e)) }
  if (useReplace) {
    var replaced
    try {
      replaced = text.replace(flags.indexOf("g") !== -1 ? re : new RegExp(pattern, flags.replace(/g/g, "")),
        expandNamedReplacement(replacement, groupNames(pattern)))
    } catch (e2) { return result("", String(e2.message || e2)) }
    return result(replaced, "", "Replaced")
  }
  var lines = [], count = 0, m
  var names = groupNames(pattern)
  while ((m = re.exec(text)) !== null) {
    count++
    if (count <= 200) {
      var lineNo = text.slice(0, m.index).split("\n").length
      lines.push("#" + count + "  line " + lineNo + ", index " + m.index + "  " + JSON.stringify(m[0]))
      for (var g = 1; g < m.length; g++) {
        var label = names[g - 1] ? "$" + g + " <" + names[g - 1] + ">" : "$" + g
        lines.push("     " + label + " = " + (m[g] === undefined ? "undefined" : JSON.stringify(m[g])))
      }
    }
    if (m[0] === "") re.lastIndex++
    if (count >= 10000) break
    if (flags.indexOf("g") === -1) break
  }
  if (count > 200) lines.push("… " + (count - 200) + " more")
  if (count === 0 && hasNestedQuantifier(pattern))
    return result("", "", "No matches (possible false negative: engine backtracking limit)")
  return result(lines.join("\n"), "", count === 0 ? "No matches" : count + (count === 1 ? " match" : " matches"))
}

// ---------------------------------------------------------------- Diff

// Returns [{ t: " " | "-" | "+", s: line }]. LCS on lines; fine for the
// sizes people paste into a desktop tool (capped to keep the shell responsive).
function diffLines(a, b) {
  var x = a === "" ? [] : a.split("\n"), y = b === "" ? [] : b.split("\n")
  // Trim the common prefix/suffix first so the table stays small.
  var pre = 0
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++
  var suf = 0
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++
  var xm = x.slice(pre, x.length - suf), ym = y.slice(pre, y.length - suf)
  if (xm.length * ym.length > 4000000) return null
  var n = xm.length, m = ym.length
  var dp = []
  for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1)); for (var j = 0; j <= m; j++) dp[i][j] = 0 }
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
    dp[i][j] = xm[i] === ym[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  var out = []
  for (var p = 0; p < pre; p++) out.push({ t: " ", s: x[p] })
  i = 0; j = 0
  while (i < n && j < m) {
    if (xm[i] === ym[j]) { out.push({ t: " ", s: xm[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "-", s: xm[i++] })
    else out.push({ t: "+", s: ym[j++] })
  }
  while (i < n) out.push({ t: "-", s: xm[i++] })
  while (j < m) out.push({ t: "+", s: ym[j++] })
  for (var q = x.length - suf; q < x.length; q++) out.push({ t: " ", s: x[q] })
  return out
}

function diffTool(a, b) {
  if (a === "" && b === "") return { output: "", error: "", info: "", rows: [] }
  var rows = diffLines(a, b)
  if (!rows) return { output: "", error: "Too large to diff here", info: "", rows: [] }
  var add = 0, del = 0
  rows.forEach(function (r) { if (r.t === "+") add++; else if (r.t === "-") del++ })
  var text = rows.map(function (r) { return r.t + " " + r.s }).join("\n")
  return { output: text, error: "", info: add === 0 && del === 0 ? "Identical" : "+" + add + "  −" + del, rows: rows }
}

// ---------------------------------------------------------------- JSON ⇄ YAML / TypeScript / CSV

var CONVERT_DEPTH_MAX = 200    // recursion depth for the emitters below

function tooDeep(value, max) {
  // Iterative, so a hostile document cannot overflow the stack while checking.
  var stack = [[value, 0]]
  while (stack.length) {
    var top = stack.pop(), v = top[0], d = top[1]
    if (d > max) return true
    if (v && typeof v === "object") {
      var keys = Object.keys(v)
      for (var i = 0; i < keys.length; i++) if (v[keys[i]] && typeof v[keys[i]] === "object") stack.push([v[keys[i]], d + 1])
    }
  }
  return false
}

// YAML 1.1 readers (PyYAML, older Kubernetes tooling) turn these into booleans
// or nulls, so they are always quoted, even though YAML 1.2 would not need it.
var YAML_RESERVED = /^(true|false|yes|no|on|off|y|n|null|~|\.nan|\.inf|-\.inf|<<)$/i

function yamlScalarString(s) {
  if (s !== "" && !YAML_RESERVED.test(s) && /^[A-Za-z_\/][A-Za-z0-9_.\/@-]*( [A-Za-z0-9_.\/@()-]+)*$/.test(s)) return s
  return JSON.stringify(s)   // JSON strings are valid YAML double-quoted scalars
}

function yamlBlock(s, indent) {
  // A literal block keeps multi-line text readable. Only used when it
  // round-trips exactly; otherwise the quoted form is the safe fallback.
  if (/[\x00-\x08\x0b-\x1f\x7f]|[ \t]\n|^[ \t]|[ \t]$/.test(s) || /\n\n+$/.test(s)) return null
  var chomp = /\n$/.test(s) ? "|" : "|-"
  var body = s.replace(/\n$/, "").split("\n").map(function (l) { return l === "" ? "" : indent + l }).join("\n")
  return chomp + "\n" + body
}

function yamlValue(v, indent) {
  if (v === null) return "null"
  if (typeof v === "boolean" || typeof v === "number") return String(v)
  if (typeof v === "string") {
    if (v.indexOf("\n") !== -1) { var b = yamlBlock(v, indent + "  "); if (b) return b }
    return yamlScalarString(v)
  }
  return null
}

function yamlEmit(v, indent, out) {
  if (Array.isArray(v)) {
    v.forEach(function (item) {
      if (item && typeof item === "object" && Object.keys(item).length) {
        var lines = []
        yamlEmit(item, indent + "  ", lines)
        lines[0] = indent + "- " + lines[0].slice(indent.length + 2)
        Array.prototype.push.apply(out, lines)
      } else {
        out.push(indent + "- " + yamlInline(item, indent + "  "))
      }
    })
    return
  }
  Object.keys(v).forEach(function (k) {
    var item = v[k], key = yamlScalarString(k)
    if (item && typeof item === "object" && Object.keys(item).length) {
      out.push(indent + key + ":")
      yamlEmit(item, Array.isArray(item) ? indent : indent + "  ", out)
    } else {
      out.push(indent + key + ": " + yamlInline(item, indent))
    }
  })
}

function yamlInline(v, indent) {
  if (Array.isArray(v)) return "[]"
  if (v && typeof v === "object") return "{}"
  return yamlValue(v, indent)
}

function toYaml(value) {
  if (!value || typeof value !== "object" || !Object.keys(value).length) return yamlInline(value, "")
  var out = []
  yamlEmit(value, "", out)
  return out.join("\n")
}

// TypeScript from a sample. Arrays merge their elements, so a field missing
// from some objects becomes optional and one that is sometimes null becomes
// `| null`. Identical shapes share one interface.
function tsShape() { return { prims: {}, obj: null, arr: null, emptyArr: false } }

function tsAdd(shape, v) {
  if (v === null) shape.prims["null"] = true
  else if (Array.isArray(v)) {
    if (!shape.arr) shape.arr = tsShape()
    if (v.length === 0) shape.emptyArr = true
    v.forEach(function (x) { tsAdd(shape.arr, x) })
  } else if (typeof v === "object") {
    if (!shape.obj) shape.obj = { total: 0, order: [], fields: {} }
    var o = shape.obj
    o.total++
    Object.keys(v).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(o.fields, k)) { o.fields[k] = { count: 0, shape: tsShape() }; o.order.push(k) }
      o.fields[k].count++
      tsAdd(o.fields[k].shape, v[k])
    })
  } else shape.prims[typeof v] = true
}

function tsName(key) {
  var words = String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(function (w) { return w })
  var name = words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1) }).join("")
  if (!name) name = "Item"
  if (/^[0-9]/.test(name)) name = "T" + name
  return name
}

function tsSingular(name) {
  if (/ies$/.test(name)) return name.slice(0, -3) + "y"
  if (/(ss|x|ch|sh)es$/.test(name)) return name.slice(0, -2)
  if (/[^s]s$/.test(name)) return name.slice(0, -1)
  return name + "Item"
}

function toTypeScript(value) {
  var shape = tsShape()
  tsAdd(shape, value)
  var decls = [], bySignature = {}, usedNames = {}

  function typeOf(s, hint) {
    var parts = []
    if (s.obj) parts.push(iface(s.obj, hint))
    if (s.arr) {
      var el = typeOf(s.arr, tsSingular(hint))
      if (el === "never") el = "unknown"
      parts.push(/[|]/.test(el) ? "(" + el + ")[]" : el + "[]")
    }
    ;["string", "number", "boolean"].forEach(function (p) { if (s.prims[p]) parts.push(p) })
    if (s.prims["null"]) parts.push("null")
    return parts.length ? parts.join(" | ") : "never"
  }

  function iface(o, hint) {
    var body = o.order.map(function (k) {
      var f = o.fields[k]
      var key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)
      var t = typeOf(f.shape, tsName(k))
      return "  " + key + (f.count < o.total ? "?" : "") + ": " + (t === "never" ? "unknown" : t)
    }).join("\n")
    if (Object.prototype.hasOwnProperty.call(bySignature, body)) return bySignature[body]
    var name = hint, n = 2
    while (usedNames[name]) name = hint + n++
    usedNames[name] = true
    bySignature[body] = name
    decls.push("export interface " + name + " {\n" + body + (body ? "\n" : "") + "}")
    return name
  }

  var root = typeOf(shape, "Root")
  if (!shape.obj) decls.push("export type Root = " + (root === "never" ? "unknown" : root))
  // Root first, then nested types in the order they were found.
  decls.sort(function (a, b) { return (/^export (interface|type) Root\b/.test(b) ? 1 : 0) - (/^export (interface|type) Root\b/.test(a) ? 1 : 0) })
  return decls.join("\n\n")
}

function csvCell(v) {
  var s = v === null || v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v))
  return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function toCsv(value) {
  if (!Array.isArray(value)) value = [value]
  if (value.length === 0) return { error: "Nothing to write: the array is empty" }
  if (value.every(Array.isArray)) return { text: value.map(function (r) { return r.map(csvCell).join(",") }).join("\n"), rows: value.length }
  if (!value.every(function (r) { return r && typeof r === "object" && !Array.isArray(r) }))
    return { error: "CSV needs an array of objects (or of arrays)" }
  var cols = [], seen = {}
  value.forEach(function (r) { Object.keys(r).forEach(function (k) { if (!seen.hasOwnProperty(k)) { seen[k] = true; cols.push(k) } }) })
  var lines = [cols.map(csvCell).join(",")]
  value.forEach(function (r) { lines.push(cols.map(function (c) { return csvCell(r.hasOwnProperty(c) ? r[c] : null) }).join(",")) })
  return { text: lines.join("\n"), rows: value.length, cols: cols.length }
}

// RFC 4180, with the delimiter sniffed from the first line (comma, tab or
// semicolon). Single pass, so it stays linear on any input.
function parseCsv(text) {
  var first = text.split("\n", 1)[0]
  var counts = { ",": 0, "\t": 0, ";": 0 }, q = false
  for (var i = 0; i < first.length; i++) {
    var ch = first.charAt(i)
    if (ch === '"') q = !q
    else if (!q && counts.hasOwnProperty(ch)) counts[ch]++
  }
  var delim = counts["\t"] > counts[","] && counts["\t"] >= counts[";"] ? "\t" : (counts[";"] > counts[","] ? ";" : ",")
  var rows = [], row = [], cell = "", quoted = false, j = 0, n = text.length
  while (j < n) {
    if (quoted) {
      // Copy everything up to the next quote in one slice.
      var qi = text.indexOf('"', j)
      if (qi === -1) { j = n; break }
      cell += text.slice(j, qi)
      if (text.charAt(qi + 1) === '"') { cell += '"'; j = qi + 2 }
      else { quoted = false; j = qi + 1 }
      continue
    }
    var c = text.charAt(j)
    if (c === '"' && cell === "") { quoted = true; j++; continue }
    if (c === delim) { row.push(cell); cell = ""; j++; continue }
    if (c === "\r" && text.charAt(j + 1) === "\n") { j++; continue }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; j++; continue }
    // An unquoted run: up to the next delimiter, quote or line break.
    var end = j + 1
    while (end < n) {
      var e = text.charAt(end)
      if (e === delim || e === "\n" || e === "\r" || e === '"') break
      end++
    }
    cell += text.slice(j, end)
    j = end
  }
  if (quoted) return { error: "Unclosed quote in the CSV" }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row) }
  return { rows: rows, delim: delim }
}

// Only canonical numbers and true/false become typed: "00123" stays a string.
function csvTyped(s) {
  if (s === "") return null
  if (s === "true" || s === "false") return s === "true"
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s)
  return s
}

function csvToJson(input) {
  var p = parseCsv(input)
  if (p.error) return result("", p.error)
  if (p.rows.length < 1) return result()
  var header = p.rows[0].map(function (h, i) { return h.trim() || "column" + (i + 1) })
  var out = p.rows.slice(1).filter(function (r) { return !(r.length === 1 && r[0] === "") }).map(function (r) {
    var o = {}
    header.forEach(function (h, i) { o[h] = csvTyped(i < r.length ? r[i] : "") })
    return o
  })
  var names = { ",": "comma", "\t": "tab", ";": "semicolon" }
  return result(JSON.stringify(out, null, 2), "", out.length + " rows × " + header.length + " columns · " + names[p.delim] + "-separated")
}

// ---------------------------------------------------------------- Escape

var HTML_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•",
  middot: "·", deg: "°", plusmn: "±", times: "×", divide: "÷", euro: "€", pound: "£", yen: "¥", cent: "¢",
  sect: "§", para: "¶", laquo: "«", raquo: "»", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
  ne: "≠", le: "≤", ge: "≥", infin: "∞", micro: "µ", frac12: "½", frac14: "¼", frac34: "¾", sup2: "²",
  sup3: "³", iexcl: "¡", iquest: "¿", shy: "\u00ad", zwj: "\u200d", zwnj: "\u200c", ensp: "\u2002",
  emsp: "\u2003", thinsp: "\u2009", dagger: "†", Dagger: "‡", permil: "‰", prime: "′", check: "✓"
}

// The HTML 4 Latin-1 names, in code point order from U+00A0.
;("nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute "
  + "micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig "
  + "Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash "
  + "Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc "
  + "euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml "
  + "yacute thorn yuml").split(" ").forEach(function (name, i) { HTML_ENTITIES[name] = String.fromCharCode(0xa0 + i) })

function codePoint(n) {
  if (!(n >= 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff)) return null
  return String.fromCodePoint(n)
}

function htmlDecode(s) {
  var unknown = 0, count = 0
  var out = s.replace(/&(#[xX][0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, function (m, body) {
    var ch = null
    if (body.charAt(0) === "#") ch = codePoint(/^#[xX]/.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10))
    else if (HTML_ENTITIES.hasOwnProperty(body)) ch = HTML_ENTITIES[body]
    if (ch === null) { unknown++; return m }
    count++
    return ch
  })
  return { text: out, count: count, unknown: unknown }
}

function htmlEncode(s) {
  var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }
  return s.replace(/[&<>"']/g, function (c) { return map[c] })
}

// JavaScript/JSON-style string escapes. Non-ASCII stays as is: it is valid in
// every modern string literal and far easier to read.
function stringEscape(s) {
  return s.replace(/[\\"\u0000-\u001f\u007f\u2028\u2029]/g, function (c) {
    var m = { "\\": "\\\\", "\"": "\\\"", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" }
    return m[c] || "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4)
  })
}

function stringUnescape(s) {
  var bad = ""
  var t = s.replace(/^"([\s\S]*)"$/, "$1").replace(/\\(u\{[0-9A-Fa-f]{1,6}\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|[0-7]{1,3}|[\s\S])/g, function (m, e) {
    var simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "\\": "\\", "\"": "\"", "'": "'", "/": "/", "`": "`", "\n": "" }
    if (simple.hasOwnProperty(e)) return simple[e]
    if (e.charAt(0) === "u" && e.charAt(1) === "{") { var c = codePoint(parseInt(e.slice(2, -1), 16)); if (c !== null) return c }
    else if (e.charAt(0) === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16))
    else if (e.charAt(0) === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16))
    else if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8) & 255)
    if (!bad) bad = m
    return e
  })
  return { text: t, bad: bad }
}

// POSIX single quotes: nothing inside is special, so the result is safe to
// paste into sh, bash or zsh as one argument.
function shellQuote(s) {
  if (/^[A-Za-z0-9_@%+=:,.\/-]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

var ESCAPE_MAX = 262144      // escaping is for snippets; keeps the UI thread responsive

function escapeTool(input, mode) {
  if (input === "") return result()
  if (input.length > ESCAPE_MAX) return result("", "Too long to escape here (256 KiB max)")
  if (mode === "html-decode") {
    var d = htmlDecode(input)
    return result(d.text, "", d.count + " entities decoded" + (d.unknown ? " · " + d.unknown + " unknown left as is" : ""))
  }
  if (mode === "unescape") {
    var u = stringUnescape(input)
    return result(u.text, "", u.bad ? "Unknown escape " + u.bad + " kept as its character" : "Unescaped")
  }
  if (mode === "escape") return result(stringEscape(input), "", "Paste between double quotes in JSON, JS, Go, Rust…")
  if (mode === "shell") return result(shellQuote(input), "", "One argument for sh, bash or zsh")
  return result(htmlEncode(input), "", "& < > \" ' encoded")
}

// ---------------------------------------------------------------- Number base

// Arbitrary precision on 16-bit limbs (little-endian). Qt's engine has no
// BigInt, and a 128-bit hash or a 64-bit ID must convert exactly.
var NUMBER_MAX = 1024          // digits; conversion is quadratic in length
var DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

function bnMulAdd(limbs, mul, add) {
  var carry = add
  for (var i = 0; i < limbs.length; i++) {
    var v = limbs[i] * mul + carry
    limbs[i] = v & 0xffff
    carry = Math.floor(v / 65536)
  }
  while (carry) { limbs.push(carry & 0xffff); carry = Math.floor(carry / 65536) }
}

function bnFrom(digits, base) {
  var limbs = [0]
  for (var i = 0; i < digits.length; i++) bnMulAdd(limbs, base, DIGITS.indexOf(digits.charAt(i)))
  return bnTrim(limbs)
}

function bnTrim(l) { while (l.length > 1 && l[l.length - 1] === 0) l.pop(); return l }
function bnIsZero(l) { return l.length === 1 && l[0] === 0 }

function bnTo(limbs, base) {
  var l = limbs.slice(), out = []
  while (!bnIsZero(l)) {
    var rem = 0
    for (var i = l.length - 1; i >= 0; i--) {
      var v = rem * 65536 + l[i]
      l[i] = Math.floor(v / base)
      rem = v % base
    }
    out.push(DIGITS.charAt(rem))
    bnTrim(l)
  }
  return out.length ? out.reverse().join("") : "0"
}

function bnBits(l) {
  var top = l[l.length - 1]
  return top === 0 ? 0 : (l.length - 1) * 16 + Math.floor(Math.log(top) / Math.LN2) + 1
}

// 2^w − v (mod 2^w): a negative number's two's complement, and the
// magnitude of a value whose sign bit is set. Invert, then add one.
function bnComplement(l, w) {
  var out = []
  for (var i = 0; i < w / 16 || (w < 16 && i === 0); i++) out.push(~(l[i] || 0) & 0xffff)
  if (w < 16) out[0] &= (1 << w) - 1
  bnMulAdd(out, 1, 1)
  out.length = Math.max(1, Math.ceil(w / 16))
  if (w < 16) out[0] &= (1 << w) - 1
  return bnTrim(out)
}

function zeros(n) { return new Array(Math.max(0, n) + 1).join("0") }

function groupDigits(s, size, sep) {
  var out = []
  for (var end = s.length; end > 0; end -= size) out.unshift(s.slice(Math.max(0, end - size), end))
  return out.join(sep)
}

function numberTool(input, mode) {
  var raw = input.trim()
  if (raw === "") return result("", "", "Enter a number: 255, 0xff, 0b1111_1111, 0o377 or -1")
  if (raw.length > NUMBER_MAX + 3) return result("", "Too long (" + NUMBER_MAX + " digits max)")
  var s = raw.toLowerCase().replace(/[_\s,']/g, "")
  var neg = s.charAt(0) === "-"
  if (neg || s.charAt(0) === "+") s = s.slice(1)
  var base = { dec: 10, hex: 16, oct: 8, bin: 2 }[mode] || 0
  var prefix = /^0x/.test(s) ? 16 : /^0b/.test(s) ? 2 : /^0o/.test(s) ? 8 : 0
  if (prefix && (base === 0 || base === prefix)) { base = prefix; s = s.slice(2) }
  else if (base === 16 && /^#/.test(s)) s = s.slice(1)
  if (base === 0) base = /^[0-9]+$/.test(s) ? 10 : (/^[0-9a-f]+$/.test(s) ? 16 : 10)
  var valid = new RegExp("^[" + DIGITS.slice(0, base) + "]+$")
  if (!valid.test(s)) return result("", "Not a valid base-" + base + " number")
  var v = bnFrom(s, base)
  var bits = bnBits(v)
  var sign = neg && !bnIsZero(v) ? "-" : ""
  var hex = bnTo(v, 16), bin = bnTo(v, 2)
  var pairs = [
    ["Decimal", sign + groupDigits(bnTo(v, 10), 3, ",")],
    ["Hex", sign + "0x" + hex.toUpperCase()],
    ["Octal", sign + "0o" + bnTo(v, 8)],
    ["Binary", sign + "0b" + groupDigits(bin, 4, " ")]
  ]
  if (sign) {
    // Two's complement at each width that can hold it (down to −2^(w−1)).
    ;[8, 16, 32, 64].forEach(function (w) {
      if (bits > w || (bits === w && bin !== "1" + zeros(w - 1))) return
      var t = bnTo(bnComplement(v, w), 16).toUpperCase()
      pairs.push(["int" + w, "0x" + groupDigits(zeros(w / 4 - t.length) + t, 4, "_")])
    })
  } else {
    // A value with its top bit set at a standard width also reads as negative.
    ;[8, 16, 32, 64].forEach(function (w) {
      if (bits === w) pairs.push(["As int" + w, "-" + groupDigits(bnTo(bnComplement(v, w), 10), 3, ",")])
    })
  }
  pairs.push(["Bits", bits + (bits > 0 ? " (" + Math.ceil(bits / 8) + " byte" + (Math.ceil(bits / 8) === 1 ? "" : "s") + ")" : "")])
  if (!sign && bits <= 21) {
    var cp = parseInt(hex, 16)
    var ch = cp >= 0x20 && cp !== 0x7f && !(cp >= 0x80 && cp < 0xa0) ? codePoint(cp) : null
    if (ch) pairs.push(["Character", "U+" + ("000" + hex.toUpperCase()).slice(-Math.max(4, hex.length)) + "  " + ch])
  }
  return withPairs(pairs, "Read as base " + base + (prefix && prefix === base ? " (prefix)" : (mode && mode !== "auto" ? "" : " (auto)")))
}

// ---------------------------------------------------------------- Color

// CSS named colours (the same list Qt and every browser know).
var CSS_COLORS = ("aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 "
  + "black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 "
  + "chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff "
  + "darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b "
  + "darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a "
  + "darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 "
  + "deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 "
  + "forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 "
  + "greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c "
  + "lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 "
  + "lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 "
  + "lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de "
  + "lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa "
  + "mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee "
  + "mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa "
  + "mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 "
  + "orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 "
  + "papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 "
  + "red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 "
  + "seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa "
  + "springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee "
  + "wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32").split(" ")

function colorNamed(name) {
  for (var i = 0; i < CSS_COLORS.length; i += 2) if (CSS_COLORS[i] === name) return CSS_COLORS[i + 1]
  return null
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function round(v, places) { var f = Math.pow(10, places || 0); return Math.round(v * f) / f }

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
  var t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255]
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, h = 0, s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  }
  return [(h + 360) % 360, s, l]
}

function rgbToHsv(r, g, b) {
  var hsl = rgbToHsl(r, g, b), max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255
  return [hsl[0], max ? (max - min) / max : 0, max]
}

function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function linearToSrgb(c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) }

// OKLab (Björn Ottosson), the space behind CSS oklch().
function rgbToOklch(r, g, b) {
  var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b)
  var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  var Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  var C = Math.sqrt(A * A + Bb * Bb), H = Math.atan2(Bb, A) * 180 / Math.PI
  return [L, C, C < 0.0002 ? 0 : (H + 360) % 360]
}

function oklchToRgb(L, C, H) {
  var a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180)
  var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3)
  return [linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)]
}

// One CSS-style number: "50%", "0.5", "120deg"…; `scale` maps 100% to it.
function colorNum(t, scale) {
  var m = /^(-?\d*\.?\d+(?:e[-+]?\d+)?)(%|deg|turn|rad)?$/i.exec(t)
  if (!m) return NaN
  var v = Number(m[1]), u = (m[2] || "").toLowerCase()
  if (u === "%") return v / 100 * scale
  if (u === "turn") return v * 360
  if (u === "rad") return v * 180 / Math.PI
  return v
}

function parseColor(text) {
  var s = text.trim().toLowerCase().replace(/;$/, "")
  var hex = /^(?:#|0x)?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  // Hyprland writes rgb(rrggbb) and rgba(rrggbbaa).
  var hypr = /^rgba?\(\s*([0-9a-f]{6}|[0-9a-f]{8})\s*\)$/.exec(s)
  if (hypr) hex = hypr
  if (!hex && colorNamed(s)) hex = [s, colorNamed(s)]
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0, from: "name" }
  if (hex) {
    var h = hex[1]
    if (h.length <= 4) h = h.split("").map(function (c) { return c + c }).join("")
    // Bare digits like "123" are more likely a number than a colour.
    if (!/^#|^0x|^rgba?\(/.test(s) && !colorNamed(s) && !/[a-f]/.test(hex[1]) && hex[1].length !== 6) return null
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
             a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1, from: hypr ? "hyprland" : (colorNamed(s) ? "name" : "hex") }
  }
  var fn = /^(rgba?|hsla?|hsv|hsb|oklch)\(\s*([^)]*)\)$/.exec(s)
  if (!fn) return null
  var args = fn[2].replace(/\s*\/\s*/, " / ").split(/\s*,\s*|\s+/).filter(function (x) { return x !== "" })
  var alpha = 1, slash = args.indexOf("/")
  if (slash !== -1) { alpha = colorNum(args[slash + 1] || "", 1); args = args.slice(0, slash) }
  else if (args.length === 4) { alpha = colorNum(args[3], 1); args = args.slice(0, 3) }
  if (args.length !== 3 || isNaN(alpha)) return null
  var f = fn[1], rgb
  if (f === "rgb" || f === "rgba") rgb = args.map(function (x) { return colorNum(x, 255) })
  else if (f === "oklch") rgb = oklchToRgb(colorNum(args[0], 1), colorNum(args[1], 0.4), colorNum(args[2], 1))
  else {
    var hh = colorNum(args[0], 360), ss = colorNum(args[1], 1), ll = colorNum(args[2], 1)
    if (!/%$/.test(args[1]) && ss > 1) ss /= 100
    if (!/%$/.test(args[2]) && ll > 1) ll /= 100
    if (f === "hsv" || f === "hsb") {
      // HSV → HSL, then the shared path.
      var l2 = ll * (1 - ss / 2)
      ss = l2 === 0 || l2 === 1 ? 0 : (ll - l2) / Math.min(l2, 1 - l2)
      ll = l2
    }
    rgb = hslToRgb(hh, ss, ll)
  }
  if (rgb.some(isNaN)) return null
  return { r: clamp(Math.round(rgb[0]), 0, 255), g: clamp(Math.round(rgb[1]), 0, 255), b: clamp(Math.round(rgb[2]), 0, 255),
           a: clamp(alpha, 0, 1), from: f, clipped: f === "oklch" && rgb.some(function (v) { return v < -0.5 || v > 255.5 }) }
}

function hex2(n) { return ("0" + Math.round(n).toString(16)).slice(-2) }

function relLuminance(c) {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b)
}

function contrastText(ratio) {
  return round(ratio, 2) + ":1  " + (ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large text only" : "fails")
}

function colorTool(input) {
  if (input.trim() === "") return result("", "", "Enter a colour: #ff8800, rgb(255 136 0), hsl(32 100% 50%), oklch(…) or a name")
  var c = parseColor(input)
  if (!c) return result("", "Not a colour this tool reads (hex, rgb, hsl, hsv, oklch, Hyprland rgba(…) or a CSS name)")
  var hex = "#" + hex2(c.r) + hex2(c.g) + hex2(c.b), aa = hex2(c.a * 255)
  var hsl = rgbToHsl(c.r, c.g, c.b), hsv = rgbToHsv(c.r, c.g, c.b), ok = rgbToOklch(c.r, c.g, c.b)
  var alphaCss = c.a < 1 ? " / " + round(c.a, 3) : ""
  var name = null
  for (var i = 0; i < CSS_COLORS.length; i += 2) if (CSS_COLORS[i + 1] === hex.slice(1)) { name = CSS_COLORS[i]; break }
  var lum = relLuminance(c)
  var pairs = [
    ["HEX", c.a < 1 ? hex + aa : hex],
    ["RGB", "rgb(" + c.r + " " + c.g + " " + c.b + alphaCss + ")"],
    ["HSL", "hsl(" + round(hsl[0]) + " " + round(hsl[1] * 100) + "% " + round(hsl[2] * 100) + "%" + alphaCss + ")"],
    ["HSV", "hsv(" + round(hsv[0]) + " " + round(hsv[1] * 100) + "% " + round(hsv[2] * 100) + "%)"],
    ["OKLCH", "oklch(" + round(ok[0] * 100, 1) + "% " + round(ok[1], 3) + " " + round(ok[2], 1) + alphaCss + ")"],
    ["Hyprland", "rgba(" + hex.slice(1) + aa + ")"],
    ["Legacy CSS", c.a < 1 ? "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + round(c.a, 3) + ")" : "rgb(" + c.r + ", " + c.g + ", " + c.b + ")"],
    ["Qt / Android", "#" + aa + hex.slice(1)],
    ["On white", contrastText(1.05 / (lum + 0.05))],
    ["On black", contrastText((lum + 0.05) / 0.05)]
  ]
  if (name) pairs.push(["CSS name", name])
  var r = withPairs(pairs, (c.clipped ? "Outside sRGB, clipped · " : "") + "Read as " + c.from)
  r.swatch = { r: c.r / 255, g: c.g / 255, b: c.b / 255, a: c.a, dark: lum < 0.18 }
  return r
}

// ---------------------------------------------------------------- Lines

var LINES_MAX = 200000

// "file2" before "file10", case-insensitive, without Intl (Qt's engine
// ignores localeCompare's numeric option). Each line gets one key that sorts
// naturally as a plain string: a run of digits becomes \u0001, its length,
// then the digits. Sorting those keys with the engine's native sort (no
// comparator callback) is ~20× faster in Qt's V4 than a JS comparator.
function naturalKey(s) {
  return s.toLowerCase().replace(/[\u0000-\u0002]/g, "").replace(/\d+/g, function (d) {
    d = d.replace(/^0+(?=\d)/, "")
    return "\u0001" + String.fromCharCode(Math.min(0xffff, 0x20 + d.length)) + d
  })
}

function naturalSort(lines) {
  var w = String(lines.length).length
  var keyed = lines.map(function (l, i) { return naturalKey(l) + "\u0000" + ("0000000000" + i).slice(-w) })
  keyed.sort()
  return keyed.map(function (k) { return lines[Number(k.slice(k.lastIndexOf("\u0000") + 1))] })
}

function utf8Length(s) {
  var n = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++ }
    else n += 3
  }
  return n
}

function linesTool(input, mode) {
  if (input === "") return result("", "", "Paste lines to sort, dedupe or count")
  var trailing = /\n$/.test(input)
  var lines = (trailing ? input.slice(0, -1) : input).split("\n")
  if (lines.length > LINES_MAX) return result("", "Too many lines (" + LINES_MAX + " max)")
  var words = (input.match(/\S+/g) || []).length
  var unique = {}, uniqueCount = 0
  lines.forEach(function (l) { if (!Object.prototype.hasOwnProperty.call(unique, "$" + l)) { unique["$" + l] = 0; uniqueCount++ } unique["$" + l]++ })
  var info = lines.length + " lines · " + uniqueCount + " unique · " + words + " words · " + input.length + " chars · " + utf8Length(input) + " bytes"
  var out
  if (mode === "sort" || mode === "sort-desc") {
    out = naturalSort(lines)
    if (mode === "sort-desc") out.reverse()
  } else if (mode === "unique") {
    var seen = {}
    out = lines.filter(function (l) { return seen.hasOwnProperty("$" + l) ? false : (seen["$" + l] = true) })
  } else if (mode === "reverse") out = lines.slice().reverse()
  else if (mode === "trim") out = lines.map(function (l) { return l.trim() }).filter(function (l) { return l !== "" })
  else if (mode === "count") {
    // Frequency table, most common first: the "| sort | uniq -c | sort -rn" of logs.
    // Ties keep first-appearance order (Qt's sort is not stable).
    var rows = Object.keys(unique).map(function (k, i) { return [unique[k], k.slice(1), i] })
    rows.sort(function (a, b) { return b[0] - a[0] || a[2] - b[2] })
    var w = String(rows.length ? rows[0][0] : 0).length
    out = rows.map(function (r) { return (new Array(w + 1).join(" ") + r[0]).slice(-w) + "  " + r[1] })
  } else out = lines
  return result(out.join("\n"), "", info)
}

// ---------------------------------------------------------------- ULID

var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// 48-bit milliseconds then 80 random bits, Crockford base32. Every ID gets
// its own secure random bits (the spec's monotonic +1 would make the rest of a
// batch guessable from the first), and the batch is sorted so it still lists
// in order.
function ulids(n, nowMs, bytes) {
  var out = []
  for (var i = 0; i < n; i++) {
    var rand = bytes.slice(i * 16 + 6, i * 16 + 16)
    var b = [], ms = Math.floor(nowMs)
    for (var j = 5; j >= 0; j--) { b[j] = ms % 256; ms = Math.floor(ms / 256) }
    b = b.concat(rand)
    // 128 bits → 26 characters of 5 bits; the first takes only the top 3.
    var s = "", acc = 0, accBits = 2
    for (var x = 0; x < 16; x++) {
      acc = (acc << 8) | b[x]; accBits += 8
      while (accBits >= 5) { accBits -= 5; s += CROCKFORD.charAt((acc >> accBits) & 31) }
      acc &= (1 << accBits) - 1
    }
    out.push(s)
  }
  return out.sort()
}

// ---------------------------------------------------------------- Markdown

// GitHub-flavoured Markdown to the HTML subset Qt's rich text understands.
// Written here rather than using Qt's own Markdown support because that one
// passes raw HTML through and fetches remote images; this renderer escapes
// all text, shows raw HTML literally and never loads an image, so previewing
// a pasted README makes no network request.
var MARKDOWN_MAX = 131072

function mdEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Only links a browser should open; anything else (javascript:, file:…) loses its href.
function mdSafeUrl(url) {
  var u = url.trim()
  if (/^(https?:|mailto:)/i.test(u)) return u
  return /^[a-z][\w+.-]*:/i.test(u) ? "" : u   // relative links are fine; other schemes are not
}

function mdInline(text, st) {
  var slots = []
  function keep(html) { slots.push(html); return "\u0000" + (slots.length - 1) + "\u0000" }
  var s = text.replace(/\u0000/g, "")
  // Code spans first: nothing inside them is Markdown.
  // Every span below is length-bounded: an opener with no closer would
  // otherwise rescan the rest of the paragraph, which is quadratic.
  s = s.replace(/(`+)([\s\S]{0,1000}?[^`])\1(?!`)/g, function (m, ticks, code) {
    return keep("<code" + st.code + ">" + mdEscape(code.replace(/^ (.*) $/, "$1")) + "</code>")
  })
  // Backslash escapes.
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~<>])/g, function (m, c) { return keep(mdEscape(c)) })
  // Images become their alt text: an <img> would make Qt load the URL.
  s = s.replace(/!\[([^\]]{0,500})\]\(([^)\s]{0,2000})(?:\s+"[^"]{0,200}")?\)/g, function (m, alt) {
    return keep("<span" + st.dim + ">[image: " + mdEscape(alt || "untitled") + "]</span>")
  })
  s = s.replace(/\[([^\]]{1,500})\]\(([^)\s]{0,2000})(?:\s+"([^"]{0,200})")?\)/g, function (m, label, url) {
    var safe = mdSafeUrl(url)
    var inner = mdInline(label, st)
    return keep(safe ? "<a href=\"" + mdEscape(safe) + "\"" + st.link + ">" + inner + "</a>" : inner)
  })
  s = s.replace(/<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/g, function (m, url) {
    return keep("<a href=\"" + mdEscape(url) + "\"" + st.link + ">" + mdEscape(url) + "</a>")
  })
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, function (m, pre, url) {
    return pre + keep("<a href=\"" + mdEscape(url) + "\"" + st.link + ">" + mdEscape(url) + "</a>")
  })
  s = mdEscape(s)
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]{0,300}?\S)\1/g, "<b>$2</b>")
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*]{0,300}?\S)\*(?!\*)/g, "$1<i>$2</i>")
  s = s.replace(/(^|[^\w])_(?=\S)([^_]{0,300}?\S)_(?![\w])/g, "$1<i>$2</i>")
  s = s.replace(/~~(?=\S)([\s\S]{0,300}?\S)~~/g, "<s>$1</s>")
  // Hard breaks: two trailing spaces or a backslash before a newline.
  s = s.replace(/( {2,}|\\)\n/g, "<br>").replace(/\n/g, " ")
  return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return slots[Number(i)] })
}

function mdTableCells(line) {
  var s = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  var cells = [], cell = "", inCode = false
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c === "\\" && s.charAt(i + 1) === "|") { cell += "|"; i++; continue }
    if (c === "`") inCode = !inCode
    if (c === "|" && !inCode) { cells.push(cell.trim()); cell = ""; continue }
    cell += c
  }
  cells.push(cell.trim())
  return cells
}

var MD_LIST = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/
var MD_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/
var MD_HR = /^ {0,3}([-*_])( *\1){2,} *$/
var MD_TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function mdBlocks(lines, st, depth) {
  var out = [], i = 0, para = []
  function flush() {
    if (para.length) out.push("<p>" + mdInline(para.join("\n"), st) + "</p>")
    para = []
  }
  while (i < lines.length) {
    var line = lines[i], m
    if (/^\s*$/.test(line)) { flush(); i++; continue }
    if ((m = MD_FENCE.exec(line))) {
      flush()
      var fence = m[1], code = []
      i++
      while (i < lines.length && !(new RegExp("^ {0,3}" + fence.charAt(0) + "{" + fence.length + ",}\\s*$")).test(lines[i])) code.push(lines[i++])
      i++
      out.push((m[2] ? "<p" + st.dim + "><small>" + mdEscape(m[2]) + "</small></p>" : "")
        + "<pre" + st.pre + ">" + mdEscape(code.join("\n")) + "</pre>")
      continue
    }
    if ((m = /^ {0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/.exec(line)) || /^ {0,3}#{1,6}$/.test(line)) {
      flush()
      var level = m ? m[1].length : line.trim().length
      out.push("<h" + level + st.heading + ">" + mdInline(m ? m[2] : "", st) + "</h" + level + ">")
      i++
      continue
    }
    if (MD_HR.test(line) && !(para.length && /^ {0,3}-+ *$/.test(line))) { flush(); out.push("<hr>"); i++; continue }
    // Setext headings: a paragraph line underlined with === or ---.
    if (para.length === 1 && /^ {0,3}(=+|-+) *$/.test(line)) {
      var lvl = line.trim().charAt(0) === "=" ? 1 : 2
      out.push("<h" + lvl + st.heading + ">" + mdInline(para[0], st) + "</h" + lvl + ">")
      para = []
      i++
      continue
    }
    if (line.indexOf("|") !== -1 && i + 1 < lines.length && MD_TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
      flush()
      var head = mdTableCells(line)
      var aligns = mdTableCells(lines[i + 1]).map(function (c) {
        return /^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : "left"
      })
      var rows = []
      i += 2
      while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) rows.push(mdTableCells(lines[i++]))
      var cell = function (tag, text, k) {
        return "<" + tag + " align=\"" + (aligns[k] || "left") + "\"" + st.cell + ">" + mdInline(text || "", st) + "</" + tag + ">"
      }
      out.push("<table" + st.table + "><tr>" + head.map(function (h, k) { return cell("th", h, k) }).join("") + "</tr>"
        + rows.map(function (r) { return "<tr>" + head.map(function (h, k) { return cell("td", r[k], k) }).join("") + "</tr>" }).join("")
        + "</table>")
      continue
    }
    if (/^ {0,3}>/.test(line)) {
      flush()
      var quote = []
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^ {0,3}> ?/, ""))
      out.push(depth > 20 ? "<p>" + mdEscape(quote.join(" ")) + "</p>"
        : "<blockquote" + st.quote + ">" + mdBlocks(quote, st, depth + 1) + "</blockquote>")
      continue
    }
    if ((m = MD_LIST.exec(line)) && (!para.length || m[4] !== "")) {
      flush()
      var ordered = /\d/.test(m[2]), start = ordered ? parseInt(m[2], 10) : 1
      var items = []
      while (i < lines.length) {
        var lm = MD_LIST.exec(lines[i])
        if (!lm || /\d/.test(lm[2]) !== ordered) break
        var indent = lm[1].length + lm[2].length + Math.max(1, Math.min(4, lm[3].length))
        var body = [lm[4]]
        i++
        // Continuation: indented lines, and blank lines followed by indented ones.
        while (i < lines.length) {
          if (/^\s*$/.test(lines[i])) {
            if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && lines[i + 1].search(/\S/) >= indent) { body.push(""); i++; continue }
            break
          }
          if (lines[i].search(/\S/) >= indent) { body.push(lines[i].slice(indent)); i++; continue }
          if (MD_LIST.exec(lines[i]) || MD_FENCE.test(lines[i]) || /^ {0,3}(#|>)/.test(lines[i]) || MD_HR.test(lines[i])) break
          body.push(lines[i].trim()); i++ // lazy continuation of the item's paragraph
        }
        items.push(body)
        while (i < lines.length && /^\s*$/.test(lines[i]) && i + 1 < lines.length && MD_LIST.exec(lines[i + 1])) i++
      }
      var html = items.map(function (body) {
        var task = /^\[([ xX])\]\s+/.exec(body[0])
        if (task) body[0] = body[0].slice(task[0].length)
        var inner = depth > 20 ? mdEscape(body.join(" ")) : mdBlocks(body, st, depth + 1)
        // A single paragraph renders inline, so tight lists stay tight.
        inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, "$1")
        return "<li>" + (task ? (task[1] === " " ? "☐ " : "☑ ") : "") + inner + "</li>"
      }).join("")
      out.push(ordered ? "<ol" + (start !== 1 ? " start=\"" + start + "\"" : "") + ">" + html + "</ol>" : "<ul>" + html + "</ul>")
      continue
    }
    para.push(line.replace(/^ +/, ""))
    i++
  }
  flush()
  return out.join("\n")
}

// theme: colours for the in-window preview; without it, plain HTML to copy.
function markdownHtml(input, theme) {
  var t = theme || null
  var st = t ? {
    code: " style=\"font-family: monospace; background-color: " + t.code + ";\"",
    pre: " style=\"font-family: monospace; background-color: " + t.code + ";\"",
    dim: " style=\"color: " + t.dim + ";\"",
    link: " style=\"color: " + t.accent + ";\"",
    heading: " style=\"color: " + t.accent + ";\"",
    quote: " style=\"color: " + t.dim + ";\"",
    table: " border=\"1\" cellspacing=\"0\" cellpadding=\"6\" style=\"border-color: " + t.border + "; border-style: solid;\"",
    cell: ""
  } : { code: "", pre: "", dim: "", link: "", heading: "", quote: "", table: "", cell: "" }
  return mdBlocks(input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"), st, 0)
}

function markdownTool(input, mode, theme) {
  if (input.trim() === "") return result("", "", "Paste Markdown, or load the sample")
  if (input.length > MARKDOWN_MAX) return result("", "Too long to preview (128 KiB max)")
  var html = markdownHtml(input, null)
  var words = (input.match(/\S+/g) || []).length
  var r = result(html, "", words + " words · " + Math.max(1, Math.round(words / 230)) + " min read")
  if (mode !== "html") r.html = markdownHtml(input, theme)
  return r
}

// ---------------------------------------------------------------- Samples

// One example per tool (and per mode where the input differs), for the
// Sample button. Generators (UUID, Password) take no input, so have none.
var SAMPLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
  + "eyJzdWIiOiJ1c2VyXzEwNDIiLCJuYW1lIjoiQWRhIExvdmVsYWNlIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9."
  + "Y3r2aHutsUDQjWdbJchEZCADalebiWojzScrMz7bl8s"

var SAMPLE_ORDER = '{"id":"ord_1042","total":59.9,"paid":true,"customer":{"name":"Ada Lovelace","email":null},'
  + '"items":[{"sku":"KB-01","qty":1,"price":49.9},{"sku":"CB-USB","qty":2,"price":5,"gift":true}],"shipped-at":"2024-05-01T10:00:00Z"}'

var SAMPLES = {
  json: {
    "*": { input: SAMPLE_ORDER },
    csv: { input: '[{"name":"Ada","role":"admin","teams":["core"]},{"name":"Linus","role":"dev, ops"},{"name":"Grace","role":"dev","active":false}]' },
    "from-csv": { input: 'name,age,zip,active\n"Lovelace, Ada",36,00123,true\nGrace Hopper,85,10001,false\nLinus,,,true' }
  },
  jwt: { "*": { input: SAMPLE_JWT } },
  base64: {
    "*": { input: "Hello, Omarchy! 👋 DevKit works offline." },
    decode: { input: "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iLCJkZXYiXSwiZW1vamkiOiLwn5qAIn0=" }
  },
  url: {
    "*": { input: "name=Ada Lovelace & friends / 100% café?" },
    decode: { input: "q%3Dhello%20world%26lang%3Den%26emoji%3D%F0%9F%91%8B" },
    parse: { input: "https://ada@api.example.com:8443/v1/search?q=omarchy&tags=dev,tools&page=2#results" }
  },
  time: { "*": { input: "1700000000" } },
  hash: { "*": { input: "The quick brown fox jumps over the lazy dog" } },
  "case": { "*": { input: "user account ID" } },
  regex: { "*": { input: "Contact ada@example.com or grace.hopper@navy.mil, not bob@localhost.",
                  pattern: "(?<user>[\\w.]+)@(?<domain>[\\w-]+\\.[\\w.]+)", flags: "g",
                  replacement: "$<user> at $<domain>" } },
  diff: { "*": { input: "server:\n  port: 8080\n  host: localhost\nlog_level: info\nfeatures:\n  - search\n  - export",
                 input2: "server:\n  port: 9090\n  host: localhost\nlog_level: debug\nfeatures:\n  - search\n  - export\n  - sharing" } },
  cron: { "*": { input: "*/15 9-17 * * 1-5" } },
  escape: {
    "*": { input: "<a href=\"/search?q=tom&jerry\">Tom & Jerry's</a>" },
    "html-decode": { input: "&lt;p class=&quot;note&quot;&gt;Caf&eacute; &amp; cr&egrave;me &#x1F600;&lt;/p&gt;" },
    escape: { input: "He said \"hi\"\n\tthen left \\o/" },
    unescape: { input: "\"Line 1\\nLine 2\\t\\u00e9 \\u{1F600} \\x41\"" },
    shell: { input: "it's a file with spaces & $vars.txt" }
  },
  number: {
    "*": { input: "0xDEADBEEF" },
    dec: { input: "4294967295" }, hex: { input: "7fffffff" }, oct: { input: "755" }, bin: { input: "1010_1010" }
  },
  color: { "*": { input: "#7aa2f7" } },
  lines: { "*": { input: "GET /api/users 200\nGET /api/users 200\nPOST /api/login 401\nGET /health 200\nGET /api/users 200\n"
                         + "POST /api/login 401\nGET /api/orders 500\nGET /api/users 200\nGET /health 200" } },
  markdown: { "*": { input: "# DevKit notes\n\nEveryday tools, **offline**, one key away. See [the repo](https://github.com/Coding-Sparrow/omarchy-devkit).\n\n"
    + "## Checklist\n\n- [x] Format JSON\n- [x] Decode a JWT\n- [ ] Write the *release* notes\n  - nested item with `inline code`\n\n"
    + "| Tool | Key | Offline |\n| --- | :---: | ---: |\n| JSON | `Ctrl+1` | ✓ |\n| Cron | `Ctrl+⇧R` | ✓ |\n\n"
    + "> Tip: press **Esc** to close.\n\n```bash\nomarchy plugin update coding-sparrow.devkit\nomarchy restart shell\n```\n\n"
    + "1. Paste\n2. Read\n3. ~~Struggle~~ Ship\n\n---\n\n![a screenshot](https://example.com/shot.png) is shown as text, never loaded." } }
}

function sample(toolId, mode) {
  var s = SAMPLES[toolId]
  if (!s) return null
  var pick = s[mode] || s["*"]
  var out = {}
  for (var k in pick) out[k] = pick[k]
  return out
}

// ---------------------------------------------------------------- Detect

// Best guess at which tool the clipboard content belongs to, or "".
var DETECT_MAX = 1048576

function detect(text) {
  var s = String(text || "").trim()
  if (s === "" || s.length > DETECT_MAX) return ""
  if (/^(Bearer\s+)?eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/.test(s)) return "jwt"
  if (/^[\[{]/.test(s)) { try { JSON.parse(s); return "json" } catch (e) { if (/^\{\s*"/.test(s)) return "json" } }
  if (s.length <= 64 && /^(#[0-9A-Fa-f]{3,4}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|(rgba?|hsla?|oklch)\([^()]*\))$/.test(s) && parseColor(s)) return "color"
  // A heading, then more lines with list, link, emphasis or code markup.
  if (s.length <= MARKDOWN_MAX && /^#{1,3} \S/.test(s) && /\n/.test(s) && /(^|\n)([-*] |\d+\. |```|> )|\]\(|\*\*|`/.test(s)) return "markdown"
  if (/^0[xX][0-9A-Fa-f_]{1,64}$/.test(s) || /^0[bB][01_]{1,256}$/.test(s)) return "number"
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/i.test(s)) return "cron"
  // Five fields with at least one * or /, e.g. "*/5 * * * *" or "0 9 * * MON-FRI".
  if (s.length <= CRON_MAX && /^([\d*?,\/-]+[ \t]+){4}[\dA-Za-z*?,\/-]+$/.test(s) && /[*\/]/.test(s)) return "cron"
  if (/^\d{10}(\d{3})?$/.test(s)) return "time"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "time"
  if (/^https?:\/\/\S+$/.test(s)) return "url"
  if (/%[0-9A-Fa-f]{2}/.test(s) && !/\s/.test(s)) return "url"
  if (s.length >= 8 && s.length % 4 !== 1 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(s) && (/[0-9+/=_-]/.test(s) || (/[A-Z]/.test(s) && /[a-z]/.test(s)))) {
    var bytes = bytesFromBase64(s)
    var t = bytes && utf8Decode(bytes)
    if (t && isPrintable(t) && /[A-Za-z]{2}/.test(t)) return "base64"
  }
  return ""
}

// ---------------------------------------------------------------- Dispatch

// state: { input, input2, mode, pattern, flags, replacement, useReplace,
//          count, upper, nowMs, randomBytes }
function run(toolId, state) {
  var input = String(state.input || "")
  switch (toolId) {
  case "json": return jsonTool(input, state.mode || "pretty2")
  case "jwt": return jwtTool(input, state.nowMs)
  case "base64": return base64Tool(input, state.mode || "encode")
  case "url": return urlTool(input, state.mode || "encode")
  case "time": return timeTool(input, state.nowMs)
  case "cron": return cronTool(input, state.mode || "local", state.nowMs)
  case "escape": return escapeTool(input, state.mode || "html")
  case "number": return numberTool(input, state.mode || "auto")
  case "color": return colorTool(input)
  case "lines": return linesTool(input, state.mode || "sort")
  case "markdown": return markdownTool(input, state.mode || "preview", state.theme)
  case "uuid": return uuidTool(state.mode || "v4", state.count, state.nowMs, state.randomBytes, state.upper)
  case "password": return passwordTool(state, state.randomBytes)
  case "case": return caseTool(input)
  case "regex": return regexTool(String(state.pattern || ""), String(state.flags || ""), input, String(state.replacement || ""), !!state.useReplace)
  case "diff": return diffTool(input, String(state.input2 || ""))
  }
  return result()
}
