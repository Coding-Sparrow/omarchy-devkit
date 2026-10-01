// DevKit tool logic. Pure functions only: no QML, no I/O, no globals beyond
// the ECMAScript built-ins, so the same file loads in the Quickshell V4 engine
// and in node's vm for tests (tests/tools.test.mjs).

var TOOLS = [
  { id: "json", badge: "{ }", name: "JSON", description: "Format, minify, validate and sort JSON",
    modes: [{ value: "pretty2", label: "Format 2" }, { value: "pretty4", label: "Format 4" },
            { value: "minify", label: "Minify" }, { value: "sort", label: "Sort keys" }],
    placeholder: "Paste JSON…" },
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
  { id: "uuid", badge: "ID", name: "UUID", description: "Generate UUID v4 / v7",
    modes: [{ value: "v4", label: "v4 random" }, { value: "v7", label: "v7 time-ordered" }],
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
    placeholder: "*/15 9-17 * * 1-5   (minute hour day month weekday), or @daily" }
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
  var parsed
  try { parsed = JSON.parse(input) } catch (e) {
    return result("", jsonErrorLocation(input) || String(e.message || e))
  }
  var out
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

// ---------------------------------------------------------------- Detect

// Best guess at which tool the clipboard content belongs to, or "".
var DETECT_MAX = 1048576

function detect(text) {
  var s = String(text || "").trim()
  if (s === "" || s.length > DETECT_MAX) return ""
  if (/^(Bearer\s+)?eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/.test(s)) return "jwt"
  if (/^[\[{]/.test(s)) { try { JSON.parse(s); return "json" } catch (e) { if (/^\{\s*"/.test(s)) return "json" } }
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
  case "uuid": return uuidTool(state.mode || "v4", state.count, state.nowMs, state.randomBytes, state.upper)
  case "password": return passwordTool(state, state.randomBytes)
  case "case": return caseTool(input)
  case "regex": return regexTool(String(state.pattern || ""), String(state.flags || ""), input, String(state.replacement || ""), !!state.useReplace)
  case "diff": return diffTool(input, String(state.input2 || ""))
  }
  return result()
}
