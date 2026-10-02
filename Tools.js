// DevKit tool logic. Pure functions only: no QML, no I/O, no globals beyond
// the ECMAScript built-ins, so the same file loads in the Quickshell V4 engine
// and in node's vm for tests (tests/tools.test.mjs).

// Sidebar groups, in display order. "session" holds the views that are not
// tools of their own (chains and history).
var SECTIONS = [
  { id: "encode", label: "Encode & decode" },
  { id: "format", label: "Format & convert" },
  { id: "text", label: "Text" },
  { id: "web", label: "Time & web" },
  { id: "generate", label: "Generate & inspect" },
  { id: "session", label: "Session" }
]

// Every tool. Fields:
//   section   a SECTIONS id
//   shortcut  its own key (optional); the Shortcut and the sidebar hint both read it
//   modes     the mode buttons; the first is the default
//   options   extra controls the window renders generically:
//             { id, type: "text" | "toggle" | "choice" | "number", label, placeholder,
//               value (default), choices, modes (only shown in these modes), grow }
//   kind      "text" (input → output, the default), "generator" (no input),
//             "image" (works on pictures) or "view" (chains, history)
//   job       the result needs a helper process (bin/devkit-helper)
//   chain     false when the tool cannot be a step in a chain
//   keywords  extra words the search box matches
var TOOLS = [
  // ---- Encode & decode
  { id: "base64", section: "encode", badge: "B64", name: "Base64", shortcut: "Ctrl+3",
    description: "Encode and decode Base64 / Base64URL (UTF-8)",
    modes: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" },
            { value: "encode-url", label: "Encode URL-safe" }],
    keywords: "b64 atob btoa base64url", placeholder: "Text to encode, or Base64 to decode…" },
  { id: "base64img", section: "encode", badge: "IMG", name: "Base64 Image", kind: "image", job: true, chain: false,
    description: "Pictures to data: URIs and back, with the real type read from the bytes",
    modes: [{ value: "decode", label: "Data URI → image" }, { value: "encode", label: "Image → data URI" }],
    keywords: "data uri url picture png jpeg svg webp inline css",
    placeholder: "data:image/png;base64,… (or an image path for Image → data URI)" },
  { id: "url", section: "encode", badge: "%", name: "URL", shortcut: "Ctrl+4",
    description: "Encode, decode and break down URLs and query strings",
    modes: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" },
            { value: "parse", label: "Parse" }],
    keywords: "percent encode uri query string parser", placeholder: "https://example.com/path?q=hello%20world" },
  { id: "escape", section: "encode", badge: "\\n", name: "Escape", shortcut: "Ctrl+Shift+E",
    description: "HTML entities, string escapes and shell quoting",
    modes: [{ value: "html", label: "HTML encode" }, { value: "html-decode", label: "HTML decode" },
            { value: "escape", label: "Escape string" }, { value: "unescape", label: "Unescape" },
            { value: "shell", label: "Shell quote" }],
    keywords: "html entities backslash quote string literal unescape", placeholder: "Text to escape, or &lt;escaped&gt; text to decode…" },
  { id: "jwt", section: "encode", badge: "JWT", name: "JWT", shortcut: "Ctrl+2", job: true,
    description: "Decode a JWT, check its times, verify or create its signature",
    modes: [{ value: "decode", label: "Decode & verify" }, { value: "sign", label: "Sign" }],
    options: [
      { id: "secret", type: "text", secret: true, grow: true, placeholder: "Secret (HS…) or PEM public key (RS/PS/ES/EdDSA) to verify — optional", modes: ["decode"] },
      { id: "secret", type: "text", secret: true, grow: true, placeholder: "Secret to sign with", modes: ["sign"] },
      { id: "alg", type: "choice", value: "HS256", choices: ["HS256", "HS384", "HS512"], modes: ["sign"] },
      { id: "secretB64", type: "toggle", label: "Secret is Base64" }
    ],
    keywords: "json web token bearer hs256 rs256 verify signature claims",
    placeholder: "Paste a JWT (eyJ…)",
    placeholders: { sign: "Payload JSON to sign, e.g. {\"sub\":\"42\",\"exp\":1900000000}" } },
  { id: "hash", section: "encode", badge: "#", name: "Hash & HMAC", shortcut: "Ctrl+7", job: true, chain: false,
    description: "MD5, SHA-1/2/3, BLAKE2 and CRC32 of text or a file; HMAC with a key",
    modes: [{ value: "text", label: "Text" }, { value: "file", label: "File" }],
    options: [
      { id: "key", type: "text", secret: true, grow: true, placeholder: "HMAC key (optional)" },
      { id: "expect", type: "text", grow: true, placeholder: "Expected hash to compare (optional)" },
      { id: "base64", type: "toggle", label: "Base64" },
      { id: "upper", type: "toggle", label: "UPPER" }
    ],
    keywords: "md5 sha1 sha256 sha512 sha3 blake2 crc32 checksum digest hmac sri integrity sha256sum",
    placeholder: "Text to hash…", placeholders: { file: "Path to a file, e.g. ~/Downloads/archlinux.iso" } },
  { id: "number", section: "encode", badge: "0x", name: "Number Base", shortcut: "Ctrl+Shift+N",
    description: "Decimal, hex, octal and binary, exact at any size",
    modes: [{ value: "auto", label: "Auto" }, { value: "dec", label: "From dec" }, { value: "hex", label: "From hex" },
            { value: "oct", label: "From oct" }, { value: "bin", label: "From bin" }],
    keywords: "hex binary octal decimal radix twos complement bits",
    placeholder: "255, 0xff, 0b1111_1111, 0o377, -1 or a 128-bit hex value" },
  { id: "unicode", section: "encode", badge: "U+", name: "Unicode Inspector", shortcut: "Ctrl+Shift+U",
    description: "Every code point with its block, bytes and escapes; flags invisible and look-alike characters",
    modes: [{ value: "inspect", label: "Inspect" }, { value: "escape-js", label: "Escape non-ASCII" },
            { value: "strip", label: "Remove invisible" }],
    keywords: "character codepoint utf8 utf16 emoji zero width homoglyph confusable invisible",
    placeholder: "Paste text with odd characters… e.g. pаypal (with a Cyrillic а)" },

  // ---- Format & convert
  { id: "json", section: "format", badge: "{ }", name: "JSON", shortcut: "Ctrl+1",
    description: "Format, minify, sort and query JSON; reads JSONC and repairs it to strict JSON",
    modes: [{ value: "pretty2", label: "Format 2" }, { value: "pretty4", label: "Format 4" },
            { value: "minify", label: "Minify" }, { value: "sort", label: "Sort keys" }],
    options: [{ id: "query", type: "text", grow: true, placeholder: "Query: .items[0].sku  ·  $.items[*].price  ·  ..email  ·  .items[?(@.qty > 1)]" }],
    keywords: "jsonc json5 pretty print beautify validate lint jq jsonpath query",
    placeholder: "Paste JSON… (comments and trailing commas are fine)" },
  { id: "yaml", section: "format", badge: "YML", name: "JSON ⇄ YAML", shortcut: "Ctrl+Shift+Y",
    description: "Convert JSON to YAML and YAML (1.2, anchors, merge keys, multi-document) to JSON",
    modes: [{ value: "to-yaml", label: "JSON → YAML" }, { value: "to-json", label: "YAML → JSON" }],
    keywords: "yml kubernetes compose docker ci config",
    placeholder: "Paste JSON…", placeholders: { "to-json": "Paste YAML…" } },
  { id: "csv", section: "format", badge: "CSV", name: "JSON ⇄ CSV",
    description: "Arrays of objects to CSV and back; delimiter sniffed, 00123 stays a string",
    modes: [{ value: "to-csv", label: "JSON → CSV" }, { value: "to-json", label: "CSV → JSON" }],
    keywords: "tsv spreadsheet excel table comma separated",
    placeholder: "Paste a JSON array…", placeholders: { "to-json": "Paste CSV or TSV…" } },
  { id: "types", section: "format", badge: "T", name: "JSON → Types", shortcut: "Ctrl+Shift+T",
    description: "Types inferred from a JSON sample: optional and nullable fields, shared shapes",
    modes: [{ value: "ts", label: "TypeScript" }, { value: "zod", label: "Zod" }, { value: "go", label: "Go" },
            { value: "rust", label: "Rust" }, { value: "schema", label: "JSON Schema" }],
    options: [{ id: "root", type: "text", placeholder: "Root", width: 140, label: "Root type" }],
    keywords: "typescript interface zod golang struct rust serde json schema codegen",
    placeholder: "Paste a JSON sample…" },
  { id: "xml", section: "format", badge: "</>", name: "XML", description: "Format, minify and validate XML",
    modes: [{ value: "format", label: "Format" }, { value: "minify", label: "Minify" }],
    keywords: "xml svg rss soap plist pom pretty print",
    placeholder: "<config><server port=\"8080\"/></config>" },
  { id: "html", section: "format", badge: "<h>", name: "HTML Format", description: "Indent or minify HTML",
    modes: [{ value: "format", label: "Format" }, { value: "minify", label: "Minify" }],
    keywords: "html beautify pretty tidy markup",
    placeholder: "<div><p>Paste HTML…</p></div>" },
  { id: "css", section: "format", badge: "CSS", name: "CSS Format", description: "Indent or minify CSS",
    modes: [{ value: "format", label: "Format" }, { value: "minify", label: "Minify" }],
    keywords: "css stylesheet scss beautify minify",
    placeholder: "a{color:red}…" },
  { id: "sql", section: "format", badge: "SQL", name: "SQL Format", description: "Format or compact SQL queries",
    modes: [{ value: "format", label: "Format" }, { value: "minify", label: "Compact" }],
    options: [{ id: "lower", type: "toggle", label: "lowercase keywords" }],
    keywords: "sql query postgres mysql sqlite beautify",
    placeholder: "select id, name from users where active = true order by name" },

  // ---- Text
  { id: "case", section: "text", badge: "Aa", name: "Case Converter", shortcut: "Ctrl+8",
    description: "camelCase, snake_case, kebab-case and friends",
    modes: [], chainModes: "case",
    keywords: "camel snake kebab pascal title upper lower slug identifier", placeholder: "some variable name" },
  { id: "lines", section: "text", badge: "≡", name: "Lines", shortcut: "Ctrl+Shift+L",
    description: "Sort, dedupe, count and clean up lines",
    modes: [{ value: "sort", label: "Sort" }, { value: "sort-desc", label: "Sort ↓" }, { value: "unique", label: "Unique" },
            { value: "count", label: "Count" }, { value: "reverse", label: "Reverse" }, { value: "trim", label: "Trim" }],
    keywords: "sort uniq dedupe count lines reverse trim", placeholder: "One item per line…" },
  { id: "stats", section: "text", badge: "Σ", name: "Text Statistics",
    description: "Characters, words, lines, bytes, reading time and the most used words",
    modes: [], chain: false,
    keywords: "count words characters length bytes reading time", placeholder: "Paste text…" },
  { id: "diff", section: "text", badge: "±", name: "Text Diff", shortcut: "Ctrl+0", chain: false,
    description: "Line-by-line diff of two texts",
    modes: [], keywords: "compare difference changes", placeholder: "Original text…" },
  { id: "regex", section: "text", badge: ".*", name: "Regex Tester", shortcut: "Ctrl+9",
    description: "Test JavaScript regular expressions, groups and replace",
    modes: [], chainModes: "regex", keywords: "regexp regular expression match replace pattern",
    placeholder: "Test text…" },
  { id: "markdown", section: "text", badge: "MD", name: "Markdown", shortcut: "Ctrl+Shift+M",
    description: "Live GitHub-flavoured preview, and Markdown to HTML",
    modes: [{ value: "preview", label: "Preview" }, { value: "html", label: "HTML" }],
    keywords: "md readme gfm preview render", placeholder: "# Paste Markdown…" },
  { id: "htmlpreview", section: "text", badge: "◧", name: "HTML Preview",
    description: "Render HTML safely: scripts, styles, images and event handlers are removed first",
    modes: [{ value: "preview", label: "Preview" }, { value: "sanitized", label: "Sanitized HTML" }],
    keywords: "render html email template sanitize", placeholder: "<h1>Hello</h1><p>Paste HTML…</p>" },

  // ---- Time & web
  { id: "time", section: "web", badge: "TS", name: "Timestamp", shortcut: "Ctrl+5",
    description: "Unix epoch ⇄ human dates (s, ms, µs, ns, ISO 8601)",
    modes: [], keywords: "unix epoch date time iso 8601 rfc utc timezone",
    placeholder: "1700000000, 1700000000000, 2024-05-01T10:00:00Z or empty for now" },
  { id: "cron", section: "web", badge: "CR", name: "Cron", shortcut: "Ctrl+Shift+R", chain: false,
    description: "Explain a cron expression and list its next runs",
    modes: [{ value: "local", label: "Local time" }, { value: "utc", label: "UTC" }],
    keywords: "crontab schedule kubernetes github actions",
    placeholder: "*/15 9-17 * * 1-5   (minute hour day month weekday), or @daily" },
  { id: "color", section: "web", badge: "RGB", name: "Color", shortcut: "Ctrl+Shift+O", chain: false,
    description: "HEX, RGB, HSL, OKLCH and Hyprland colours, with contrast",
    modes: [], keywords: "colour hex rgb hsl oklch contrast wcag",
    placeholder: "#ff8800, rgb(255 136 0), hsl(32 100% 50%), oklch(70% 0.2 50), rgba(ff8800ff) or tomato" },
  { id: "qr", section: "web", badge: "QR", name: "QR Code", shortcut: "Ctrl+Shift+Q", kind: "image", job: true, chain: false,
    description: "Text, a URL or Wi-Fi details as a QR code you can copy or save",
    modes: [{ value: "text", label: "Text / URL" }, { value: "wifi", label: "Wi-Fi" }],
    options: [
      { id: "ssid", type: "text", grow: true, placeholder: "Network name (SSID)", modes: ["wifi"] },
      { id: "security", type: "choice", value: "WPA", choices: ["WPA", "WEP", "nopass"], modes: ["wifi"] },
      { id: "hidden", type: "toggle", label: "Hidden", modes: ["wifi"] },
      { id: "level", type: "choice", value: "M", choices: ["L", "M", "Q", "H"], label: "Error correction" }
    ],
    keywords: "qrcode barcode share wifi", placeholder: "https://example.com or any text…",
    placeholders: { wifi: "Wi-Fi password (leave empty for an open network)" } },
  { id: "qrread", section: "web", badge: "▣", name: "QR Reader", kind: "image", job: true, chain: false,
    description: "Read QR codes and barcodes from a copied image or an image file",
    modes: [], keywords: "scan decode qr barcode screenshot zbar",
    placeholder: "Copy an image and press From clipboard, or type an image path…" },

  // ---- Generate & inspect
  { id: "uuid", section: "generate", badge: "ID", name: "UUID & ULID", shortcut: "Ctrl+6", kind: "generator", chain: false,
    description: "Generate UUID v4 / v7 and ULIDs",
    modes: [{ value: "v4", label: "v4 random" }, { value: "v7", label: "v7 time-ordered" }, { value: "ulid", label: "ULID" }],
    keywords: "guid uuid4 uuid7 ulid generate", placeholder: "" },
  { id: "password", section: "generate", badge: "PW", name: "Passwords & Tokens", shortcut: "Ctrl+Shift+P", kind: "generator", chain: false,
    description: "CSPRNG passwords, PINs and random strings; letter sets skip I and l",
    modes: [{ value: "password", label: "Password" }, { value: "alnum", label: "Alphanumeric" },
            { value: "hex", label: "Hex" }, { value: "base64url", label: "Base64URL" }, { value: "pin", label: "PIN" }],
    keywords: "password random string token secret api key pin generator", placeholder: "" },
  { id: "lorem", section: "generate", badge: "Li", name: "Lorem Ipsum", kind: "generator", chain: false,
    description: "Placeholder paragraphs, sentences or words",
    modes: [{ value: "paragraphs", label: "Paragraphs" }, { value: "sentences", label: "Sentences" }, { value: "words", label: "Words" }],
    options: [
      { id: "count", type: "number", value: "3", label: "Count", width: 70, max: 100 },
      { id: "classic", type: "toggle", label: "Start with “Lorem ipsum”", value: true }
    ],
    keywords: "placeholder dummy filler text", placeholder: "" },
  { id: "ids", section: "generate", badge: "ID?", name: "ID Inspector", shortcut: "Ctrl+Shift+I",
    description: "What an ID is and when it was made: UUID, ULID, KSUID, ObjectId, Snowflake, XID…",
    modes: [], chain: false,
    keywords: "uuid ulid ksuid objectid mongodb snowflake discord twitter xid cuid nanoid decode timestamp",
    placeholder: "018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10, 01HXYZ…, 507f1f77bcf86cd799439011, 1234567890123456789…" },

  // ---- Session
  { id: "chains", section: "session", badge: "⛓", name: "Chains", kind: "view", chain: false,
    description: "Run several tools in a row, e.g. URL decode → Base64 decode → JSON format",
    modes: [], keywords: "pipeline workflow steps recipe", placeholder: "Input for the first step…" },
  { id: "history", section: "session", badge: "↺", name: "History", shortcut: "Ctrl+H", kind: "view", chain: false,
    description: "What you worked on this session. Kept in memory only, never written to disk",
    modes: [], keywords: "recent undo previous session", placeholder: "" }
]

// Tools that were modes of the JSON tool before 0.2. A summon payload such
// as {"tool":"json","mode":"yaml"} still lands in the right place.
var LEGACY_MODES = {
  "json/yaml": ["yaml", "to-yaml"], "json/ts": ["types", "ts"],
  "json/csv": ["csv", "to-csv"], "json/from-csv": ["csv", "to-json"],
  "hash/": ["hash", "text"], "jwt/": ["jwt", "decode"], "password/": ["password", "password"]
}

function legacyRoute(tool, mode) {
  var r = LEGACY_MODES[String(tool) + "/" + String(mode || "")]
  return r ? { tool: r[0], mode: r[1] } : null
}

function toolsIn(section) {
  return TOOLS.filter(function (t) { return t.section === section })
}

// Options a tool shows in a given mode.
function toolOptions(toolId, mode) {
  var t = toolById(toolId)
  return (t.options || []).filter(function (o) { return !o.modes || o.modes.indexOf(mode) !== -1 })
}

// Option values worth keeping out of history: secrets and keys.
function secretOptions(toolId) {
  return (toolById(toolId).options || []).filter(function (o) { return o.secret }).map(function (o) { return o.id })
}

// Option values with defaults filled in.
function optionDefaults(toolId) {
  var out = {}
  ;(toolById(toolId).options || []).forEach(function (o) {
    if (out.hasOwnProperty(o.id)) return
    out[o.id] = o.value !== undefined ? o.value : (o.type === "toggle" ? false : "")
  })
  return out
}

function placeholderFor(toolId, mode) {
  var t = toolById(toolId)
  return (t.placeholders && t.placeholders[mode]) || t.placeholder || ""
}

// Fuzzy tool search for the sidebar. Ranks name prefixes first, then word
// starts, substrings anywhere (keywords included) and finally in-order
// letters ("jfmt" finds JSON Format). Returns tools, best first.
function searchTools(query) {
  var q = String(query || "").toLowerCase().replace(/\s+/g, " ").trim()
  if (!q) return TOOLS.slice()
  var scored = []
  TOOLS.forEach(function (t, order) {
    var name = t.name.toLowerCase(), hay = (t.name + " " + t.id + " " + (t.keywords || "") + " " + t.description).toLowerCase()
    var score = -1
    if (name.indexOf(q) === 0 || t.id === q) score = 100
    else if ((" " + name).indexOf(" " + q) !== -1) score = 80
    else if (name.indexOf(q) !== -1) score = 70
    else if ((" " + hay).indexOf(" " + q) !== -1) score = 60
    else if (hay.indexOf(q) !== -1) score = 40
    else {
      var words = q.split(" ")
      if (words.length > 1 && words.every(function (w) { return hay.indexOf(w) !== -1 })) score = 35
      else {
        var j = 0, letters = q.replace(/ /g, "")
        for (var i = 0; i < name.length && j < letters.length; i++) if (name.charAt(i) === letters.charAt(j)) j++
        if (j === letters.length) score = 20
      }
    }
    if (score >= 0) scored.push({ t: t, s: score, o: order })
  })
  scored.sort(function (a, b) { return b.s - a.s || a.o - b.o })
  return scored.map(function (x) { return x.t })
}

function toolById(id) {
  for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]
  for (var j = 0; j < TOOLS.length; j++) if (TOOLS[j].id === "json") return TOOLS[j]
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
function jsonErrorLocation(text, raw) {
  var i = 0, depth = 0
  function fail(msg) { throw { at: i, msg: msg } }
  function ws() { while (i < text.length && " \t\n\r".indexOf(text[i]) !== -1) i++ }
  function value() {
    ws()
    var ch = text[i]
    // JSON.parse copes with any depth; this recursive scanner must not overflow.
    if ((ch === "{" || ch === "[") && ++depth > JSON_DEPTH_MAX) fail("Nested more than " + JSON_DEPTH_MAX + " levels deep")
    if (ch === "{") { object(); depth--; return }
    if (ch === "[") { array(); depth--; return }
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
    if (raw) return e
    return e.msg + " at " + lineCol(text, e.at)
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

// A tolerant reader for what people actually paste: JSONC and most of JSON5
// (comments, trailing commas, single quotes, unquoted keys, hex numbers,
// Python's True/False/None). It reports what it had to forgive, so the JSON
// tool can say "read as JSONC" and hand back strict JSON.
var JSON_DEPTH_MAX = 512

function parseLenientJson(text) {
  var i = 0, n = text.length, fixes = {}
  function fail(msg) { throw { at: i, msg: msg } }
  function ws() {
    for (;;) {
      while (i < n) {
        var c = text.charCodeAt(i)
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff || c === 0xa0) i++
        else break
      }
      if (text.charAt(i) === "/" && text.charAt(i + 1) === "/") {
        fixes.comments = true
        var e = text.indexOf("\n", i)
        i = e === -1 ? n : e + 1
        continue
      }
      if (text.charAt(i) === "/" && text.charAt(i + 1) === "*") {
        fixes.comments = true
        var e2 = text.indexOf("*/", i + 2)
        if (e2 === -1) fail("Unterminated comment")
        i = e2 + 2
        continue
      }
      return
    }
  }
  function set(o, k, v) {
    if (k === "__proto__") Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
    else o[k] = v
  }
  function value(depth) {
    if (depth > JSON_DEPTH_MAX) fail("Nested more than " + JSON_DEPTH_MAX + " levels deep")
    ws()
    var ch = text.charAt(i)
    if (ch === "{") return object(depth)
    if (ch === "[") return array(depth)
    if (ch === "\"" || ch === "'") return string()
    if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) return number()
    var word = ident()
    if (word === "true" || word === "false") return word === "true"
    if (word === "null") return null
    if (word === "True" || word === "False" || word === "None") { fixes.python = true; return word === "None" ? null : word === "True" }
    if (word === "undefined") { fixes.undefined = true; return null }
    if (word === "NaN" || word === "Infinity") { i -= word.length; fail(word + " has no JSON form") }
    if (word) { i -= word.length; fail("Unexpected word '" + word + "'") }
    fail(ch === "" ? "Unexpected end of input" : "Unexpected character '" + ch + "'")
  }
  // Character codes, not per-character regexes: Qt's engine is far slower at those.
  function identChar(c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 }
  function ident() {
    var start = i
    while (i < n && identChar(text.charCodeAt(i))) i++
    var c0 = text.charCodeAt(start)
    if (i > start && c0 >= 48 && c0 <= 57) { i = start; return "" }
    return text.slice(start, i)
  }
  function object(depth) {
    var o = {}
    i++; ws()
    if (text.charAt(i) === "}") { i++; return o }
    for (;;) {
      ws()
      var k, ch = text.charAt(i)
      if (ch === "\"" || ch === "'") k = string()
      else {
        k = ident()
        if (!k) fail(ch === "" ? "Unexpected end of input" : "Expected a key")
        fixes.unquotedKeys = true
      }
      ws()
      if (text.charAt(i) !== ":") fail("Expected ':' after key")
      i++
      set(o, k, value(depth + 1))
      ws()
      if (text.charAt(i) === ",") {
        i++; ws()
        if (text.charAt(i) === "}") { fixes.trailingCommas = true; i++; return o }
        continue
      }
      if (text.charAt(i) === "}") { i++; return o }
      fail("Expected ',' or '}'")
    }
  }
  function array(depth) {
    var a = []
    i++; ws()
    if (text.charAt(i) === "]") { i++; return a }
    for (;;) {
      a.push(value(depth + 1))
      ws()
      if (text.charAt(i) === ",") {
        i++; ws()
        if (text.charAt(i) === "]") { fixes.trailingCommas = true; i++; return a }
        continue
      }
      if (text.charAt(i) === "]") { i++; return a }
      fail("Expected ',' or ']'")
    }
  }
  function string() {
    var q = text.charAt(i), out = "", start
    if (q === "'") fixes.singleQuotes = true
    i++
    start = i
    while (i < n) {
      var ch = text.charAt(i)
      if (ch === q) { out += text.slice(start, i); i++; return out }
      if (ch === "\n") fail("Unterminated string")
      if (ch === "\\") {
        out += text.slice(start, i)
        var e = text.charAt(i + 1)
        var simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\\": "\\", "/": "/", "'": "'", "\"": "\"", "\n": "" }
        if (simple.hasOwnProperty(e)) { out += simple[e]; i += 2 }
        else if (e === "u" && /^[0-9A-Fa-f]{4}$/.test(text.substr(i + 2, 4))) { out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16)); i += 6 }
        else if (e === "x" && /^[0-9A-Fa-f]{2}$/.test(text.substr(i + 2, 2))) { out += String.fromCharCode(parseInt(text.substr(i + 2, 2), 16)); i += 4 }
        else fail("Invalid escape '\\" + e + "'")
        start = i
        continue
      }
      i++
    }
    fail("Unterminated string")
  }
  function number() {
    var start = i
    while (i < n) {
      var c = text.charCodeAt(i)
      if ((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) || c === 120 || c === 88 || c === 46 || c === 43 || c === 45) i++
      else break
    }
    var s = text.slice(start, i)
    var v = /^[+-]?0[xX][0-9A-Fa-f]+$/.test(s) ? parseInt(s, 16) : Number(s)
    if (s === "" || isNaN(v) || !isFinite(v)) { i = start; fail("Invalid number") }
    if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s)) fixes.numbers = true
    return v
  }
  try {
    var v = value(0); ws()
    if (i < n) fail("Unexpected content after JSON value")
    return { value: v, fixes: fixes }
  } catch (e) {
    if (e && e.msg === undefined) throw e
    return { error: e.msg + " at " + lineCol(text, e.at), at: e.at }
  }
}

function lineCol(text, at) {
  var before = text.slice(0, at)
  return "line " + before.split("\n").length + ", column " + (at - before.lastIndexOf("\n"))
}

var JSON_FIX_NAMES = { comments: "comments", trailingCommas: "trailing commas", singleQuotes: "single quotes",
  unquotedKeys: "unquoted keys", numbers: "non-JSON numbers", python: "True/False/None", undefined: "undefined" }

// Strict first; then the lenient reader. Returns { value } or { error },
// plus `lenient` (a note naming what was forgiven) when strict parsing failed.
function parseJsonInput(input) {
  try { return { value: JSON.parse(input) } } catch (e) {
    // The lenient reader goes first: when it fails too, its error (with line
    // and column) is the real problem, and the strict scan is not needed.
    var l = parseLenientJson(input)
    if (l.error) return { error: l.error }
    var where = jsonErrorLocation(input, true)
    var strict = where ? where.msg + " at " + lineCol(input, where.at) : String(e.message || e)
    var names = Object.keys(l.fixes).map(function (k) { return JSON_FIX_NAMES[k] })
    return { value: l.value, lenient: "Not strict JSON (" + strict + "). Read anyway"
      + (names.length ? ", allowing " + names.join(", ") : "") }
  }
}

// ---- Query: a JSONPath / jq-style path.
//   .a.b   ["key"]   [0]   [-1]   [1:3]   [*] or []   ..name (anywhere below)
//   [?(@.price > 10)]   [?(@.tags)]   (filters compare with == != < <= > >=)
var QUERY_MAX_RESULTS = 100000

function parseQuery(path) {
  var s = String(path).trim(), i = 0, steps = []
  if (s.charAt(0) === "$") i = 1
  function fail(msg) { throw "Query: " + msg + " at position " + (i + 1) }
  function literal(t) {
    t = t.trim()
    if (/^(["']).*\1$/.test(t)) return t.slice(1, -1)
    if (t === "true" || t === "false") return t === "true"
    if (t === "null") return null
    if (t !== "" && !isNaN(Number(t))) return Number(t)
    return t
  }
  while (i < s.length) {
    var ch = s.charAt(i)
    if (ch === "." && s.charAt(i + 1) === ".") {
      i += 2
      var m0 = /^(\*|[A-Za-z_$][\w$-]*)/.exec(s.slice(i))
      if (m0) { steps.push({ t: "deep", key: m0[1] === "*" ? null : m0[1] }); i += m0[1].length }
      else steps.push({ t: "deep", key: undefined })
      continue
    }
    if (ch === ".") {
      i++
      if (i >= s.length) break                        // "." alone is the whole document
      if (s.charAt(i) === "*") { steps.push({ t: "all" }); i++; continue }
      if (s.charAt(i) === "[") continue
      var m = /^[^.\[\]\s]+/.exec(s.slice(i))
      if (!m) fail("expected a key")
      steps.push({ t: "key", key: m[0] }); i += m[0].length
      continue
    }
    if (ch === "[") {
      var close = -1, q = "", depth = 0
      for (var j = i + 1; j < s.length; j++) {
        var c = s.charAt(j)
        if (q) { if (c === q) q = ""; continue }
        if (c === "\"" || c === "'") q = c
        else if (c === "[" || c === "(") depth++
        else if (c === ")") depth--
        else if (c === "]") { if (depth === 0) { close = j; break } depth-- }
      }
      if (close === -1) fail("unclosed [")
      var body = s.slice(i + 1, close).trim()
      i = close + 1
      var f
      if (body === "" || body === "*") steps.push({ t: "all" })
      else if (/^-?\d+$/.test(body)) steps.push({ t: "index", n: Number(body) })
      else if (/^(-?\d*):(-?\d*)$/.test(body)) {
        var sl = /^(-?\d*):(-?\d*)$/.exec(body)
        steps.push({ t: "slice", a: sl[1] === "" ? null : Number(sl[1]), b: sl[2] === "" ? null : Number(sl[2]) })
      } else if (/^(["']).*\1$/.test(body)) steps.push({ t: "key", key: body.slice(1, -1) })
      else if ((f = /^\?\(?\s*@((?:\.[\w$-]+|\[["'][^"']*["']\])*)\s*(?:(==|!=|<=|>=|<|>|=~)\s*(.+?))?\s*\)?$/.exec(body))) {
        var keys = []
        f[1].replace(/\.([\w$-]+)|\[["']([^"']*)["']\]/g, function (all, a, b) { keys.push(a !== undefined ? a : b); return "" })
        steps.push({ t: "filter", keys: keys, op: f[2] || "", value: f[2] ? literal(f[3]) : undefined })
      } else if (/^\d+(\s*,\s*\d+)+$/.test(body)) steps.push({ t: "indexes", list: body.split(",").map(Number) })
      else fail("cannot read [" + body + "]")
      continue
    }
    if (/\s/.test(ch)) { i++; continue }
    if (steps.length === 0 && /[A-Za-z_$]/.test(ch)) { s = "." + s.slice(i); i = 0; continue }
    fail("unexpected '" + ch + "'")
  }
  return steps
}

function queryJson(root, path) {
  var steps = parseQuery(path)
  var nodes = [root], multi = false
  function own(o, k) { return o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) }
  function children(v) {
    if (Array.isArray(v)) return v
    if (v && typeof v === "object") return Object.keys(v).map(function (k) { return v[k] })
    return []
  }
  function dig(v, keys) {
    for (var k = 0; k < keys.length; k++) { if (!own(v, keys[k])) return undefined; v = v[keys[k]] }
    return v
  }
  function compare(a, op, b) {
    if (op === "==") return a === b
    if (op === "!=") return a !== b
    if (op === "=~") { try { return new RegExp(String(b)).test(String(a)) } catch (e) { return false } }
    if (typeof a !== typeof b) return false
    return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b
  }
  steps.forEach(function (st) {
    var next = []
    if (st.t !== "key" && st.t !== "index") multi = true
    nodes.forEach(function (v) {
      if (next.length > QUERY_MAX_RESULTS) return
      if (st.t === "key") { if (own(v, st.key)) next.push(v[st.key]) }
      else if (st.t === "index") {
        if (Array.isArray(v)) { var ix = st.n < 0 ? v.length + st.n : st.n; if (ix >= 0 && ix < v.length) next.push(v[ix]) }
      } else if (st.t === "indexes") {
        if (Array.isArray(v)) st.list.forEach(function (ix) { if (ix < v.length) next.push(v[ix]) })
      } else if (st.t === "slice") {
        if (Array.isArray(v)) {
          var a = st.a === null ? 0 : (st.a < 0 ? Math.max(0, v.length + st.a) : st.a)
          var b = st.b === null ? v.length : (st.b < 0 ? v.length + st.b : st.b)
          Array.prototype.push.apply(next, v.slice(a, b))
        }
      } else if (st.t === "all") Array.prototype.push.apply(next, children(v))
      else if (st.t === "filter") {
        children(v).forEach(function (c) {
          var x = dig(c, st.keys)
          if (st.op ? compare(x, st.op, st.value) : x !== undefined && x !== null && x !== false) next.push(c)
        })
      } else if (st.t === "deep") {
        // Iterative walk: every node at or below v, document order.
        var stack = [v]
        while (stack.length && next.length <= QUERY_MAX_RESULTS) {
          var cur = stack.pop()
          if (st.key === undefined) next.push(cur)
          else if (st.key === null) Array.prototype.push.apply(next, children(cur))
          else if (own(cur, st.key) && !Array.isArray(cur)) next.push(cur[st.key])
          var kids = children(cur)
          for (var k = kids.length - 1; k >= 0; k--) if (kids[k] && typeof kids[k] === "object") stack.push(kids[k])
        }
      }
    })
    nodes = next
  })
  return { values: nodes, multi: multi }
}

function jsonTool(input, mode, opts) {
  if (input.trim() === "") return result()
  var p = parseJsonInput(input)
  if (p.error) return result("", p.error)
  var value = p.value, note = ""
  var query = String((opts && opts.query) || "").trim()
  if (query) {
    var q
    try { q = queryJson(value, query) } catch (e) { return result("", String(e)) }
    if (!q.multi && q.values.length === 0) return result("", "", "No match for " + query)
    value = q.multi ? q.values : q.values[0]
    note = q.multi ? q.values.length + (q.values.length === 1 ? " match" : " matches") + " · " : "Query result · "
  }
  var out
  if (mode === "minify") out = JSON.stringify(value)
  else if (mode === "sort") out = JSON.stringify(sortKeysDeep(value), null, 2)
  else out = JSON.stringify(value, null, mode === "pretty4" ? 4 : 2)
  if (out === undefined) out = "null"
  var r = result(out, "", p.lenient ? p.lenient : note + (query ? "" : "Valid JSON · ") + jsonStats(value))
  if (p.lenient) r.urgent = true
  return r
}

function yamlTool(input, mode) {
  if (input.trim() === "") return result()
  if (mode === "to-json") return yamlToJson(input)
  var p = parseJsonInput(input)
  if (p.error) return result("", p.error)
  if (tooDeep(p.value, CONVERT_DEPTH_MAX)) return result("", "Nested more than " + CONVERT_DEPTH_MAX + " levels deep")
  var r = result(toYaml(p.value), "", p.lenient || "YAML · " + jsonStats(p.value))
  if (p.lenient) r.urgent = true
  return r
}

function csvTool(input, mode) {
  if (input.trim() === "") return result()
  if (mode === "to-json") return csvToJson(input)
  var p = parseJsonInput(input)
  if (p.error) return result("", p.error)
  var csv = toCsv(p.value)
  if (csv.error) return result("", csv.error)
  return result(csv.text, "", csv.rows + " rows" + (csv.cols ? " × " + csv.cols + " columns" : ""))
}

function typesTool(input, mode, opts) {
  if (input.trim() === "") return result()
  var p = parseJsonInput(input)
  if (p.error) return result("", p.error)
  if (tooDeep(p.value, CONVERT_DEPTH_MAX)) return result("", "Nested more than " + CONVERT_DEPTH_MAX + " levels deep")
  var rootName = tsName(String((opts && opts.root) || "").trim() || "Root")
  var out, label
  if (mode === "go") { out = toGo(p.value, rootName); label = "Go structs" }
  else if (mode === "rust") { out = toRust(p.value, rootName); label = "Rust structs (serde)" }
  else if (mode === "zod") { out = toZod(p.value, rootName); label = "Zod schemas" }
  else if (mode === "schema") { out = toJsonSchema(p.value, rootName); label = "JSON Schema (2020-12)" }
  else { out = toTypeScript(p.value, rootName); label = "TypeScript" }
  return result(out, "", label + " inferred from this sample")
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

var JWT_HMAC = { HS256: 1, HS384: 1, HS512: 1 }
var JWT_ASYMMETRIC = { RS256: 1, RS384: 1, RS512: 1, PS256: 1, PS384: 1, PS512: 1, ES256: 1, ES384: 1, ES512: 1, EdDSA: 1, Ed25519: 1 }

function jwtDecode(token) {
  var parts = token.split(".")
  if (parts.length !== 3) return { error: "A JWT has three dot-separated parts; found " + parts.length }
  function part(idx, name) {
    var bytes = bytesFromBase64(parts[idx])
    var text = bytes && utf8Decode(bytes)
    if (text === null || text === undefined) throw name + " is not valid Base64URL"
    try { return JSON.parse(text) } catch (e) { throw name + " is not JSON" }
  }
  try { return { parts: parts, header: part(0, "Header"), payload: part(1, "Payload") } } catch (e) { return { error: String(e) } }
}

// mode: "decode" (with verification when a key is given), "sign", or, for
// chain steps, "payload" / "header" (just that JSON).
function jwtTool(input, nowMs, mode, opts) {
  opts = opts || {}
  if (mode === "sign") return jwtSign(input, opts)
  var token = input.trim().replace(/^Bearer\s+/i, "")
  if (token === "") return result()
  var d = jwtDecode(token)
  if (d.error) return result("", d.error)
  var header = d.header, payload = d.payload, parts = d.parts
  if (mode === "payload") return result(JSON.stringify(payload, null, 2), "", "JWT payload")
  if (mode === "header") return result(JSON.stringify(header, null, 2), "", "JWT header")

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
  if (typeof payload.exp === "number" && typeof payload.iat === "number" && payload.exp > payload.iat)
    claims.push("life  " + relative(payload.exp * 1000, payload.iat * 1000).replace(/^in /, ""))
  if (claims.length) lines.push("TIME CLAIMS", claims.join("\n"), "")
  lines.push("SIGNATURE", parts[2] || "(none)")
  var alg = String(header.alg || "")
  var r = { output: "", error: "", info: "", urgent: status === "EXPIRED" || status === "NOT YET VALID" }
  var head = (alg || "?") + (status ? " · " + status : "")
  var key = String(opts.secret || "")
  if (alg.toLowerCase() === "none") {
    lines.push("", "⚠ Unsigned token (alg: none). Anyone can forge it.")
    r.urgent = true
    r.info = head + " · unsigned"
  } else if (key.trim() === "") {
    lines.push("", "Not verified: enter the " + (JWT_HMAC[alg] ? "secret" : "public key (PEM)") + " above to check it.")
    r.info = head + " · signature not checked"
  } else if (!JWT_HMAC[alg] && !JWT_ASYMMETRIC[alg]) {
    lines.push("", "Cannot verify alg " + alg + ".")
    r.info = head
  } else {
    lines.push("", "Verifying…")
    r.info = head + " · verifying…"
    r.job = { cmd: "jwt-verify", payload: { signingInput: parts[0] + "." + parts[1], signature: parts[2], alg: alg,
                                            key: key, keyBase64: opts.secretB64 === true } }
  }
  r.output = lines.join("\n")
  r.head = head
  return r
}

function jwtSign(input, opts) {
  if (input.trim() === "") return result("", "", "Write the payload as JSON, then a secret")
  var p = parseJsonInput(input)
  if (p.error) return result("", "Payload: " + p.error)
  if (!p.value || typeof p.value !== "object" || Array.isArray(p.value)) return result("", "The payload must be a JSON object")
  var alg = JWT_HMAC[opts.alg] ? opts.alg : "HS256"
  var key = String(opts.secret || "")
  var signingInput = base64FromBytes(utf8Encode(JSON.stringify({ alg: alg, typ: "JWT" })), true) + "."
    + base64FromBytes(utf8Encode(JSON.stringify(p.value)), true)
  if (key === "") return result(signingInput + ".", "", "Unsigned: enter a secret to sign with " + alg)
  var r = result("", "", "Signing…")
  r.job = { cmd: "jwt-sign", payload: { signingInput: signingInput, alg: alg, key: key, keyBase64: opts.secretB64 === true } }
  return r
}

function jwtFinish(partial, resp, mode) {
  if (mode === "sign") {
    if (resp.error) return result("", resp.error)
    var token = partial.job.payload.signingInput + "." + resp.signature
    return result(token, "", partial.job.payload.alg + " · " + token.length + " characters · try it in Decode")
  }
  var r = { output: partial.output, error: "", info: partial.info, urgent: partial.urgent }
  if (resp.error) {
    r.output = partial.output.replace(/Verifying…$/, "✗ Could not verify: " + resp.error)
    r.info = partial.head + " · " + resp.error
    r.urgent = true
  } else if (resp.valid) {
    r.output = partial.output.replace(/Verifying…$/, "✓ Signature verified (" + partial.job.payload.alg + ")")
    r.info = partial.head + " · ✓ signature valid"
  } else {
    r.output = partial.output.replace(/Verifying…$/, "✗ Signature does NOT match this key")
    r.info = partial.head + " · ✗ invalid signature"
    r.urgent = true
  }
  return r
}

// ---------------------------------------------------------------- Hash

var HASH_ORDER = [["md5", "MD5"], ["sha1", "SHA-1"], ["sha224", "SHA-224"], ["sha256", "SHA-256"], ["sha384", "SHA-384"],
  ["sha512", "SHA-512"], ["sha3_256", "SHA3-256"], ["sha3_512", "SHA3-512"], ["blake2b", "BLAKE2b-512"],
  ["blake2s", "BLAKE2s-256"], ["crc32", "CRC32"]]

function hexToBase64(hex) { return base64FromBytes(hexToBytes(hex)) }

function hashTool(input, mode, opts) {
  opts = opts || {}
  if (input === "" || (mode === "file" && input.trim() === "")) return result("", "", mode === "file" ? "Enter a file path" : "")
  var r = result("", "", mode === "file" ? "Hashing file…" : "")
  var payload = { key: String(opts.key || "") }
  if (mode === "file") payload.path = input.trim()
  else payload.text = input
  r.job = { cmd: "hash", payload: payload }
  return r
}

// What people paste as "the expected hash": hex, Base64, an SRI value, or a
// line of sha256sum output.
function normalizeExpected(s) {
  var t = String(s || "").trim()
  if (!t) return ""
  t = t.split(/\s+/)[0]
  t = t.replace(/^(sha(1|224|256|384|512)|md5)[-:]/i, "")
  return t
}

function hashFinish(partial, resp, opts) {
  opts = opts || {}
  if (resp.error) return result("", resp.error)
  var hmac = !!resp.hmac, pairs = []
  var expect = normalizeExpected(opts.expect), matched = ""
  HASH_ORDER.forEach(function (h) {
    var hex = resp.digests[h[0]]
    if (hex === undefined) return
    var label = (hmac ? "HMAC-" : "") + h[1]
    if (expect && (expect.toLowerCase() === hex.toLowerCase() || expect === hexToBase64(hex) || expect.replace(/=+$/, "") === hexToBase64(hex).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")))
      matched = label
    var shown = opts.base64 ? hexToBase64(hex) : (opts.upper ? hex.toUpperCase() : hex)
    pairs.push([label + (expect && matched === label ? "  ✓" : ""), shown])
  })
  if (!hmac && resp.digests.sha384) pairs.push(["SRI", "sha384-" + hexToBase64(resp.digests.sha384)])
  var r = withPairs(pairs, (resp.path ? resp.path + " · " : "") + resp.bytes + " bytes" + (resp.path ? "" : " (UTF-8)") + (hmac ? " · keyed" : ""))
  if (expect) {
    r.info = matched ? "✓ Matches " + matched : "✗ Matches none of these hashes"
    r.urgent = !matched
  }
  return r
}

// ---------------------------------------------------------------- QR code

var QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 }   // bytes, version 40

function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, "\\$1") }

function qrPayload(input, mode, opts) {
  if (mode !== "wifi") return input
  var sec = opts.security === "WEP" || opts.security === "nopass" ? opts.security : "WPA"
  if (!String(opts.ssid || "").trim()) return ""
  return "WIFI:T:" + sec + ";S:" + wifiEscape(opts.ssid) + ";" + (sec !== "nopass" ? "P:" + wifiEscape(input) + ";" : "")
    + (opts.hidden ? "H:true;" : "") + ";"
}

function qrTool(input, mode, opts) {
  opts = opts || {}
  var text = qrPayload(input, mode, opts)
  if (text === "") return result("", "", mode === "wifi" ? "Enter the network name, then its password" : "Type text or a URL")
  var level = QR_CAPACITY[opts.level] ? opts.level : "M"
  var bytes = utf8Length(text)
  if (bytes > QR_CAPACITY[level]) return result("", bytes + " bytes is more than a QR code holds at level " + level + " (" + QR_CAPACITY[level] + ")")
  var r = result(text, "", "Rendering…")
  r.job = { cmd: "qr", payload: { text: text, level: level } }
  return r
}

function qrFinish(partial, resp) {
  if (resp.error) return result("", resp.error)
  var p = partial.job.payload
  var r = result(p.text, "", "Version " + resp.version + " · " + resp.modules + "×" + resp.modules + " modules · ECC " + p.level
    + " · " + utf8Length(p.text) + " bytes")
  r.image = resp.path
  return r
}

function qrreadTool(input) {
  var path = input.trim()
  if (path === "") return result("", "", "Copy an image of a code, then press From clipboard (or type an image path)")
  if (!/^(~\/|\/|\.\/)/.test(path)) return result("", "", "Type an image path (/…, ~/…), or press From clipboard")
  var r = result("", "", "Reading…")
  r.job = { cmd: "qr-read", payload: { path: path } }
  return r
}

function qrreadFinish(partial, resp) {
  if (resp.error) { var e = result("", resp.error); e.image = resp.path || ""; return e }
  var codes = resp.codes || []
  var r = result(codes.map(function (c) { return c.data }).join("\n"), "",
    codes.length + " code" + (codes.length === 1 ? "" : "s") + " · " + codes.map(function (c) { return c.type }).filter(function (t, i, a) { return a.indexOf(t) === i }).join(", "))
  r.image = resp.path || ""
  var wifi = codes.length === 1 && /^WIFI:/i.exec(codes[0].data)
  if (wifi) {
    var f = {}
    codes[0].data.slice(5).replace(/([A-Z]):((?:\\.|[^;])*);/g, function (m, k, v) { f[k] = v.replace(/\\(.)/g, "$1"); return "" })
    r.pairs = [["Network", f.S || ""], ["Password", f.P || "(none)"], ["Security", f.T || "nopass"], ["Hidden", f.H === "true" ? "yes" : "no"], ["Raw", codes[0].data]]
  }
  return r
}

// ---------------------------------------------------------------- Base64 image

var IMAGE_MAGIC = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/bmp", [0x42, 0x4d]], ["image/x-icon", [0x00, 0x00, 0x01, 0x00]], ["image/tiff", [0x49, 0x49, 0x2a, 0x00]],
  ["image/tiff", [0x4d, 0x4d, 0x00, 0x2a]], ["application/pdf", [0x25, 0x50, 0x44, 0x46]]
]

function sniffImage(bytes) {
  for (var i = 0; i < IMAGE_MAGIC.length; i++) {
    var sig = IMAGE_MAGIC[i][1], ok = true
    for (var j = 0; j < sig.length; j++) if (bytes[j] !== sig[j]) { ok = false; break }
    if (ok) return IMAGE_MAGIC[i][0]
  }
  var ascii = String.fromCharCode.apply(null, bytes.slice(0, 12))
  if (ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP") return "image/webp"
  if (ascii.slice(4, 8) === "ftyp") {
    var brand = ascii.slice(8, 12)
    if (/^avi[fs]$/.test(brand)) return "image/avif"
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return "image/heic"
  }
  var text = utf8Decode(bytes.slice(0, 256)) || ""
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return "image/svg+xml"
  return ""
}

// The data URI (or bare Base64) inside whatever was pasted: url(…), an
// <img src>, Markdown, or the URI itself.
function parseDataUri(input) {
  var s = input.trim()
  var m = /data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,([^"')\s>]*)/i.exec(s)
  if (m) return { mime: (m[1] || "").toLowerCase(), base64: !!m[3], data: m[4] }
  if (/^[A-Za-z0-9+\/=_\-\s]+$/.test(s) && s.replace(/\s/g, "").length >= 16) return { mime: "", base64: true, data: s.replace(/\s/g, "") }
  return null
}

function base64imgTool(input, mode) {
  if (mode === "encode") {
    var path = input.trim()
    if (path === "") return result("", "", "Press From clipboard to encode a copied image, or type an image path")
    if (!/^(~\/|\/|\.\/)/.test(path)) return result("", "", "Type an image path (/…, ~/…), or press From clipboard")
    var e = result("", "", "Reading image…")
    e.job = { cmd: "image-encode", payload: { path: path } }
    return e
  }
  if (input.trim() === "") return result("", "", "Paste a data: URI, a CSS url(…) or bare Base64")
  var d = parseDataUri(input)
  if (!d) return result("", "No data: URI or Base64 found")
  if (!d.base64) {
    // Percent-encoded (usually SVG): decode here.
    var txt
    try { txt = decodeURIComponent(d.data) } catch (x) { return result("", "Malformed percent-encoding in the data: URI") }
    d.data = base64FromBytes(utf8Encode(txt))
  }
  var head = bytesFromBase64(d.data.slice(0, 344))
  if (!head) return result("", "Not valid Base64")
  var sniffed = sniffImage(head)
  if (!sniffed) return result("", "The bytes are not an image type this tool recognises" + (d.mime ? " (declared " + d.mime + ")" : ""))
  if (sniffed === "application/pdf") return result("", "That is a PDF, not an image")
  var r = result("", "", "Decoding…")
  r.declared = d.mime
  r.sniffed = sniffed
  r.job = { cmd: "image-decode", payload: { base64: d.data, mime: sniffed } }
  return r
}

function sizeText(n) {
  return n < 1024 ? n + " B" : n < 1048576 ? round(n / 1024, 1) + " KiB" : round(n / 1048576, 2) + " MiB"
}

function base64imgFinish(partial, resp, mode) {
  if (resp.error) return result("", resp.error)
  var dims = resp.width ? resp.width + "×" + resp.height : "unknown size"
  var r
  if (mode === "encode") {
    var uri = "data:" + resp.mime + ";base64," + resp.base64
    function cut(s) { return s.length > 160 ? s.slice(0, 160) + "…  (" + sizeText(s.length) + ")" : s }
    var pairs = [
      ["Data URI", cut(uri), uri],
      ["CSS", cut("url(\"" + uri + "\")"), "url(\"" + uri + "\")"],
      ["HTML", cut("<img src=\"" + uri + "\" width=\"" + (resp.width || "") + "\" height=\"" + (resp.height || "") + "\" alt=\"\">"),
        "<img src=\"" + uri + "\" width=\"" + (resp.width || "") + "\" height=\"" + (resp.height || "") + "\" alt=\"\">"],
      ["Markdown", cut("![](" + uri + ")"), "![](" + uri + ")"],
      ["Base64", cut(resp.base64), resp.base64]
    ]
    r = withPairs(pairs.map(function (p) { return [p[0], p[1]] }), resp.mime + " · " + dims + " · " + sizeText(resp.bytes) + " → " + sizeText(uri.length) + " as text")
    r.pairs = pairs
    r.output = uri
    r.image = resp.path
    return r
  }
  var declared = partial.declared, sniffed = partial.sniffed
  var p2 = [["Type", sniffed + "  (read from the bytes)"], ["Dimensions", dims], ["Size", sizeText(resp.bytes) + " decoded"]]
  if (declared && declared !== sniffed && !(declared === "image/jpg" && sniffed === "image/jpeg"))
    p2.push(["⚠ Declared", declared + ", but the bytes are " + sniffed])
  r = withPairs(p2, sniffed + " · " + dims + " · " + sizeText(resp.bytes))
  r.urgent = p2.length > 3
  r.output = "data:" + sniffed + ";base64," + partial.job.payload.base64
  r.image = resp.path
  return r
}

// Dispatch for results that needed bin/devkit-helper.
function finish(toolId, state, partial, resp) {
  resp = resp || { error: "No answer from bin/devkit-helper" }
  var mode = state.mode || ""
  switch (toolId) {
  case "jwt": return jwtFinish(partial, resp, mode)
  case "hash": return hashFinish(partial, resp, state.opts)
  case "qr": return qrFinish(partial, resp)
  case "qrread": return qrreadFinish(partial, resp)
  case "base64img": return base64imgFinish(partial, resp, mode)
  }
  return result("", "Unknown job")
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
// Random strings that are not passwords use one fixed alphabet each, with no
// per-set guarantee: every character is drawn from the whole alphabet.
var TOKEN_ALPHABETS = {
  alnum: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  hex: "0123456789abcdef",
  base64url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  pin: "0123456789"
}

function passwordAlphabet(opts) {
  var excluded = passwordExcluded(opts.exclude)
  var selected = []
  if (opts.mode && TOKEN_ALPHABETS[opts.mode]) selected.push(TOKEN_ALPHABETS[opts.mode])
  else {
    if (opts.upper) selected.push(PASSWORD_SETS.upper)
    if (opts.lower) selected.push(PASSWORD_SETS.lower)
    if (opts.digits) selected.push(PASSWORD_SETS.digits)
    if (opts.special) selected.push(PASSWORD_SETS.special)
  }
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
  var label = opts.mode === "pin" ? "digits" : "chars"
  return { output: out.join("\n"), error: "",
           info: count + " × " + length + " " + label + " · " + bits + " bits each" + (weak ? " · weak" : ""),
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

var CASE_NAMES = ["camelCase", "PascalCase", "snake_case", "SCREAMING_SNAKE", "kebab-case", "Train-Case", "dot.case",
  "path/case", "Title Case", "Sentence case", "lower case", "UPPER CASE"]

// `mode` names one variant (a chain step converts each line to it);
// otherwise every variant is listed.
function caseTool(input, mode) {
  if (input.trim() === "") return result()
  if (input.length > CASE_MAX) return result("", "Case conversion is for identifiers and short text (" + CASE_MAX + " characters max)")
  if (mode && CASE_NAMES.indexOf(mode) !== -1) {
    var k = CASE_NAMES.indexOf(mode)
    return result(input.split("\n").map(function (l) { var v = caseVariants(l); return v.length ? v[k][1] : l }).join("\n"), "", mode)
  }
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

// Chain steps: every match on its own line, the first group of each, or a replace.
function regexChainStep(text, mode, opts) {
  var pattern = String(opts.pattern || ""), flags = String(opts.flags === undefined ? "g" : opts.flags)
  if (pattern === "") return result("", "Enter a pattern")
  if (mode === "replace") return regexTool(pattern, flags, text, String(opts.replacement || ""), true)
  var re
  try { re = new RegExp(pattern, flags.replace(/g/g, "") + "g") } catch (e) { return result("", String(e.message || e)) }
  var out = [], m
  while ((m = re.exec(text)) !== null && out.length < 100000) {
    out.push(mode === "group" ? (m[1] === undefined ? "" : m[1]) : m[0])
    if (m[0] === "") re.lastIndex++
  }
  return result(out.join("\n"), "", out.length + (out.length === 1 ? " match" : " matches"))
}

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

// ---- YAML → JSON
// A YAML 1.2 reader for real-world config: block and flow collections,
// plain/quoted/block scalars, comments, anchors, aliases, merge keys (<<) and
// multi-document streams. Follows the 1.2 core schema, so `no` stays the
// string "no". Linear in the input: every line is visited a bounded number
// of times, and nesting is capped.
var YAML_DEPTH_MAX = 200
var YAML_MAX = 2097152

function yamlParse(text) {
  var raw = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n")
  var lines = []          // { n, indent, text } with comments stripped, or null when blank
  var anchors = {}, warnings = [], docs = []
  var li = 0, depth = 0, warned = {}

  function fail(msg, n) { throw { yaml: true, msg: "Line " + ((n === undefined ? (lines[li] ? lines[li].n : raw.length) : n) + 1) + ": " + msg } }
  function warn(key, msg) { if (!warned[key]) { warned[key] = true; warnings.push(msg) } }

  // Comment stripping: '#' starts a comment at the line start or after
  // whitespace, outside quotes. Quotes only open where a scalar can start.
  function stripComment(s) {
    var q = "", prev = ""
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i)
      if (q) {
        if (q === "\"" && c === "\\") { i++; continue }
        if (c === q) { if (q === "'" && s.charAt(i + 1) === "'") { i++; continue } q = "" }
        continue
      }
      if ((c === "\"" || c === "'") && (prev === "" || ":-[{,?&!|>".indexOf(prev) !== -1 || /\s/.test(s.charAt(i - 1)) && (prev === ":" || prev === "-" || prev === ","))) {
        if (i === 0 || /[\s\[{,]/.test(s.charAt(i - 1))) { q = c; continue }
      }
      if (c === "#" && (i === 0 || /\s/.test(s.charAt(i - 1)))) return s.slice(0, i).replace(/\s+$/, "")
      if (!/\s/.test(c)) prev = c
    }
    return s.replace(/\s+$/, "")
  }

  function prepare(from, to) {
    lines = []
    for (var i = from; i < to; i++) {
      var r = raw[i]
      var m = /^( *)(.*)$/.exec(r)
      if (/^\t/.test(m[2]) && m[2].trim() !== "" && m[2].trim().charAt(0) !== "#") fail("Tabs cannot be used for indentation", i)
      var t = stripComment(m[2])
      lines.push(t === "" ? { n: i, blank: true, raw: r } : { n: i, indent: m[1].length, text: t, raw: r })
    }
    li = 0
  }

  function skipBlank() { while (li < lines.length && lines[li].blank) li++ }
  function peek() { skipBlank(); return li < lines.length ? lines[li] : null }

  // ---- scalars
  function resolvePlain(s) {
    if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null
    if (s === "true" || s === "True" || s === "TRUE") return true
    if (s === "false" || s === "False" || s === "FALSE") return false
    if (/^[-+]?[0-9]+$/.test(s)) {
      var n = Number(s)
      if (Math.abs(n) > 9007199254740991) { warn("big", "Integers above 2^53 lose precision in JSON (" + s + ")"); }
      return n
    }
    if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8)
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16)
    if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s)
    if (/^[-+]?\.(inf|Inf|INF)$/.test(s) || /^\.(nan|NaN|NAN)$/.test(s)) {
      warn("inf", s + " has no JSON form; kept as a string")
      return s
    }
    if (/^(yes|no|on|off)$/i.test(s)) warn("yes", "yes/no/on/off are strings in YAML 1.2 (booleans only in 1.1)")
    return s
  }

  function applyTag(tag, v, wasPlain, n) {
    if (!tag) return v
    if (tag === "!!str") return v === null ? (wasPlain ? "" : v) : String(wasPlain && typeof v !== "string" ? v : v)
    if (tag === "!!int") { var i = parseInt(v, 10); if (isNaN(i)) fail("!!int needs an integer", n); return i }
    if (tag === "!!float") { var f = Number(v); if (isNaN(f)) fail("!!float needs a number", n); return f }
    if (tag === "!!bool") return v === true || v === "true" || v === "True" || v === "TRUE"
    if (tag === "!!null") return null
    if (/^!!(map|seq|binary|timestamp|set|omap)$/.test(tag)) return v
    warn("tag" + tag, "Custom tag " + tag + " ignored; its value is kept as is")
    return v
  }

  function doubleQuoted(s, n) {
    return s.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[\s\S])/g, function (m, e) {
      var simple = { "0": "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b",
                     " ": " ", "\"": "\"", "/": "/", "\\": "\\", N: "\u0085", _: "\u00a0", L: "\u2028", P: "\u2029" }
      if (simple.hasOwnProperty(e)) return simple[e]
      if (e.length > 1) { var c = codePoint(parseInt(e.slice(1), 16)); if (c !== null) return c }
      fail("Invalid escape \\" + e, n)
    })
  }

  // Folding for multi-line quoted and plain scalars: one line break between
  // two lines becomes a space; each extra (empty) line stays a newline.
  function fold(parts) {
    var out = "", pendingBreaks = -1
    parts.forEach(function (p) {
      if (p === "") { pendingBreaks++; return }
      if (out === "" && pendingBreaks < 0) out = p
      else out += (pendingBreaks > 0 ? new Array(pendingBreaks + 1).join("\n") : " ") + p
      pendingBreaks = 0
    })
    return out
  }

  // A quoted scalar starting at text[0] (the quote), possibly continuing on
  // the following raw lines. Returns { value, rest } where rest is what
  // follows the closing quote on its line.
  function quoted(text, line) {
    var q = text.charAt(0), parts = [], cur = text.slice(1), n = line.n, idx = li
    for (;;) {
      var end = -1
      for (var i = 0; i < cur.length; i++) {
        var c = cur.charAt(i)
        if (q === "\"" && c === "\\") { i++; continue }
        if (c === q) { if (q === "'" && cur.charAt(i + 1) === "'") { i++; continue } end = i; break }
      }
      if (end !== -1) {
        parts.push(parts.length ? cur.slice(0, end).replace(/^\s+/, "") : cur.slice(0, end))
        var restText = stripComment(cur.slice(end + 1))
        // Lines consumed after the first were raw continuation lines.
        li = idx
        var body = parts.length > 1 ? fold(parts.map(function (p, k) { return k < parts.length - 1 ? p.replace(/\s+$/, "") : p })) : parts[0]
        return { value: q === "'" ? body.replace(/''/g, "'") : doubleQuoted(body, n), rest: restText.trim() }
      }
      parts.push(parts.length ? cur.trim() : cur.replace(/\s+$/, ""))
      idx++
      if (idx >= lines.length) fail("Unterminated quoted string", n)
      cur = lines[idx].raw
    }
  }

  function blockScalar(header, parentIndent, n) {
    var m = /^([|>])([+-]?)([1-9]?)([+-]?)$/.exec(header)
    if (!m) fail("Bad block scalar header '" + header + "'", n)
    var literal = m[1] === "|", chomp = m[2] || m[4], explicit = m[3] ? parentIndent + Number(m[3]) : 0
    var body = [], indent = explicit
    while (li < lines.length) {
      var r = lines[li].raw, lead = /^ */.exec(r)[0].length
      if (r.trim() === "") { body.push(""); li++; continue }
      if (!indent) indent = lead
      if (lead < indent || lead <= parentIndent) break
      body.push(r.slice(indent))
      li++
    }
    // Trailing blank lines belong to the chomping, and to the next node.
    var trailing = 0
    while (body.length && body[body.length - 1] === "") { body.pop(); trailing++ }
    // Hand the trailing blank lines back so line numbers stay right.
    var text
    if (literal) text = body.join("\n")
    else {
      text = ""
      for (var i = 0; i < body.length; i++) {
        var l = body[i], more = /^\s/.test(l)
        if (i === 0) { text = l; continue }
        var prevMore = /^\s/.test(body[i - 1])
        if (l === "") text += "\n"
        else if (body[i - 1] === "" || more || prevMore) text += (body[i - 1] === "" ? "" : "\n") + l
        else text += " " + l
      }
    }
    if (!body.length) return chomp === "+" ? new Array(trailing + 1).join("\n") : ""
    if (chomp === "-") return text
    if (chomp === "+") return text + "\n" + new Array(trailing + 1).join("\n")
    return text + "\n"
  }

  // ---- flow collections: [a, b, {k: v}] possibly over several lines
  function flow(textFirst, line) {
    var buf = textFirst, n = line.n, idx = li
    function balanced(s) {
      var d = 0, q = ""
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i)
        if (q) { if (q === "\"" && c === "\\") { i++; continue } if (c === q) q = ""; continue }
        if ((c === "\"" || c === "'") && (i === 0 || /[\s\[{,:]/.test(s.charAt(i - 1)))) q = c
        else if (c === "[" || c === "{") d++
        else if (c === "]" || c === "}") { d--; if (d === 0) return i }
      }
      return -1
    }
    var end
    while ((end = balanced(buf)) === -1) {
      idx++
      if (idx >= lines.length) fail("Unclosed flow collection", n)
      if (!lines[idx].blank) buf += " " + lines[idx].text
    }
    li = idx
    var pos = 0, s = buf.slice(0, end + 1), fdepth = 0
    function ws() { while (pos < s.length && /\s/.test(s.charAt(pos))) pos++ }
    function node() {
      ws()
      if (++fdepth > YAML_DEPTH_MAX) fail("Nested too deeply", n)
      var c = s.charAt(pos), v
      if (c === "[") {
        v = []; pos++; ws()
        while (s.charAt(pos) !== "]") {
          if (pos >= s.length) fail("Unclosed [", n)
          var item = node(); ws()
          if (s.charAt(pos) === ":" ) { pos++; var o = {}; o[String(item)] = node(); item = o; ws() }
          v.push(item)
          if (s.charAt(pos) === ",") { pos++; ws() } else if (s.charAt(pos) !== "]") fail("Expected , or ] in flow sequence", n)
        }
        pos++
      } else if (c === "{") {
        v = {}; pos++; ws()
        while (s.charAt(pos) !== "}") {
          if (pos >= s.length) fail("Unclosed {", n)
          var k = node(); ws()
          var val = null
          if (s.charAt(pos) === ":") { pos++; val = node(); ws() }
          setKey(v, k, val, n)
          if (s.charAt(pos) === ",") { pos++; ws() } else if (s.charAt(pos) !== "}") fail("Expected , or } in flow mapping", n)
        }
        pos++
      } else if (c === "\"" || c === "'") {
        var j = pos + 1
        for (; j < s.length; j++) {
          var ch = s.charAt(j)
          if (c === "\"" && ch === "\\") { j++; continue }
          if (ch === c) { if (c === "'" && s.charAt(j + 1) === "'") { j++; continue } break }
        }
        var bodyq = s.slice(pos + 1, j)
        pos = j + 1
        v = c === "'" ? bodyq.replace(/''/g, "'") : doubleQuoted(bodyq, n)
      } else if (c === "*") {
        var am = /^\*([^\s,\[\]{}]+)/.exec(s.slice(pos))
        pos += am[0].length
        v = alias(am[1], n)
      } else {
        var props = ""
        while (/^[&!]/.test(s.slice(pos))) {
          var pm = /^[&!][^\s,\[\]{}]*/.exec(s.slice(pos))
          props += pm[0] + " "; pos += pm[0].length; ws()
        }
        var start = pos
        while (pos < s.length) {
          var d = s.charAt(pos)
          if (d === "," || d === "]" || d === "}") break
          if (d === ":" && (pos + 1 >= s.length || /[\s,\]}]/.test(s.charAt(pos + 1)))) break
          pos++
        }
        var plain = s.slice(start, pos).trim()
        if (props) {
          fdepth--
          var inner = /[\[{"']/.test(s.charAt(start)) ? (pos = start, node()) : resolvePlain(plain)
          return withProps(props.trim(), inner, !/[\[{"']/.test(s.charAt(start)), n)
        }
        v = resolvePlain(plain)
      }
      fdepth--
      return v
    }
    var value = node()
    ws()
    var rest = stripComment(buf.slice(end + 1)).trim()
    if (rest !== "" ) fail("Unexpected text after flow collection: " + rest, n)
    return value
  }

  function alias(name, n) {
    if (!Object.prototype.hasOwnProperty.call(anchors, name)) fail("Unknown alias *" + name, n)
    return anchors[name]
  }

  function withProps(props, v, plain, n) {
    var tag = "", anchor = ""
    props.split(/\s+/).forEach(function (p) { if (p.charAt(0) === "&") anchor = p.slice(1); else if (p.charAt(0) === "!") tag = p })
    v = applyTag(tag, v, plain, n)
    if (anchor) anchors[anchor] = v
    return v
  }

  function setKey(obj, k, v, n) {
    var key = k === null ? "null" : (typeof k === "object" ? JSON.stringify(k) : String(k))
    if (Object.prototype.hasOwnProperty.call(obj, key)) warn("dup" + key, "Duplicate key '" + key + "' (line " + (n + 1) + "); the last one wins")
    if (key === "__proto__") Object.defineProperty(obj, key, { value: v, enumerable: true, writable: true, configurable: true })
    else obj[key] = v
  }

  // Where a mapping key ends: the first ':' followed by a space or the end of
  // line, outside quotes and brackets. -1 when the line is not a key.
  function keyEnd(t) {
    var c0 = t.charAt(0)
    if (c0 === "[" || c0 === "{") return -1
    var i = 0
    if (c0 === "\"" || c0 === "'") {
      for (i = 1; i < t.length; i++) {
        if (c0 === "\"" && t.charAt(i) === "\\") { i++; continue }
        if (t.charAt(i) === c0) { if (c0 === "'" && t.charAt(i + 1) === "'") { i++; continue } break }
      }
      var after = t.slice(i + 1).replace(/^\s*/, "")
      return after.charAt(0) === ":" && (after.length === 1 || /\s/.test(after.charAt(1))) ? t.length - after.length : -1
    }
    for (i = 0; i < t.length; i++) {
      if (t.charAt(i) === ":" && (i + 1 === t.length || /\s/.test(t.charAt(i + 1)))) return i
    }
    return -1
  }

  function isSeqLine(t) { return t === "-" || /^-\s/.test(t) }

  // ---- inline value after "key:" or "- ", or a scalar node
  function inlineValue(text, line, parentIndent) {
    var props = ""
    while (/^[&!]/.test(text)) {
      var pm = /^([&!][^\s]*)\s*/.exec(text)
      props += pm[1] + " "
      text = text.slice(pm[0].length)
    }
    var v, plain = false
    if (text === "") {
      li++
      v = nested(parentIndent, true)
    } else if (text.charAt(0) === "*") {
      v = alias(text.slice(1).trim(), line.n); li++
    } else if (text.charAt(0) === "[" || text.charAt(0) === "{") {
      v = flow(text, line); li++
    } else if (text.charAt(0) === "\"" || text.charAt(0) === "'") {
      var q = quoted(text, line)
      if (q.rest !== "") fail("Unexpected text after a quoted value: " + q.rest, line.n)
      v = q.value; li++
    } else if (text.charAt(0) === "|" || text.charAt(0) === ">") {
      li++
      v = blockScalar(text, parentIndent, line.n)
    } else {
      if (keyEnd(text) !== -1 && !/^[\w.-]+:\/\//.test(text)) fail("A mapping cannot start on the same line as another key; put it on its own line", line.n)
      var parts = [text]
      li++
      // Plain multi-line scalar: more-indented lines that are not keys or items.
      while (li < lines.length) {
        var nx = lines[li]
        if (nx.blank) { var k = li; while (k < lines.length && lines[k].blank) k++
          if (k < lines.length && lines[k].indent > parentIndent && keyEnd(lines[k].text) === -1 && !isSeqLine(lines[k].text)) { for (; li < k; li++) parts.push(""); continue }
          break }
        if (nx.indent <= parentIndent || keyEnd(nx.text) !== -1 || isSeqLine(nx.text)) break
        parts.push(nx.text.trim()); li++
      }
      v = parts.length > 1 ? fold(parts) : resolvePlain(text)
      plain = parts.length === 1
    }
    return props ? withProps(props.trim(), v, plain, line.n) : v
  }

  function nested(parentIndent, allowSameIndentSeq) {
    var nx = peek()
    if (!nx) return null
    if (nx.indent > parentIndent) return block(nx.indent)
    if (allowSameIndentSeq && nx.indent === parentIndent && isSeqLine(nx.text)) return block(nx.indent, true)
    return null
  }

  function block(indent, seqOnly) {
    if (++depth > YAML_DEPTH_MAX) fail("Nested more than " + YAML_DEPTH_MAX + " levels deep")
    var line = peek(), v
    if (isSeqLine(line.text)) v = sequence(indent)
    else if (seqOnly) v = null
    else if (keyEnd(line.text) !== -1 || line.text === "<<" || /^\?\s/.test(line.text)) v = mapping(indent)
    else v = inlineValue(line.text, line, indent - 1)
    depth--
    return v
  }

  function sequence(indent) {
    var arr = []
    for (;;) {
      var line = peek()
      if (!line || line.indent < indent) break
      if (line.indent > indent) fail("Bad indentation in a sequence", line.n)
      if (!isSeqLine(line.text)) break
      var rest = line.text.slice(1).replace(/^\s+/, "")
      if (rest === "") { li++; arr.push(nested(indent, false)); continue }
      var col = indent + (line.text.length - rest.length)
      if (isSeqLine(rest) || (keyEnd(rest) !== -1 && rest.charAt(0) !== "[" && rest.charAt(0) !== "{" && !/^[&!*]/.test(rest))) {
        // "- key: v" or "- - x": the rest is a node of its own at its column.
        lines[li] = { n: line.n, indent: col, text: rest, raw: line.raw }
        arr.push(block(col))
      } else arr.push(inlineValue(rest, line, indent))
    }
    return arr
  }

  function mapping(indent) {
    var obj = {}, merges = []
    for (;;) {
      var line = peek()
      if (!line || line.indent < indent) break
      if (line.indent > indent) fail("Bad indentation in a mapping", line.n)
      var t = line.text
      if (isSeqLine(t)) break
      if (/^\?\s/.test(t)) fail("Complex keys (? …) are not supported", line.n)
      var e = keyEnd(t)
      if (e === -1) fail("Expected 'key: value'", line.n)
      var keyText = t.slice(0, e).trim(), valueText = t.slice(e + 1).trim(), key
      if (keyText.charAt(0) === "\"" || keyText.charAt(0) === "'") key = quoted(keyText, line).value
      else {
        var kp = ""
        while (/^[&!]/.test(keyText)) { var km = /^([&!][^\s]*)\s*/.exec(keyText); kp += km[1] + " "; keyText = keyText.slice(km[0].length) }
        key = keyText
      }
      var value = inlineValue(valueText, line, indent)
      if (key === "<<") {
        var srcs = Array.isArray(value) ? value : [value]
        srcs.forEach(function (s) { if (!s || typeof s !== "object" || Array.isArray(s)) fail("<< merges mappings only", line.n) })
        Array.prototype.push.apply(merges, srcs)
      } else setKey(obj, key, value, line.n)
    }
    // Merged keys never override the mapping's own keys; earlier sources win.
    merges.forEach(function (m) {
      Object.keys(m).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(obj, k)) obj[k] = m[k] })
    })
    return obj
  }

  // ---- documents
  var start = 0, sawMarker = false, i
  function doc(from, to, inlineAfterMarker) {
    prepare(from, to)
    if (inlineAfterMarker !== undefined && inlineAfterMarker !== "") {
      lines.unshift({ n: from - 1, indent: 0, text: inlineAfterMarker, raw: inlineAfterMarker })
    }
    var first = peek()
    if (!first) { docs.push(null); return }
    var v = block(first.indent)
    var extra = peek()
    if (extra) fail(extra.indent > first.indent ? "Bad indentation" : "Unexpected content", extra.n)
    docs.push(v)
  }
  var pendingInline
  for (i = 0; i < raw.length; i++) {
    var r = raw[i]
    if (/^%/.test(r) && !sawMarker) { start = i + 1; continue }
    var dm = /^(---|\.\.\.)(\s+(.*))?$/.exec(r)
    if (dm) {
      if (i > start || pendingInline !== undefined) {
        var hasContent = pendingInline || raw.slice(start, i).some(function (l) { var t = l.trim(); return t !== "" && t.charAt(0) !== "#" })
        if (hasContent || sawMarker) doc(start, i, pendingInline)
      }
      sawMarker = true
      pendingInline = dm[1] === "---" ? stripComment(dm[3] || "") : undefined
      start = i + 1
    }
  }
  var tailContent = pendingInline || raw.slice(start).some(function (l) { var t = l.trim(); return t !== "" && t.charAt(0) !== "#" })
  if (tailContent || !docs.length) doc(start, raw.length, pendingInline)
  return { docs: docs, warnings: warnings }
}

function yamlToJson(input) {
  if (input.length > YAML_MAX) return result("", "Too large to convert here (2 MiB max)")
  var p
  try { p = yamlParse(input) } catch (e) {
    if (e && e.yaml) return result("", e.msg)
    throw e
  }
  var value = p.docs.length === 1 ? p.docs[0] : p.docs
  var info = (p.docs.length > 1 ? p.docs.length + " documents → array · " : "") + "JSON · " + jsonStats(value)
  var r = result(JSON.stringify(value, null, 2), "", p.warnings.length ? p.warnings.join(" · ") + " · " + info : info)
  if (p.warnings.length) r.urgent = true
  return r
}

// Types from a sample. Arrays merge their elements, so a field missing from
// some objects becomes optional and one that is sometimes null becomes
// nullable. Identical shapes share one declaration. Every emitter below
// reads the same inferred shape.
function tsShape() { return { prims: {}, obj: null, arr: null, emptyArr: false, nonInt: false } }

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
  } else {
    shape.prims[typeof v] = true
    if (typeof v === "number" && Math.floor(v) !== v) shape.nonInt = true
  }
}

function tsWords(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/).filter(function (w) { return w })
}

function tsName(key) {
  var name = tsWords(key).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1) }).join("")
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

// Walks a shape and names every object type once. `render(o, name)` returns
// a declaration body; identical bodies share the first name.
function typeNamer() {
  var bySignature = {}, used = {}, decls = []
  return {
    decls: decls,
    name: function (hint, body, make) {
      if (Object.prototype.hasOwnProperty.call(bySignature, body)) return bySignature[body]
      var name = hint, n = 2
      while (used[name]) name = hint + n++
      used[name] = true
      bySignature[body] = name
      decls.push(make(name))
      return name
    }
  }
}

// Nested types are declared depth-first, so the root comes last; it reads
// best on top. `root` is the name the root type ended up with.
function rootFirst(decls, root) {
  var head = decls.filter(function (d) { return d.root || d.name === root })
  var rest = decls.filter(function (d) { return !(d.root || d.name === root) })
  return head.concat(rest).map(function (d) { return d.text })
}

function toTypeScript(value, rootName) {
  rootName = rootName || "Root"
  var shape = tsShape()
  tsAdd(shape, value)
  var namer = typeNamer()

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
    return namer.name(hint, body, function (name) {
      return { name: name, text: "export interface " + name + " {\n" + body + (body ? "\n" : "") + "}" }
    })
  }

  var root = typeOf(shape, rootName)
  var decls = namer.decls
  if (!shape.obj || root !== rootName) decls.push({ root: true, text: "export type " + rootName + " = " + (root === "never" ? "unknown" : root) })
  return rootFirst(decls, root).join("\n\n")
}

function toZod(value, rootName) {
  rootName = rootName || "Root"
  var shape = tsShape()
  tsAdd(shape, value)
  var namer = typeNamer()
  function schemaOf(s, hint) {
    var parts = []
    if (s.obj) parts.push(obj(s.obj, hint))
    if (s.arr) parts.push("z.array(" + (schemaOf(s.arr, tsSingular(hint)) || "z.unknown()") + ")")
    if (s.prims.string) parts.push("z.string()")
    if (s.prims.number) parts.push(s.nonInt ? "z.number()" : "z.number().int()")
    if (s.prims.boolean) parts.push("z.boolean()")
    var out = parts.length > 1 ? "z.union([" + parts.join(", ") + "])" : (parts[0] || "")
    if (s.prims["null"]) out = out ? out + ".nullable()" : "z.null()"
    return out
  }
  function obj(o, hint) {
    var body = o.order.map(function (k) {
      var f = o.fields[k]
      var key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)
      return "  " + key + ": " + (schemaOf(f.shape, tsName(k)) || "z.unknown()") + (f.count < o.total ? ".optional()" : "") + ","
    }).join("\n")
    return namer.name(hint, body, function (name) {
      return { name: name, text: "export const " + name + " = z.object({\n" + body + (body ? "\n" : "") + "})\n"
        + "export type " + name + " = z.infer<typeof " + name + ">" }
    }) 
  }
  var root = schemaOf(shape, rootName) || "z.unknown()"
  var decls = namer.decls
  // Zod needs a schema declared before it is used, so nested schemas come first.
  if (!shape.obj || root !== rootName) decls.push({ root: true, text: "export const " + rootName + " = " + root + "\nexport type " + rootName + " = z.infer<typeof " + rootName + ">" })
  var ordered = decls.filter(function (d) { return !(d.root || d.name === root) }).concat(decls.filter(function (d) { return d.root || d.name === root }))
  return "import { z } from \"zod\"\n\n" + ordered.map(function (d) { return d.text }).join("\n\n")
}

// Go: exported names with the usual initialisms (ID, URL, APIURL), json tags,
// pointers for nullable values and omitempty for optional ones.
var GO_INITIALISMS = ("ACL API ASCII CPU CSS DNS EOF GUID HTML HTTP HTTPS ID IP JSON LHS QPS RAM RHS RPC SKU SLA SMTP "
  + "SQL SSH TCP TLS TTL UDP UI UID UUID URI URL UTF8 VM XML XMPP XSRF XSS").split(" ")

function goName(key) {
  var name = tsWords(key).map(function (w) {
    var up = w.toUpperCase()
    return GO_INITIALISMS.indexOf(up) !== -1 ? up : w.charAt(0).toUpperCase() + w.slice(1)
  }).join("")
  if (!name) name = "Field"
  if (/^[0-9]/.test(name)) name = "N" + name
  return name
}

function goAlign(rows) {
  // gofmt aligns the name and type columns of consecutive fields.
  var w0 = 0, w1 = 0
  rows.forEach(function (r) { w0 = Math.max(w0, r[0].length); w1 = Math.max(w1, r[1].length) })
  return rows.map(function (r) {
    return "\t" + r[0] + new Array(w0 - r[0].length + 2).join(" ") + r[1] + new Array(w1 - r[1].length + 2).join(" ") + r[2]
  }).join("\n")
}

function toGo(value, rootName) {
  rootName = goName(rootName || "Root")
  var shape = tsShape()
  tsAdd(shape, value)
  var namer = typeNamer()
  function typeOf(s, hint) {
    var kinds = (s.obj ? 1 : 0) + (s.arr ? 1 : 0) + ["string", "number", "boolean"].filter(function (p) { return s.prims[p] }).length
    var t
    if (kinds !== 1) t = "any"
    else if (s.obj) t = struct(s.obj, hint)
    else if (s.arr) { var el = typeOf(s.arr, tsSingular(hint)); t = "[]" + (el === "*any" ? "any" : el) }
    else if (s.prims.string) t = "string"
    else if (s.prims.number) t = s.nonInt ? "float64" : "int64"
    else t = "bool"
    if (s.prims["null"] && t !== "any" && t.charAt(0) !== "[") t = "*" + t
    return t
  }
  function struct(o, hint) {
    var seen = {}
    var rows = o.order.map(function (k) {
      var f = o.fields[k], name = goName(k), n = 2
      while (seen[name]) name = goName(k) + n++
      seen[name] = true
      var t = typeOf(f.shape, goName(k))
      return [name, t, "`json:\"" + k.replace(/[`"\\]/g, "") + (f.count < o.total ? ",omitempty" : "") + "\"`"]
    })
    var body = goAlign(rows)
    return namer.name(hint, body, function (name) {
      return { name: name, text: "type " + name + " struct {\n" + body + (body ? "\n" : "") + "}" }
    })
  }
  var root = typeOf(shape, rootName)
  var decls = namer.decls
  if (!shape.obj || root.replace(/^\*/, "") !== rootName) decls.push({ root: true, text: "type " + rootName + " " + root.replace(/^\*/, "") })
  return rootFirst(decls, root).join("\n\n")
}

// Rust: serde structs. snake_case fields renamed back to the JSON key,
// keywords escaped as r#type, Option<T> for nullable or optional values.
var RUST_KEYWORDS = ("as async await break const continue dyn else enum extern false fn for if impl in let loop match mod move "
  + "mut pub ref return static struct trait true type unsafe use where while abstract become box do final macro override "
  + "priv typeof unsized virtual yield try gen").split(" ")
var RUST_RESERVED = ["self", "Self", "super", "crate"]   // cannot be raw identifiers

function rustField(key) {
  var name = tsWords(key).map(function (w) { return w.toLowerCase() }).join("_")
  if (!name) name = "field"
  if (/^[0-9]/.test(name)) name = "field_" + name
  if (RUST_RESERVED.indexOf(name) !== -1) name = name + "_"
  return name
}

function toRust(value, rootName) {
  rootName = tsName(rootName || "Root")
  var shape = tsShape()
  tsAdd(shape, value)
  var namer = typeNamer()
  function typeOf(s, hint) {
    var kinds = (s.obj ? 1 : 0) + (s.arr ? 1 : 0) + ["string", "number", "boolean"].filter(function (p) { return s.prims[p] }).length
    var t
    if (kinds !== 1) t = "serde_json::Value"
    else if (s.obj) t = struct(s.obj, hint)
    else if (s.arr) t = "Vec<" + typeOf(s.arr, tsSingular(hint)).replace(/^Option<(.*)>$/, "Option<$1>") + ">"
    else if (s.prims.string) t = "String"
    else if (s.prims.number) t = s.nonInt ? "f64" : "i64"
    else t = "bool"
    if (s.prims["null"] && t !== "serde_json::Value") t = "Option<" + t + ">"
    return t
  }
  function struct(o, hint) {
    var seen = {}
    var body = o.order.map(function (k) {
      var f = o.fields[k], field = rustField(k), n = 2
      while (seen[field]) field = rustField(k) + "_" + n++
      seen[field] = true
      var t = typeOf(f.shape, tsName(k))
      var optional = f.count < o.total
      if (optional && !/^Option</.test(t) && t !== "serde_json::Value") t = "Option<" + t + ">"
      var attrs = []
      if (field !== k) attrs.push("rename = " + JSON.stringify(k))
      if (optional) attrs.push("default")
      var ident = RUST_KEYWORDS.indexOf(field) !== -1 ? "r#" + field : field
      return (attrs.length ? "    #[serde(" + attrs.join(", ") + ")]\n" : "") + "    pub " + ident + ": " + t + ","
    }).join("\n")
    return namer.name(hint, body, function (name) {
      return { name: name,
               text: "#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct " + name + " {\n" + body + (body ? "\n" : "") + "}" }
    })
  }
  var root = typeOf(shape, rootName)
  var decls = namer.decls
  if (!shape.obj || root !== rootName) decls.push({ root: true, text: "pub type " + rootName + " = " + root + ";" })
  return "use serde::{Deserialize, Serialize};\n\n" + rootFirst(decls, root).join("\n\n")
}

function toJsonSchema(value, rootName) {
  var shape = tsShape()
  tsAdd(shape, value)
  function schemaOf(s) {
    var alts = []
    if (s.obj) {
      var props = {}, required = []
      s.obj.order.forEach(function (k) {
        var f = s.obj.fields[k]
        props[k] = schemaOf(f.shape)
        if (f.count === s.obj.total) required.push(k)
      })
      var o = { type: "object", properties: props }
      if (required.length) o.required = required
      alts.push(o)
    }
    if (s.arr) {
      var items = schemaOf(s.arr)
      alts.push(Object.keys(items).length ? { type: "array", items: items } : { type: "array" })
    }
    if (s.prims.string) alts.push({ type: "string" })
    if (s.prims.number) alts.push({ type: s.nonInt ? "number" : "integer" })
    if (s.prims.boolean) alts.push({ type: "boolean" })
    if (s.prims["null"]) alts.push({ type: "null" })
    if (!alts.length) return {}
    if (alts.length === 1) return alts[0]
    // Plain types merge into one "type" list; structured ones need anyOf.
    if (alts.every(function (a) { return Object.keys(a).length === 1 })) return { type: alts.map(function (a) { return a.type }) }
    return { anyOf: alts }
  }
  var root = schemaOf(shape)
  var out = { "$schema": "https://json-schema.org/draft/2020-12/schema", title: rootName || "Root" }
  for (var k in root) out[k] = root[k]
  return JSON.stringify(out, null, 2)
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

// ---------------------------------------------------------------- XML / HTML

// One tokenizer for both. Tokens: open (name, attrs text, self-closing),
// close, text, comment, cdata, decl (<?…?>, <!DOCTYPE …>) and raw (the
// verbatim body of <script>, <style>, <pre> and <textarea> in HTML).
var MARKUP_MAX = 2097152
var HTML_VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 }
var HTML_RAW = { script: 1, style: 1, pre: 1, textarea: 1 }
var HTML_INLINE = { a: 1, abbr: 1, b: 1, bdi: 1, bdo: 1, br: 1, button: 1, cite: 1, code: 1, data: 1, del: 1, dfn: 1, em: 1, i: 1, img: 1,
  input: 1, ins: 1, kbd: 1, label: 1, mark: 1, q: 1, s: 1, samp: 1, select: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1,
  time: 1, u: 1, "var": 1, wbr: 1 }
// Opening one of these closes an open element of the listed kinds (HTML's optional end tags).
var HTML_AUTOCLOSE = { li: ["li"], dt: ["dt", "dd"], dd: ["dt", "dd"], tr: ["tr", "td", "th"], td: ["td", "th"], th: ["td", "th"],
  option: ["option"], thead: ["tbody", "tfoot"], tbody: ["thead", "tbody", "tfoot"], tfoot: ["thead", "tbody"] }
var HTML_CLOSES_P = { address: 1, article: 1, aside: 1, blockquote: 1, div: 1, dl: 1, fieldset: 1, footer: 1, form: 1, h1: 1, h2: 1,
  h3: 1, h4: 1, h5: 1, h6: 1, header: 1, hr: 1, main: 1, nav: 1, ol: 1, p: 1, pre: 1, section: 1, table: 1, ul: 1 }

function markupTokens(text, html) {
  var toks = [], i = 0, n = text.length
  function fail(msg, at) { throw { markup: true, msg: msg + " at " + lineCol(text, at) } }
  while (i < n) {
    var lt = text.indexOf("<", i)
    if (lt === -1) { toks.push({ t: "text", s: text.slice(i), at: i }); break }
    if (lt > i) toks.push({ t: "text", s: text.slice(i, lt), at: i })
    i = lt
    var end
    if (text.substr(i, 4) === "<!--") {
      end = text.indexOf("-->", i + 4)
      if (end === -1) { if (!html) fail("Unclosed comment", i); end = n - 3 }
      toks.push({ t: "comment", s: text.slice(i, end + 3), at: i })
      i = end + 3
    } else if (text.substr(i, 9) === "<![CDATA[") {
      end = text.indexOf("]]>", i)
      if (end === -1) fail("Unclosed CDATA section", i)
      toks.push({ t: "cdata", s: text.slice(i, end + 3), at: i })
      i = end + 3
    } else if (text.substr(i, 2) === "<?") {
      end = text.indexOf("?>", i)
      if (end === -1) fail("Unclosed processing instruction", i)
      toks.push({ t: "decl", s: text.slice(i, end + 2), at: i })
      i = end + 2
    } else if (text.substr(i, 2) === "<!") {
      var d = 0
      for (end = i + 2; end < n; end++) {
        var c = text.charAt(end)
        if (c === "[") d++
        else if (c === "]") d--
        else if (c === ">" && d <= 0) break
      }
      if (end >= n) fail("Unclosed declaration", i)
      toks.push({ t: "decl", s: text.slice(i, end + 1).replace(/\s+/g, " "), at: i })
      i = end + 1
    } else if (/^<\/[A-Za-z_:]/.test(text.substr(i, 3))) {
      end = text.indexOf(">", i)
      if (end === -1) fail("Unclosed tag", i)
      var cname = text.slice(i + 2, end).trim()
      if (!/^[A-Za-z_:][\w:.-]*$/.test(cname)) fail("Bad closing tag", i)
      toks.push({ t: "close", name: html ? cname.toLowerCase() : cname, at: i })
      i = end + 1
    } else if (/^<[A-Za-z_:]/.test(text.substr(i, 2))) {
      // Scan to the '>' that ends the tag, skipping quoted attribute values.
      var q = ""
      for (end = i + 1; end < n; end++) {
        var ch = text.charAt(end)
        if (q) { if (ch === q) q = ""; continue }
        if (ch === "\"" || ch === "'") q = ch
        else if (ch === ">") break
        else if (ch === "<" && !html) fail("Unexpected '<' inside a tag", end)
      }
      if (end >= n) fail("Unclosed tag", i)
      var inner = text.slice(i + 1, end), self = /\/\s*$/.test(inner)
      if (self) inner = inner.replace(/\/\s*$/, "")
      var nm = /^[A-Za-z_:][\w:.-]*/.exec(inner)[0]
      var attrs = inner.slice(nm.length)
      var name = html ? nm.toLowerCase() : nm
      toks.push({ t: "open", name: name, attrs: attrs, self: self, at: i })
      i = end + 1
      if (html && HTML_RAW[name] && !self) {
        var re = new RegExp("</" + name + "\\s*>", "i")
        var m = re.exec(text.slice(i))
        var stop = m ? i + m.index : n
        toks.push({ t: "raw", s: text.slice(i, stop), at: i })
        if (m) { toks.push({ t: "close", name: name, at: stop }); i = stop + m[0].length }
        else i = n
      }
    } else {
      if (!html) fail("Unescaped '<' (write &lt;)", i)
      // A stray '<' is text, and so is everything up to the next real tag.
      var j = i + 1
      for (;;) {
        var nx = text.indexOf("<", j)
        if (nx === -1) { j = n; break }
        var c1 = text.charCodeAt(nx + 1)
        if ((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122) || c1 === 47 || c1 === 33 || c1 === 63 || c1 === 95 || c1 === 58) { j = nx; break }
        j = nx + 1
      }
      toks.push({ t: "text", s: text.slice(i, j), at: i })
      i = j
    }
  }
  return toks
}

// Attributes, normalised: single spaces, values quoted.
function markupAttrs(attrs) {
  var out = [], re = /([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g, m
  while ((m = re.exec(attrs)) !== null) {
    var v = m[2]
    if (v !== undefined && !/^["']/.test(v)) v = "\"" + v + "\""
    out.push({ name: m[1], value: v, raw: v === undefined ? m[1] : m[1] + "=" + v })
  }
  return out
}

function attrValue(a) {
  if (a.value === undefined) return ""
  return htmlDecode(a.value.replace(/^["']|["']$/g, "")).text
}

// Tokens to a tree. XML is strict about nesting; HTML forgives the way
// browsers do (optional end tags, stray closers).
function markupTree(toks, html) {
  var root = { t: "root", children: [] }, stack = [root], warnings = []
  function top() { return stack[stack.length - 1] }
  toks.forEach(function (tk) {
    if (tk.t === "open") {
      if (html) {
        var closes = HTML_AUTOCLOSE[tk.name]
        if (closes && closes.indexOf(top().name) !== -1) stack.pop()
        if (HTML_CLOSES_P[tk.name] && top().name === "p") stack.pop()
      }
      var el = { t: "el", name: tk.name, attrs: markupAttrs(tk.attrs), children: [], at: tk.at }
      top().children.push(el)
      if (stack.length > 1000) throw { markup: true, msg: "Nested more than 1000 elements deep" }
      if (!tk.self && !(html && HTML_VOID[tk.name])) stack.push(el)
      else el.self = true
    } else if (tk.t === "close") {
      if (html && HTML_VOID[tk.name]) return
      var k = stack.length - 1
      while (k > 0 && stack[k].name !== tk.name) k--
      if (k === 0) {
        if (!html) throw { markup: true, msg: "Closing </" + tk.name + "> was never opened", at: tk.at }
        warnings.push("Stray </" + tk.name + "> ignored")
        return
      }
      if (k !== stack.length - 1 && !html)
        throw { markup: true, msg: "Expected </" + top().name + "> but found </" + tk.name + ">", at: tk.at }
      stack.length = k
    } else top().children.push(tk)
  })
  if (stack.length > 1 && !html) throw { markup: true, msg: "<" + top().name + "> is never closed", at: top().at }
  return { root: root, warnings: warnings }
}

function openTag(el, xmlSelf) {
  var a = el.attrs.map(function (x) { return x.raw }).join(" ")
  return "<" + el.name + (a ? " " + a : "") + (el.self && xmlSelf ? " />" : ">")
}

// Pretty printer: an element goes on one line when it is short and holds
// only text and inline elements; otherwise its children are indented.
function markupFormat(root, html, indentUnit) {
  var WIDTH = 100, out = []
  function collapse(s) { return s.replace(/\s+/g, " ") }
  function isBlockish(c) {
    return c.t === "comment" || c.t === "decl" || c.t === "cdata" || c.t === "raw" ||
      (c.t === "el" && (html ? !HTML_INLINE[c.name] : false))
  }
  // Inline rendering, or null when it holds block content or is longer than
  // a line. Cached per node, independent of where the node ends up, so each
  // subtree is measured once.
  function inline(node) {
    if (node.t === "text") return collapse(node.s)
    if (node.t !== "el") return null
    if (node._inline !== undefined) return node._inline
    var open = openTag(node, !html), s = open
    if (!node.self) {
      for (var i = 0; i < node.children.length && s !== null; i++) {
        var c = node.children[i]
        var part = isBlockish(c) ? null : inline(c)
        s = part === null || s.length + part.length > WIDTH ? null : s + part
      }
      if (s !== null) {
        // Leading and trailing whitespace inside a one-line element goes.
        var inner = s.slice(open.length).replace(/^\s+|\s+$/g, "")
        s = open + inner + "</" + node.name + ">"
      }
    }
    if (s !== null && s.length > WIDTH) s = null
    node._inline = s
    return s
  }
  function emit(node, depth) {
    var pad = new Array(depth + 1).join(indentUnit)
    if (node.t === "text") {
      var t = collapse(node.s).trim()
      if (t) out.push(pad + t)
      return
    }
    if (node.t === "comment" || node.t === "decl" || node.t === "cdata") { out.push(pad + node.s.trim()); return }
    if (node.t === "raw") {
      // <pre>/<textarea> keep their text exactly; <script>/<style> are re-indented.
      var body = node.s.replace(/^\n+|\s+$/g, "")
      if (!body) return
      if (node.verbatim) { out.push(node.s); return }
      var ls = body.split("\n"), min = Infinity
      ls.forEach(function (l) { if (l.trim()) min = Math.min(min, /^\s*/.exec(l)[0].length) })
      ls.forEach(function (l) { out.push(l.trim() ? pad + l.slice(min === Infinity ? 0 : min) : "") })
      return
    }
    var one = inline(node)
    if (one !== null && pad.length + one.length <= WIDTH) { out.push(pad + one); return }
    if (node.self) { out.push(pad + openTag(node, !html)); return }
    if (html && (node.name === "pre" || node.name === "textarea")) {
      var raw = node.children.map(function (c) { return c.s || "" }).join("")
      out.push(pad + openTag(node, false) + raw + "</" + node.name + ">")
      return
    }
    out.push(pad + openTag(node, !html))
    node.children.forEach(function (c) { emit(c, depth + 1) })
    out.push(pad + "</" + node.name + ">")
  }
  root.children.forEach(function (c) { emit(c, 0) })
  return out.join("\n")
}

function markupMinify(root, html) {
  function walk(nodes, parentInline) {
    var s = ""
    nodes.forEach(function (c, k) {
      if (c.t === "text") {
        var t = c.s.replace(/\s+/g, " ")
        // Whitespace between inline content is meaningful in HTML; elsewhere it goes.
        if (t === " ") {
          var prev = nodes[k - 1], next = nodes[k + 1]
          var inl = function (x) { return x && (x.t === "text" || (x.t === "el" && HTML_INLINE[x.name])) }
          if (!(html && inl(prev) && inl(next))) return
        }
        s += html ? t : t.trim()
      } else if (c.t === "comment") { /* dropped */ }
      else if (c.t === "raw") s += c.s
      else if (c.t === "el") {
        s += openTag(c, !html).replace(" />", "/>")
        if (!c.self) s += walk(c.children) + "</" + c.name + ">"
      } else s += c.s
    })
    return s
  }
  return walk(root.children).trim()
}

function countElements(root) {
  var n = 0, depth = 0, stack = [[root, 0]]
  while (stack.length) {
    var top = stack.pop(), node = top[0]
    if (node.t === "el") { n++; depth = Math.max(depth, top[1]) }
    if (node.children) node.children.forEach(function (c) { stack.push([c, top[1] + 1]) })
  }
  return { elements: n, depth: depth }
}

function markupTool(input, mode, html) {
  if (input.trim() === "") return result()
  if (input.length > MARKUP_MAX) return result("", "Too large to format here (2 MiB max)")
  var tree
  try {
    var toks = markupTokens(input, html)
    if (html) toks.forEach(function (tk, k) {
      if (tk.t === "raw" && k > 0 && (toks[k - 1].name === "pre" || toks[k - 1].name === "textarea")) tk.verbatim = true
    })
    tree = markupTree(toks, html)
  } catch (e) {
    if (e && e.markup) return result("", e.at !== undefined ? e.msg + " at " + lineCol(input, e.at) : e.msg)
    throw e
  }
  if (!html) {
    var roots = tree.root.children.filter(function (c) { return c.t === "el" })
    var strayText = tree.root.children.some(function (c) { return c.t === "text" && c.s.trim() })
    if (roots.length !== 1 || strayText) tree.warnings.push(roots.length === 0 ? "No root element" : "More than one root element (not well-formed XML)")
  }
  var out = mode === "minify" ? markupMinify(tree.root, html) : markupFormat(tree.root, html, "  ")
  var c = countElements(tree.root)
  var r = result(out, "", (tree.warnings.length ? tree.warnings.slice(0, 3).join(" · ") + " · " : (html ? "" : "Well-formed · "))
    + c.elements + " elements · depth " + c.depth + (mode === "minify" ? " · " + input.length + " → " + out.length + " chars" : ""))
  if (tree.warnings.length) r.urgent = true
  return r
}

// ---- HTML preview: a sanitised subset of the document for Qt's rich text.
// Only these tags survive; everything else is unwrapped (its text kept) or,
// for active and embedded content, dropped with its contents. No attribute
// survives except href (http, https, mailto), align, colspan and rowspan, so
// there are no event handlers, styles, images or remote fetches.
var HTML_KEEP = ("a b strong i em u s del ins small sub sup code kbd samp pre p br hr h1 h2 h3 h4 h5 h6 ul ol li dl dt dd "
  + "blockquote table thead tbody tfoot tr td th caption div span q cite abbr mark").split(" ")
var HTML_DROP = ("script style iframe object embed svg math template noscript head title link meta base frame frameset "
  + "audio video canvas form input button select textarea applet portal").split(" ")

function htmlSanitize(input, theme) {
  var toks = markupTokens(input, true)
  var tree = markupTree(toks, true)
  var removed = { tags: 0, attrs: 0, images: 0 }
  var st = theme ? {
    code: " style=\"font-family: monospace; background-color: " + theme.code + ";\"",
    heading: " style=\"color: " + theme.accent + ";\"", link: " style=\"color: " + theme.accent + ";\"",
    dim: " style=\"color: " + theme.dim + ";\"",
    table: " border=\"1\" cellspacing=\"0\" cellpadding=\"6\" style=\"border-color: " + theme.border + "; border-style: solid;\""
  } : { code: "", heading: "", link: "", dim: "", table: "" }
  function esc(s) { return mdEscape(htmlDecode(s).text) }
  function walk(nodes, depth) {
    var s = ""
    nodes.forEach(function (c) {
      if (c.t === "text") { s += esc(c.s); return }
      if (c.t === "raw") { if (c.verbatim) s += esc(c.s); else removed.tags++; return }
      if (c.t !== "el") { if (c.t === "comment" || c.t === "decl") return; s += esc(c.s); return }
      if (HTML_DROP.indexOf(c.name) !== -1) { removed.tags++; return }
      if (c.name === "img") {
        removed.images++
        var alt = ""
        c.attrs.forEach(function (a) { if (a.name.toLowerCase() === "alt") alt = attrValue(a) })
        s += "<span" + st.dim + ">[image: " + mdEscape(alt || "untitled") + "]</span>"
        return
      }
      var inner = depth > 200 ? "" : walk(c.children || [], depth + 1)
      if (HTML_KEEP.indexOf(c.name) === -1) { removed.tags++; s += inner; return }
      var keep = []
      c.attrs.forEach(function (a) {
        var an = a.name.toLowerCase(), av = attrValue(a)
        if (an === "href" && c.name === "a" && /^(https?:|mailto:)/i.test(av.trim())) keep.push("href=\"" + mdEscape(av.trim()) + "\"")
        else if ((an === "align" && /^(left|right|center|justify)$/i.test(av)) || ((an === "colspan" || an === "rowspan") && /^\d{1,3}$/.test(av)))
          keep.push(an + "=\"" + av + "\"")
        else removed.attrs++
      })
      var style = /^h[1-6]$/.test(c.name) ? st.heading : c.name === "a" ? st.link : (c.name === "code" || c.name === "pre") ? st.code
        : c.name === "table" ? st.table : ""
      var open = "<" + c.name + (keep.length ? " " + keep.join(" ") : "") + style + ">"
      s += c.self || HTML_VOID[c.name] ? open : open + inner + "</" + c.name + ">"
    })
    return s
  }
  var html = walk(tree.root.children, 0)
  return { html: html, removed: removed, warnings: tree.warnings }
}

function htmlPreviewTool(input, mode, theme) {
  if (input.trim() === "") return result("", "", "Paste HTML, or load the sample")
  if (input.length > MARKDOWN_MAX) return result("", "Too long to preview (128 KiB max)")
  var plain, themed
  try { plain = htmlSanitize(input, null); themed = mode === "sanitized" ? null : htmlSanitize(input, theme) } catch (e) {
    if (e && e.markup) return result("", e.msg)
    throw e
  }
  var rm = plain.removed, bits = []
  if (rm.tags) bits.push(rm.tags + " unsafe or unsupported tag" + (rm.tags === 1 ? "" : "s"))
  if (rm.attrs) bits.push(rm.attrs + " attribute" + (rm.attrs === 1 ? "" : "s"))
  if (rm.images) bits.push(rm.images + " image" + (rm.images === 1 ? "" : "s") + " (shown as text)")
  var r = result(plain.html, "", bits.length ? "Removed " + bits.join(", ") : "Nothing needed removing")
  if (mode !== "sanitized") r.html = themed.html || "<p></p>"
  return r
}

// ---------------------------------------------------------------- CSS

var CSS_MAX = 2097152

// Statements in order: { t: "open", sel } { t: "decl", prop, value } { t: "close" }
// { t: "stmt", text } (an at-rule ending in ';') and { t: "comment", text }.
function cssParse(text) {
  var items = [], buf = "", i = 0, n = text.length, depth = 0, colon = -1, paren = 0
  function push(ch) {
    if (/\s/.test(ch)) { if (buf !== "" && !/ $/.test(buf)) buf += " "; return }
    buf += ch
  }
  function flushDecl() {
    var t = buf.trim()
    buf = ""
    if (!t) { colon = -1; return }
    if (depth > 0 && t.charAt(0) !== "@") {
      var c = t.indexOf(":")
      if (c > 0) items.push({ t: "decl", prop: t.slice(0, c).trim(), value: t.slice(c + 1).trim() })
      else items.push({ t: "stmt", text: t })
    } else items.push({ t: "stmt", text: t })
    colon = -1
  }
  while (i < n) {
    var ch = text.charAt(i)
    if (ch === "/" && text.charAt(i + 1) === "*") {
      var e = text.indexOf("*/", i + 2)
      if (e === -1) throw { css: true, msg: "Unclosed comment at " + lineCol(text, i) }
      if (buf.trim() === "") items.push({ t: "comment", text: text.slice(i, e + 2) })
      i = e + 2
      continue
    }
    if (ch === "\"" || ch === "'") {
      var j = i + 1
      while (j < n && text.charAt(j) !== ch) { if (text.charAt(j) === "\\") j++; if (text.charAt(j) === "\n") break; j++ }
      buf += text.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === "(") paren++
    if (ch === ")") paren = Math.max(0, paren - 1)
    if (paren === 0 && ch === "{") {
      items.push({ t: "open", sel: buf.trim() })
      buf = ""; depth++; i++
      continue
    }
    if (paren === 0 && ch === "}") {
      if (depth === 0) throw { css: true, msg: "Unexpected '}' at " + lineCol(text, i) }
      flushDecl()
      items.push({ t: "close" })
      depth--; i++
      continue
    }
    if (paren === 0 && ch === ";") { flushDecl(); i++; continue }
    push(ch)
    i++
  }
  if (buf.trim()) flushDecl()
  if (depth > 0) throw { css: true, msg: depth + " block" + (depth === 1 ? " is" : "s are") + " never closed (missing })" }
  return items
}

function cssSelector(sel, pad) {
  // One selector per line, split at top-level commas.
  var parts = [], cur = "", d = 0
  for (var i = 0; i < sel.length; i++) {
    var c = sel.charAt(i)
    if (c === "(" || c === "[") d++
    else if (c === ")" || c === "]") d--
    if (c === "," && d === 0) { parts.push(cur.trim()); cur = ""; continue }
    cur += c
  }
  parts.push(cur.trim())
  if (/^@/.test(sel)) return sel
  return parts.join(",\n" + pad)
}

function cssTool(input, mode) {
  if (input.trim() === "") return result()
  if (input.length > CSS_MAX) return result("", "Too large to format here (2 MiB max)")
  var items
  try { items = cssParse(input) } catch (e) { if (e && e.css) return result("", e.msg); throw e }
  var out = "", rules = 0, decls = 0
  if (mode === "minify") {
    // Parts, not one growing string: dropping each block's last ';' must not
    // copy everything written so far.
    var parts = []
    items.forEach(function (it) {
      if (it.t === "comment") { if (/^\/\*!/.test(it.text)) parts.push(it.text); return }
      if (it.t === "open") { rules++; parts.push(it.sel.replace(/\s*,\s*/g, ",").replace(/\s*([>+~])\s*/g, "$1") + "{"); return }
      if (it.t === "close") {
        var last = parts.length - 1
        if (last >= 0 && /;$/.test(parts[last])) parts[last] = parts[last].slice(0, -1)
        parts.push("}")
        return
      }
      if (it.t === "decl") { decls++; parts.push(it.prop + ":" + it.value.replace(/\s*!\s*important/i, "!important").replace(/,\s+/g, ",") + ";"); return }
      parts.push(it.text + ";")
    })
    out = parts.join("").replace(/;$/, "")
  } else {
    var depth = 0, lines = []
    items.forEach(function (it, k) {
      var pad = new Array(depth + 1).join("  ")
      if (it.t === "comment") { lines.push(pad + it.text); return }
      if (it.t === "open") {
        rules++
        if (lines.length && lines[lines.length - 1] !== "" && !/\{$/.test(lines[lines.length - 1])) lines.push("")
        lines.push(pad + cssSelector(it.sel, pad) + " {"); depth++
        return
      }
      if (it.t === "close") {
        depth = Math.max(0, depth - 1)
        lines.push(new Array(depth + 1).join("  ") + "}")
        if (depth === 0) lines.push("")
        return
      }
      if (it.t === "decl") { decls++; lines.push(pad + it.prop + ": " + it.value.replace(/\s*!\s*important/i, " !important") + ";"); return }
      lines.push(pad + it.text + ";")
    })
    out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  }
  return result(out, "", rules + " rules · " + decls + " declarations" + (mode === "minify" ? " · " + input.length + " → " + out.length + " chars" : ""))
}

// ---------------------------------------------------------------- SQL

var SQL_MAX = 1048576
var SQL_INDENT_MAX = 24
// Clauses that start a line of their own, longest first so "LEFT OUTER JOIN"
// wins over "LEFT". Their content is indented one level below them.
var SQL_CLAUSES = ["SELECT DISTINCT", "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "UNION ALL", "UNION", "INTERSECT", "EXCEPT", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "RETURNING",
  "WITH RECURSIVE", "WITH", "WINDOW", "ON CONFLICT", "ON DUPLICATE KEY UPDATE", "FETCH FIRST", "PARTITION BY"]
var SQL_JOINS = ["LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN",
  "INNER JOIN", "CROSS JOIN", "NATURAL JOIN", "JOIN"]
var SQL_KEYWORDS = ("ADD ALL ALTER AND ANY AS ASC BEGIN BETWEEN BY CASE CAST CHECK COLLATE COLUMN COMMIT CONSTRAINT CREATE CROSS "
  + "CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DO DROP ELSE END ESCAPE EXCEPT EXISTS "
  + "EXPLAIN FALSE FETCH FILTER FIRST FOR FOREIGN FROM FULL GRANT GROUP HAVING IF ILIKE IN INDEX INNER INSERT INTERSECT INTERVAL "
  + "INTO IS JOIN KEY LATERAL LEFT LIKE LIMIT NATURAL NEXT NOT NOTHING NULL NULLS OFFSET ON ONLY OR ORDER OUTER OVER PARTITION "
  + "PRIMARY RECURSIVE REFERENCES RETURNING RIGHT ROLLBACK ROW ROWS SELECT SET SIMILAR TABLE THEN TO TOP TRANSACTION TRUE "
  + "TRUNCATE UNION UNIQUE UPDATE USING VALUES VIEW WHEN WHERE WINDOW WITH CONFLICT DUPLICATE REPLACE IGNORE").split(" ")

function sqlTokens(text) {
  var toks = [], i = 0, n = text.length, m
  var re = /\s+|--[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*(?:'|$)|"(?:[^"]|"")*(?:"|$)|`[^`]*(?:`|$)|\[[^\]]*\]|::|\$\d+|[:@?]\w*|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|[A-Za-z_][\w$]*|<=|>=|<>|!=|\|\||->>|->|[(),;.]|[^\s\w]/g
  while ((m = re.exec(text)) !== null) {
    var s = m[0], t
    if (/^\s/.test(s)) continue
    if (/^(--|#)/.test(s) && !/^#\w/.test(s)) t = "comment"
    else if (/^\/\*/.test(s)) t = "comment"
    else if (/^['"`\[]/.test(s)) t = "string"
    else if (/^[A-Za-z_]/.test(s)) t = SQL_KEYWORDS.indexOf(s.toUpperCase()) !== -1 ? "kw" : "word"
    else if (/^\d/.test(s)) t = "num"
    else t = "op"
    toks.push({ t: t, s: s, u: s.toUpperCase() })
  }
  return toks
}

// Clause and join phrases by their first word, longest first.
var SQL_PHRASES = null
function sqlPhrases() {
  if (SQL_PHRASES) return SQL_PHRASES
  SQL_PHRASES = {}
  SQL_CLAUSES.concat(SQL_JOINS).forEach(function (p) {
    var first = p.split(" ")[0]
    ;(SQL_PHRASES[first] = SQL_PHRASES[first] || []).push(p)
  })
  for (var k in SQL_PHRASES) SQL_PHRASES[k].sort(function (a, b) { return b.length - a.length })
  return SQL_PHRASES
}

function sqlTool(input, mode, opts) {
  if (input.trim() === "") return result()
  if (input.length > SQL_MAX) return result("", "Too large to format here (1 MiB max)")
  var lower = !!(opts && opts.lower)
  var toks = sqlTokens(input)
  // Merge multi-word clauses ("GROUP" "BY" → "GROUP BY").
  var merged = [], phrases = sqlPhrases()
  for (var i = 0; i < toks.length; i++) {
    var tk = toks[i], hit = null
    var cands = tk.t === "kw" && phrases.hasOwnProperty(tk.u) ? phrases[tk.u] : null
    for (var c = 0; cands && c < cands.length && !hit; c++) {
      var words = cands[c].split(" "), w = 1
      while (w < words.length && toks[i + w] && toks[i + w].u === words[w]) w++
      if (w === words.length) hit = cands[c]
    }
    if (hit) {
      merged.push({ t: SQL_JOINS.indexOf(hit) !== -1 ? "join" : "clause", s: hit, u: hit })
      i += hit.split(" ").length - 1
    } else merged.push(tk)
  }
  function word(tk) {
    if (tk.t === "kw" || tk.t === "clause" || tk.t === "join") return lower ? tk.u.toLowerCase() : tk.u
    return tk.s
  }
  var statements = 0
  if (mode === "minify") {
    var out = "", prev = null
    merged.forEach(function (tk) {
      if (tk.t === "comment") return
      var s = word(tk)
      var tight = !prev || /^[(.]$/.test(prev.s) || /^[),;.]$/.test(s) || s === "::" || prev.s === "::" ||
        (s === "(" && (prev.t === "word" || prev.t === "string"))
      out += (tight ? "" : " ") + s
      prev = tk
      if (s === ";") statements++
    })
    return result(out.trim(), "", (statements || 1) + " statement" + (statements > 1 ? "s" : "") + " · " + input.length + " → " + out.trim().length + " chars")
  }
  // Pretty: a stack of levels, one per open parenthesis. A parenthesis that
  // opens a subquery indents; any other (a function call, an IN list) stays inline.
  // `filled` tracks whether the current line has text yet, so no step
  // rescans a long line (an unbroken run of parentheses would be quadratic).
  var lines = [], line = "", filled = false, base = 0, stack = [], clause = "", between = false, caseDepth = []
  var INDENT = "  "
  // Indentation stops growing past SQL_INDENT_MAX levels: nothing real nests
  // that deep, and a pasted wall of subqueries must not build huge lines.
  function pad(n) { return new Array(Math.max(0, Math.min(SQL_INDENT_MAX, n)) + 1).join(INDENT) }
  function newline(level) { if (filled) lines.push(line); line = pad(level); filled = false }
  function add(s, tight) {
    line += filled && !tight ? " " + s : s
    filled = true
  }
  function inlineParen() { return stack.length && !stack[stack.length - 1].sub }
  var prevTk = null
  for (var k = 0; k < merged.length; k++) {
    var t = merged[k], s = word(t), nextTk = merged[k + 1]
    if (t.t === "comment") {
      if (/^(--|#)/.test(t.s)) { add(t.s); newline(base + 1) } else add(t.s)
      prevTk = t; continue
    }
    if (inlineParen() && t.s !== ")" && t.s !== "(") {
      var tightIn = prevTk && (prevTk.s === "(" || prevTk.s === "." || s === "," || s === "." || s === "::" || prevTk.s === "::")
      add(s, tightIn)
      prevTk = t; continue
    }
    if (t.t === "clause") {
      newline(base)
      add(s)
      clause = t.u
      newline(base + 1)
    } else if (t.t === "join") {
      newline(base + 1)
      add(s)
    } else if (t.u === "AND" || t.u === "OR") {
      if (t.u === "AND" && between) { add(s); between = false }
      else if (caseDepth.length) add(s)
      else { newline(base + 1); add(s) }
    } else if (t.u === "BETWEEN") { add(s); between = true }
    else if (t.u === "CASE") { add(s); caseDepth.push(base + 1) }
    else if ((t.u === "WHEN" || t.u === "ELSE") && caseDepth.length) { newline(caseDepth[caseDepth.length - 1] + 1); add(s) }
    else if (t.u === "END" && caseDepth.length) { newline(caseDepth.pop()); add(s) }
    else if (s === ",") {
      add(",", true)
      if (/^(SELECT|SELECT DISTINCT|GROUP BY|ORDER BY|SET|RETURNING|PARTITION BY|WITH|WITH RECURSIVE)$/.test(clause)) newline(base + 1)
      else if (clause === "VALUES") newline(base + 1)
    } else if (s === "(") {
      var sub = nextTk && (nextTk.t === "clause" && /^(SELECT|SELECT DISTINCT|WITH|WITH RECURSIVE)$/.test(nextTk.u))
      var call = prevTk && (prevTk.t === "word" || (prevTk.t === "kw" && /^(CAST|COUNT|EXISTS|IN|VALUES|OVER|FILTER|COALESCE)$/.test(prevTk.u) === false && prevTk.t === "word"))
      add("(", (call && clause !== "INSERT INTO") || (prevTk && prevTk.s === "("))
      stack.push({ sub: sub, base: base, clause: clause })
      if (sub) base = base + 2
    } else if (s === ")") {
      var top = stack.pop() || { sub: false, base: base, clause: clause }
      if (top.sub) { base = top.base; clause = top.clause; newline(base + 1); add(")") }
      else add(")", true)
    } else if (s === ";") {
      add(";", true)
      statements++
      lines.push(line); lines.push("")
      line = ""; filled = false; base = 0; clause = ""; stack = []; caseDepth = []
    } else {
      var tight = prevTk && (prevTk.s === "." || s === "." || s === "::" || prevTk.s === "::")
      add(s, tight)
    }
    prevTk = t
  }
  if (filled) lines.push(line)
  var outText = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return result(outText, "", Math.max(statements, 1) + " statement" + (statements > 1 ? "s" : "") + (lower ? "" : " · keywords upper-cased"))
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

var ESCAPE_MAX = 262144      // escaping is for snippets; keeps answers quick

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

// ---------------------------------------------------------------- Unicode

var UNICODE_MAX_ROWS = 400
// Start code point and name of each block, in order (the common ones).
var UNICODE_BLOCKS = [
  [0x0000, "Basic Latin"], [0x0080, "Latin-1 Supplement"], [0x0100, "Latin Extended-A"], [0x0180, "Latin Extended-B"],
  [0x0250, "IPA Extensions"], [0x02b0, "Spacing Modifier Letters"], [0x0300, "Combining Diacritical Marks"],
  [0x0370, "Greek and Coptic"], [0x0400, "Cyrillic"], [0x0500, "Cyrillic Supplement"], [0x0530, "Armenian"],
  [0x0590, "Hebrew"], [0x0600, "Arabic"], [0x0700, "Syriac"], [0x0780, "Thaana"], [0x0900, "Devanagari"],
  [0x0980, "Bengali"], [0x0a00, "Gurmukhi"], [0x0a80, "Gujarati"], [0x0b00, "Oriya"], [0x0b80, "Tamil"],
  [0x0c00, "Telugu"], [0x0c80, "Kannada"], [0x0d00, "Malayalam"], [0x0d80, "Sinhala"], [0x0e00, "Thai"], [0x0e80, "Lao"],
  [0x0f00, "Tibetan"], [0x1000, "Myanmar"], [0x10a0, "Georgian"], [0x1100, "Hangul Jamo"], [0x1200, "Ethiopic"],
  [0x13a0, "Cherokee"], [0x1400, "Canadian Syllabics"], [0x1680, "Ogham"], [0x16a0, "Runic"], [0x1780, "Khmer"],
  [0x1800, "Mongolian"], [0x1ab0, "Combining Diacritical Marks Extended"], [0x1d00, "Phonetic Extensions"],
  [0x1dc0, "Combining Diacritical Marks Supplement"], [0x1e00, "Latin Extended Additional"], [0x1f00, "Greek Extended"],
  [0x2000, "General Punctuation"], [0x2070, "Superscripts and Subscripts"], [0x20a0, "Currency Symbols"],
  [0x20d0, "Combining Marks for Symbols"], [0x2100, "Letterlike Symbols"], [0x2150, "Number Forms"], [0x2190, "Arrows"],
  [0x2200, "Mathematical Operators"], [0x2300, "Miscellaneous Technical"], [0x2400, "Control Pictures"],
  [0x2440, "Optical Character Recognition"], [0x2460, "Enclosed Alphanumerics"], [0x2500, "Box Drawing"],
  [0x2580, "Block Elements"], [0x25a0, "Geometric Shapes"], [0x2600, "Miscellaneous Symbols"], [0x2700, "Dingbats"],
  [0x27c0, "Miscellaneous Mathematical Symbols-A"], [0x27f0, "Supplemental Arrows-A"], [0x2800, "Braille Patterns"],
  [0x2900, "Supplemental Arrows-B"], [0x2980, "Miscellaneous Mathematical Symbols-B"], [0x2a00, "Supplemental Mathematical Operators"],
  [0x2b00, "Miscellaneous Symbols and Arrows"], [0x2c00, "Glagolitic"], [0x2c60, "Latin Extended-C"], [0x2c80, "Coptic"],
  [0x2d00, "Georgian Supplement"], [0x2e00, "Supplemental Punctuation"], [0x2e80, "CJK Radicals Supplement"],
  [0x3000, "CJK Symbols and Punctuation"], [0x3040, "Hiragana"], [0x30a0, "Katakana"], [0x3100, "Bopomofo"],
  [0x3130, "Hangul Compatibility Jamo"], [0x3200, "Enclosed CJK Letters and Months"], [0x3300, "CJK Compatibility"],
  [0x3400, "CJK Unified Ideographs Extension A"], [0x4dc0, "Yijing Hexagram Symbols"], [0x4e00, "CJK Unified Ideographs"],
  [0xa000, "Yi Syllables"], [0xa4d0, "Lisu"], [0xa640, "Cyrillic Extended-B"], [0xa720, "Latin Extended-D"],
  [0xac00, "Hangul Syllables"], [0xd800, "Surrogates"], [0xe000, "Private Use Area"], [0xf900, "CJK Compatibility Ideographs"],
  [0xfb00, "Alphabetic Presentation Forms"], [0xfb50, "Arabic Presentation Forms-A"], [0xfe00, "Variation Selectors"],
  [0xfe10, "Vertical Forms"], [0xfe20, "Combining Half Marks"], [0xfe30, "CJK Compatibility Forms"],
  [0xfe50, "Small Form Variants"], [0xfe70, "Arabic Presentation Forms-B"], [0xff00, "Halfwidth and Fullwidth Forms"],
  [0xfff0, "Specials"], [0x10000, "Linear B"], [0x10300, "Old Italic"], [0x1d400, "Mathematical Alphanumeric Symbols"],
  [0x1f000, "Mahjong and Domino Tiles"], [0x1f100, "Enclosed Alphanumeric Supplement"], [0x1f1e6, "Regional Indicators (flags)"],
  [0x1f200, "Enclosed Ideographic Supplement"], [0x1f300, "Emoji: Symbols and Pictographs"], [0x1f600, "Emoji: Emoticons"],
  [0x1f650, "Ornamental Dingbats"], [0x1f680, "Emoji: Transport and Map"], [0x1f700, "Alchemical Symbols"],
  [0x1f780, "Geometric Shapes Extended"], [0x1f800, "Supplemental Arrows-C"], [0x1f900, "Emoji: Supplemental Symbols"],
  [0x1fa00, "Chess Symbols"], [0x1fa70, "Emoji: Symbols and Pictographs Extended-A"], [0x1fb00, "Symbols for Legacy Computing"],
  [0x20000, "CJK Unified Ideographs Extension B+"], [0xe0000, "Tags"], [0xe0100, "Variation Selectors Supplement"],
  [0xf0000, "Supplementary Private Use Area"]
]
var C0_NAMES = "NUL SOH STX ETX EOT ENQ ACK BEL BS TAB LF VT FF CR SO SI DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM SUB ESC FS GS RS US".split(" ")
// Characters worth naming because they are invisible or easy to mistake.
var UNICODE_NAMES = {
  0x20: "SPACE", 0x7f: "DELETE", 0xa0: "NO-BREAK SPACE", 0xad: "SOFT HYPHEN", 0x34f: "COMBINING GRAPHEME JOINER",
  0x61c: "ARABIC LETTER MARK", 0x115f: "HANGUL CHOSEONG FILLER", 0x1160: "HANGUL JUNGSEONG FILLER", 0x180e: "MONGOLIAN VOWEL SEPARATOR",
  0x2000: "EN QUAD", 0x2001: "EM QUAD", 0x2002: "EN SPACE", 0x2003: "EM SPACE", 0x2004: "THREE-PER-EM SPACE",
  0x2005: "FOUR-PER-EM SPACE", 0x2006: "SIX-PER-EM SPACE", 0x2007: "FIGURE SPACE", 0x2008: "PUNCTUATION SPACE",
  0x2009: "THIN SPACE", 0x200a: "HAIR SPACE", 0x200b: "ZERO WIDTH SPACE", 0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER", 0x200e: "LEFT-TO-RIGHT MARK", 0x200f: "RIGHT-TO-LEFT MARK", 0x2010: "HYPHEN",
  0x2011: "NON-BREAKING HYPHEN", 0x2012: "FIGURE DASH", 0x2013: "EN DASH", 0x2014: "EM DASH", 0x2018: "LEFT SINGLE QUOTATION MARK",
  0x2019: "RIGHT SINGLE QUOTATION MARK", 0x201c: "LEFT DOUBLE QUOTATION MARK", 0x201d: "RIGHT DOUBLE QUOTATION MARK",
  0x2026: "HORIZONTAL ELLIPSIS", 0x2028: "LINE SEPARATOR", 0x2029: "PARAGRAPH SEPARATOR", 0x202a: "LEFT-TO-RIGHT EMBEDDING",
  0x202b: "RIGHT-TO-LEFT EMBEDDING", 0x202c: "POP DIRECTIONAL FORMATTING", 0x202d: "LEFT-TO-RIGHT OVERRIDE",
  0x202e: "RIGHT-TO-LEFT OVERRIDE", 0x202f: "NARROW NO-BREAK SPACE", 0x205f: "MEDIUM MATHEMATICAL SPACE",
  0x2060: "WORD JOINER", 0x2061: "FUNCTION APPLICATION", 0x2062: "INVISIBLE TIMES", 0x2063: "INVISIBLE SEPARATOR",
  0x2064: "INVISIBLE PLUS", 0x2066: "LEFT-TO-RIGHT ISOLATE", 0x2067: "RIGHT-TO-LEFT ISOLATE", 0x2068: "FIRST STRONG ISOLATE",
  0x2069: "POP DIRECTIONAL ISOLATE", 0x2212: "MINUS SIGN", 0x3000: "IDEOGRAPHIC SPACE", 0x3164: "HANGUL FILLER",
  0xfe0e: "VARIATION SELECTOR-15 (text)", 0xfe0f: "VARIATION SELECTOR-16 (emoji)", 0xfeff: "ZERO WIDTH NO-BREAK SPACE (BOM)",
  0xfffc: "OBJECT REPLACEMENT CHARACTER", 0xfffd: "REPLACEMENT CHARACTER", 0xffa0: "HALFWIDTH HANGUL FILLER"
}
// Letters from other scripts that render like Latin ones: the stuff of
// lookalike domains and "why does this string not match".
var CONFUSABLES = {
  0x430: "a", 0x435: "e", 0x43e: "o", 0x440: "p", 0x441: "c", 0x443: "y", 0x445: "x", 0x456: "i", 0x458: "j", 0x455: "s",
  0x4bb: "h", 0x501: "d", 0x51b: "q", 0x51d: "w", 0x410: "A", 0x412: "B", 0x415: "E", 0x41a: "K", 0x41c: "M", 0x41d: "H",
  0x41e: "O", 0x420: "P", 0x421: "C", 0x422: "T", 0x425: "X", 0x406: "I", 0x408: "J", 0x405: "S",
  0x3bf: "o", 0x3b1: "a", 0x3bd: "v", 0x3c1: "p", 0x3b9: "i", 0x391: "A", 0x392: "B", 0x395: "E", 0x396: "Z", 0x397: "H",
  0x399: "I", 0x39a: "K", 0x39c: "M", 0x39d: "N", 0x39f: "O", 0x3a1: "P", 0x3a4: "T", 0x3a5: "Y", 0x3a7: "X",
  0x131: "i", 0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2013: "-", 0x2212: "-", 0xff01: "!", 0x2024: ".", 0x37e: ";", 0x2044: "/"
}

function unicodeBlock(cp) {
  var lo = 0, hi = UNICODE_BLOCKS.length - 1
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1
    if (UNICODE_BLOCKS[mid][0] <= cp) lo = mid; else hi = mid - 1
  }
  return UNICODE_BLOCKS[lo][1]
}

function isInvisible(cp) {
  return (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) || cp === 0x7f || (cp >= 0x80 && cp < 0xa0) || cp === 0xad ||
    cp === 0x34f || cp === 0x61c || cp === 0x115f || cp === 0x1160 || cp === 0x180e || (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x3164 ||
    cp === 0xfeff || cp === 0xffa0 || (cp >= 0xe0000 && cp <= 0xe007f)
}

function isOddSpace(cp) { return cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000 }

function codePoints(s) {
  var out = []
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { out.push(0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00)); i++; continue }
    }
    out.push(c)
  }
  return out
}

function hexCp(cp) { var h = cp.toString(16).toUpperCase(); return "U+" + ("0000" + h).slice(-Math.max(4, h.length)) }

function unicodeTool(input, mode) {
  if (input === "") return result("", "", "Paste text to see every character in it")
  if (input.length > 262144) return result("", "Too long to inspect here (256 KiB max)")
  var cps = codePoints(input)
  if (mode === "escape-js") {
    var esc = cps.map(function (cp) {
      // Line breaks and tabs stay as they are, so multi-line text keeps its shape.
      if (cp < 0x80 && !isInvisible(cp)) return String.fromCharCode(cp)
      return cp > 0xffff ? "\\u{" + cp.toString(16).toUpperCase() + "}" : "\\u" + ("000" + cp.toString(16).toUpperCase()).slice(-4)
    }).join("")
    return result(esc, "", "Non-ASCII as \\u escapes (JS, JSON for BMP, Rust/Swift for \\u{…})")
  }
  var invisible = 0, spaces = 0, look = 0, nonAscii = 0
  var scripts = {}
  cps.forEach(function (cp) {
    if (isInvisible(cp)) invisible++
    if (isOddSpace(cp)) spaces++
    if (CONFUSABLES.hasOwnProperty(cp)) look++
    if (cp >= 0x80) nonAscii++
    if (/[A-Za-z]/.test(String.fromCharCode(cp)) && cp < 0x80) scripts.Latin = true
    else if (cp >= 0x400 && cp < 0x530) scripts.Cyrillic = true
    else if (cp >= 0x370 && cp < 0x400) scripts.Greek = true
  })
  if (mode === "strip") {
    var kept = cps.filter(function (cp) { return !isInvisible(cp) }).map(function (cp) {
      if (isOddSpace(cp)) return " "
      return String.fromCodePoint(cp)
    }).join("")
    return result(kept, "", invisible + " invisible removed · " + spaces + " unusual spaces made plain")
  }
  var pairs = []
  for (var i = 0; i < cps.length && i < UNICODE_MAX_ROWS; i++) {
    var cp = cps[i], ch = String.fromCodePoint(cp)
    var name = cp < 0x20 ? C0_NAMES[cp] : (UNICODE_NAMES[cp] || "")
    var shown = cp < 0x20 || isInvisible(cp) || isOddSpace(cp) || cp === 0x20 || (cp >= 0x300 && cp < 0x370) ? "·" : ch
    var bytes = utf8Encode(ch).map(function (b) { return ("0" + b.toString(16).toUpperCase()).slice(-2) }).join(" ")
    var notes = []
    if (isInvisible(cp)) notes.push("⚠ invisible")
    else if (isOddSpace(cp)) notes.push("⚠ not a plain space")
    if (CONFUSABLES.hasOwnProperty(cp)) notes.push("⚠ looks like Latin '" + CONFUSABLES[cp] + "'")
    var js = cp > 0xffff ? "\\u{" + cp.toString(16).toUpperCase() + "}" : "\\u" + ("000" + cp.toString(16).toUpperCase()).slice(-4)
    var value = (name ? name + " · " : "") + unicodeBlock(cp) + "   UTF-8 " + bytes + "   " + js + "   &#" + cp + ";"
    if (notes.length) value = notes.join(" ") + "   " + value
    pairs.push([shown + "  " + hexCp(cp), value, ch])
  }
  var bits = [cps.length + " code points", input.length + " UTF-16 units", utf8Length(input) + " bytes"]
  if (invisible) bits.push(invisible + " invisible")
  if (spaces) bits.push(spaces + " unusual spaces")
  if (look) bits.push(look + " Latin look-alikes")
  if (Object.keys(scripts).length > 1) bits.push("mixed scripts: " + Object.keys(scripts).join(" + "))
  if (cps.length > UNICODE_MAX_ROWS) bits.push("first " + UNICODE_MAX_ROWS + " shown")
  var r = withPairs(pairs, bits.join(" · "))
  r.urgent = invisible > 0 || look > 0
  return r
}

// ---------------------------------------------------------------- ID inspector

function idTime(ms, nowMs) {
  var d = new Date(ms)
  if (isNaN(d.getTime())) return "invalid"
  return d.toISOString() + "  (" + relative(ms, nowMs) + ")"
}

function hexToBytes(h) {
  var out = []
  for (var i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16))
  return out
}

function bytesToNumber(bytes) { var n = 0; bytes.forEach(function (b) { n = n * 256 + b }); return n }

function decodeAlphabet(s, alphabet) {
  var limbs = [0]
  for (var i = 0; i < s.length; i++) {
    var v = alphabet.indexOf(s.charAt(i))
    if (v < 0) return null
    bnMulAdd(limbs, alphabet.length, v)
  }
  return bnTrim(limbs)
}

function limbsToBytes(limbs, n) {
  var hex = bnTo(limbs, 16)
  while (hex.length < n * 2) hex = "0" + hex
  return hex.length > n * 2 ? null : hexToBytes(hex)
}

var BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

var IDS_MAX_LINES = 20

// One ID per line, up to IDS_MAX_LINES of them.
function idsTool(input, nowMs) {
  var all = input.split("\n").map(function (l) { return l.trim() }).filter(function (l) { return l })
  if (!all.length) return result("", "", "Paste an ID: UUID, ULID, KSUID, MongoDB ObjectId, Snowflake, XID, Nano ID…")
  if (all.length === 1) {
    var one = inspectId(all[0], nowMs)
    return one.error ? result("", one.error) : withPairs(one.pairs, one.kind)
  }
  var pairs = [], kinds = [], bad = 0
  all.slice(0, IDS_MAX_LINES).forEach(function (line, k) {
    var r = inspectId(line, nowMs)
    pairs.push(["#" + (k + 1), line])
    if (r.error) { bad++; pairs.push(["", "✗ " + r.error]); return }
    if (kinds.indexOf(r.kind) === -1) kinds.push(r.kind)
    r.pairs.forEach(function (p) { pairs.push(["  " + p[0], p[1]]) })
  })
  var res = withPairs(pairs, all.length + " IDs: " + kinds.join(", ") + (bad ? " · " + bad + " not recognised" : "")
    + (all.length > IDS_MAX_LINES ? " · first " + IDS_MAX_LINES + " shown" : ""))
  return res
}

function inspectId(line, nowMs) {
  var s = line.replace(/^urn:uuid:/i, "").replace(/^\{|\}$/g, "")
  var more = ""
  var pairs = [], kind = "", m
  if ((m = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(s))) {
    var hex = (m[1] + m[2] + m[3] + m[4] + m[5]).toLowerCase(), b = hexToBytes(hex)
    var ver = b[6] >> 4, variant = b[8] >> 5
    var vname = (variant & 4) === 0 ? "NCS (reserved)" : (variant & 6) === 4 ? "RFC 9562" : (variant & 7) === 6 ? "Microsoft (reserved)" : "future (reserved)"
    kind = "UUID"
    if (/^0+$/.test(hex)) { pairs.push(["Type", "Nil UUID"]); return { kind: "UUID", pairs: pairs } }
    if (/^f+$/.test(hex)) { pairs.push(["Type", "Max UUID"]); return { kind: "UUID", pairs: pairs } }
    var vdesc = { 1: "v1 · time + MAC address", 2: "v2 · DCE security", 3: "v3 · name-based (MD5)", 4: "v4 · random",
                  5: "v5 · name-based (SHA-1)", 6: "v6 · reordered time", 7: "v7 · Unix time + random", 8: "v8 · custom" }[ver] || "unknown version " + ver
    pairs.push(["Type", "UUID " + vdesc], ["Variant", vname], ["Canonical", (m[1] + "-" + m[2] + "-" + m[3] + "-" + m[4] + "-" + m[5]).toLowerCase()])
    if (ver === 7) {
      var ms7 = bytesToNumber(b.slice(0, 6))
      pairs.push(["Created", idTime(ms7, nowMs)], ["Unix ms", String(ms7)], ["Random bits", "74"])
    } else if (ver === 1 || ver === 6) {
      // 60-bit count of 100 ns intervals since 1582-10-15.
      var tHex = ver === 1 ? hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8) : hex.slice(0, 12) + hex.slice(13, 16)
      var ticks = bnFrom(tHex, 16)
      var msTicks = Number(bnTo(ticks, 10)) / 10000 - 12219292800000
      pairs.push(["Created", idTime(msTicks, nowMs)], ["Clock sequence", String(((b[8] & 0x3f) << 8) | b[9])],
                 ["Node", hex.slice(20).replace(/(..)(?!$)/g, "$1:") + ((b[10] & 1) ? "  (random, multicast bit set)" : "  (MAC address)")])
    } else if (ver === 4) pairs.push(["Random bits", "122"], ["Time", "none (a v4 UUID carries no timestamp)"])
    pairs.push(["Hex", hex], ["Base64", base64FromBytes(b)], ["As ULID", ulidFromBytes(b)])
  } else if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(s)) {
    kind = "ULID"
    var lb = limbsToBytes(decodeAlphabet(s.toUpperCase(), CROCKFORD), 16)
    var msu = bytesToNumber(lb.slice(0, 6))
    var uh = lb.map(function (x) { return ("0" + x.toString(16)).slice(-2) }).join("")
    pairs.push(["Type", "ULID · 48-bit time + 80 random bits"], ["Created", idTime(msu, nowMs)], ["Unix ms", String(msu)],
               ["Random", s.slice(10).toUpperCase()], ["As UUID", uh.replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-")])
  } else if (/^[0-9A-Za-z]{27}$/.test(s) && (m = decodeAlphabet(s, BASE62)) && limbsToBytes(m, 20)) {
    kind = "KSUID"
    var kb = limbsToBytes(m, 20), ks = bytesToNumber(kb.slice(0, 4)) + 1400000000
    pairs.push(["Type", "KSUID · 32-bit time + 128 random bits"], ["Created", idTime(ks * 1000, nowMs)], ["Unix s", String(ks)],
               ["Payload", kb.slice(4).map(function (x) { return ("0" + x.toString(16)).slice(-2) }).join("")])
  } else if (/^[0-9a-f]{24}$/i.test(s)) {
    kind = "ObjectId"
    var ob = hexToBytes(s.toLowerCase()), os = bytesToNumber(ob.slice(0, 4))
    pairs.push(["Type", "MongoDB ObjectId · 32-bit time + random + counter"], ["Created", idTime(os * 1000, nowMs)], ["Unix s", String(os)],
               ["Random", s.slice(8, 18).toLowerCase()], ["Counter", String(bytesToNumber(ob.slice(9)))])
  } else if (/^[0-9a-v]{20}$/.test(s)) {
    kind = "XID"
    var xl = decodeAlphabet(s, "0123456789abcdefghijklmnopqrstuv")
    // 20 base32hex characters hold 100 bits; the 12-byte value sits in the top 96.
    var xh = bnTo(xl, 2)
    while (xh.length < 100) xh = "0" + xh
    var xb = []
    for (var q = 0; q < 96; q += 8) xb.push(parseInt(xh.substr(q, 8), 2))
    var xs = bytesToNumber(xb.slice(0, 4))
    pairs.push(["Type", "XID · 32-bit time + machine + pid + counter"], ["Created", idTime(xs * 1000, nowMs)],
               ["Machine", xb.slice(4, 7).map(function (x) { return ("0" + x.toString(16)).slice(-2) }).join("")],
               ["PID", String(bytesToNumber(xb.slice(7, 9)))], ["Counter", String(bytesToNumber(xb.slice(9)))])
  } else if (/^\d{15,20}$/.test(s)) {
    kind = "Snowflake"
    var bits = bnTo(bnFrom(s, 10), 2)
    if (bits.length > 64) return { error: "Too large for a 64-bit Snowflake ID" }
    while (bits.length < 64) bits = "0" + bits
    var tsms = parseInt(bits.slice(0, 42), 2)
    var w = parseInt(bits.slice(42, 47), 2), pr = parseInt(bits.slice(47, 52), 2), seq = parseInt(bits.slice(52), 2)
    var epochs = [["Twitter / X", 1288834974657], ["Discord", 1420070400000], ["Unix epoch", 0]]
    pairs.push(["Type", "Snowflake · 42-bit time + 10-bit worker + 12-bit sequence"])
    epochs.forEach(function (e) {
      var at = tsms + e[1]
      // An epoch that puts the ID in the future cannot be the one it uses.
      if (at > 0 && at < nowMs + 86400000) pairs.push([e[0] + " time", idTime(at, nowMs)])
    })
    pairs.push(["Worker", "datacenter " + w + " · worker " + pr], ["Sequence", String(seq)])
  } else if (/^c[a-z0-9]{24}$/.test(s)) {
    kind = "CUID"
    var cms = parseInt(s.slice(1, 9), 36)
    pairs.push(["Type", "CUID v1 · base-36 time + counter + fingerprint + random"], ["Created", idTime(cms, nowMs)])
  } else if (/^[A-Za-z0-9_-]{21}$/.test(s)) {
    kind = "Nano ID"
    pairs.push(["Type", "Looks like a Nano ID (21 URL-safe characters)"], ["Randomness", "126 bits"], ["Time", "none (Nano IDs are purely random)"])
  } else return { error: "Not an ID format this tool knows (UUID, ULID, KSUID, ObjectId, XID, Snowflake, CUID, Nano ID)" }
  return { kind: kind, pairs: pairs }
}

function ulidFromBytes(b) {
  var s = "", acc = 0, accBits = 2
  for (var x = 0; x < 16; x++) {
    acc = (acc << 8) | b[x]; accBits += 8
    while (accBits >= 5) { accBits -= 5; s += CROCKFORD.charAt((acc >> accBits) & 31) }
    acc &= (1 << accBits) - 1
  }
  return s
}

// ---------------------------------------------------------------- Text statistics

function statsTool(input) {
  if (input === "") return result("", "", "Paste text to count it")
  if (input.length > 4194304) return result("", "Too long to analyse here (4 MiB max)")
  // Qt's engine has no \p{L}, so a word is a run of anything that is not
  // whitespace or punctuation, which works for every script.
  var words = (input.match(/[^\s.,;:!?()\[\]{}"“”„«»…—–\/\\|<>+=*&^%$#@~`。、！？]+/g) || []).filter(function (w) { return /[^'’_-]/.test(w) })
  var lines = input.split("\n")
  var sentences = (input.match(/[^.!?。！？]+[.!?。！？]+(\s|$)/g) || []).length || (words.length ? 1 : 0)
  var paragraphs = input.split(/\n\s*\n/).filter(function (p) { return p.trim() }).length
  var longest = 0, longestAt = 0
  lines.forEach(function (l, i) { if (l.length > longest) { longest = l.length; longestAt = i + 1 } })
  var freq = {}, uniq = 0, totalLen = 0
  words.forEach(function (w) {
    var k = "$" + w.toLowerCase()
    totalLen += w.length
    if (!freq.hasOwnProperty(k)) { freq[k] = 0; uniq++ }
    freq[k]++
  })
  var top = Object.keys(freq).filter(function (k) { return k.length > 3 }).sort(function (a, b) { return freq[b] - freq[a] || (a < b ? -1 : 1) }).slice(0, 8)
  function minutes(n, wpm) { var m = n / wpm; return m < 1 ? Math.max(1, Math.round(m * 60)) + " s" : Math.round(m) + " min" }
  var cps = codePoints(input).length
  var pairs = [
    ["Characters", String(cps) + (cps !== input.length ? "  (" + input.length + " UTF-16 units)" : "")],
    ["Without spaces", String(input.replace(/\s/g, "").length)],
    ["Words", String(words.length)],
    ["Unique words", String(uniq)],
    ["Sentences", String(sentences)],
    ["Paragraphs", String(paragraphs)],
    ["Lines", String(input.replace(/\n$/, "").split("\n").length)],
    ["Bytes (UTF-8)", String(utf8Length(input))],
    ["Average word", words.length ? round(totalLen / words.length, 1) + " characters" : "–"],
    ["Longest line", longest + " characters (line " + longestAt + ")"],
    ["Reading time", minutes(words.length, 230)],
    ["Speaking time", minutes(words.length, 150)]
  ]
  if (top.length) pairs.push(["Most used", top.map(function (k) { return k.slice(1) + " ×" + freq[k] }).join(", ")])
  return withPairs(pairs, words.length + " words · " + cps + " characters")
}

// ---------------------------------------------------------------- Lorem ipsum

var LOREM_WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore "
  + "magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis "
  + "aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non "
  + "proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc gravida "
  + "porta vestibulum mauris risus fermentum justo vitae ultricies sapien feugiat").split(" ")
var LOREM_CLASSIC = "Lorem ipsum dolor sit amet, consectetur adipiscing elit"

// Placeholder text, not secrets, so a seeded generator is fine here and makes
// the output stable until you ask for another.
function loremRandom(seed) {
  var a = (Number(seed) >>> 0) || 1
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    var t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function loremTool(mode, opts) {
  var count = Math.max(1, Math.min(100, Math.floor(Number(opts && opts.count)) || 3))
  var classic = !opts || opts.classic !== false
  var rnd = loremRandom(opts && opts.seed !== undefined ? opts.seed : 1)
  function pick() { return LOREM_WORDS[Math.floor(rnd() * LOREM_WORDS.length)] }
  function sentence() {
    var n = 6 + Math.floor(rnd() * 10), w = []
    for (var i = 0; i < n; i++) w.push(pick())
    if (n > 9 && rnd() < 0.5) w[3 + Math.floor(rnd() * 4)] += ","
    var s = w.join(" ")
    return s.charAt(0).toUpperCase() + s.slice(1) + "."
  }
  function paragraph() {
    var n = 4 + Math.floor(rnd() * 4), s = []
    for (var i = 0; i < n; i++) s.push(sentence())
    return s.join(" ")
  }
  var out
  if (mode === "words") {
    var w = []
    for (var i = 0; i < count; i++) w.push(pick())
    if (classic) w = LOREM_CLASSIC.toLowerCase().replace(/,/g, "").split(" ").concat(w).slice(0, count)
    out = w.join(" ")
  } else if (mode === "sentences") {
    var ss = []
    for (var j = 0; j < count; j++) ss.push(sentence())
    if (classic) ss[0] = LOREM_CLASSIC + "."
    out = ss.join(" ")
  } else {
    var ps = []
    for (var k = 0; k < count; k++) ps.push(paragraph())
    if (classic) ps[0] = LOREM_CLASSIC + ", " + ps[0].charAt(0).toLowerCase() + ps[0].slice(1)
    out = ps.join("\n\n")
  }
  var words = (out.match(/\S+/g) || []).length
  return result(out, "", count + " " + (mode || "paragraphs") + " · " + words + " words · " + out.length + " characters")
}

// ---------------------------------------------------------------- Chains

// A chain runs text through several tools in a row. Each step is
// { tool, mode, opts }. Steps are tools whose output is text; regex steps run
// user patterns, so a chain with one only ever runs in bin/devkit-regex's
// worker, never in the shell.
var CHAIN_MAX_STEPS = 12

var CHAIN_MODE_SETS = {
  "case": CASE_NAMES.map(function (n) { return { value: n, label: n } }),
  regex: [{ value: "matches", label: "Matches" }, { value: "group", label: "First group" }, { value: "replace", label: "Replace" }],
  jwt: [{ value: "payload", label: "Payload" }, { value: "header", label: "Header" }, { value: "decode", label: "Everything" }]
}
var CHAIN_OPTIONS = {
  regex: [
    { id: "pattern", type: "text", grow: true, placeholder: "Pattern, e.g. [\\w.]+@[\\w.]+" },
    { id: "flags", type: "text", value: "g", width: 60, placeholder: "flags" },
    { id: "replacement", type: "text", grow: true, placeholder: "Replacement ($1, $<name>)", modes: ["replace"] }
  ]
}

function chainable(t) { return t.chain !== false && (t.kind || "text") === "text" }

function chainTools() { return TOOLS.filter(chainable) }

function chainModes(toolId) {
  var t = toolById(toolId)
  return CHAIN_MODE_SETS[toolId] || t.modes
}

function chainOptions(toolId, mode) {
  var list = CHAIN_OPTIONS[toolId] || (toolById(toolId).options || []).filter(function (o) { return o.id !== "secret" && o.id !== "secretB64" && o.id !== "alg" })
  return list.filter(function (o) { return !o.modes || o.modes.indexOf(mode) !== -1 })
}

function chainStep(toolId) {
  var modes = chainModes(toolId), opts = {}
  ;(CHAIN_OPTIONS[toolId] || toolById(toolId).options || []).forEach(function (o) { if (o.value !== undefined && !opts.hasOwnProperty(o.id)) opts[o.id] = o.value })
  return { tool: toolId, mode: modes.length ? modes[0].value : "", opts: opts }
}

function chainNeedsWorker(steps) {
  return (steps || []).some(function (s) { return s.tool === "regex" })
}

// Runs every step. allowRegex is true only inside the worker process.
function chainRun(steps, input, nowMs, allowRegex) {
  var report = [], text = String(input === undefined ? "" : input)
  if (!steps || !steps.length) return { output: text, error: "", info: "Add a step", steps: [] }
  if (steps.length > CHAIN_MAX_STEPS) return { output: "", error: "A chain has at most " + CHAIN_MAX_STEPS + " steps", info: "", steps: [] }
  for (var i = 0; i < steps.length; i++) {
    var st = steps[i], t = toolById(st.tool), r
    if (!chainable(t) || t.id !== st.tool) r = result("", "“" + st.tool + "” cannot be a chain step")
    else if (st.tool === "regex") r = allowRegex ? regexChainStep(text, st.mode, st.opts || {}) : result("", "Regex steps run in the worker")
    else r = run(st.tool, { input: text, mode: st.mode, opts: st.opts || {}, nowMs: nowMs })
    var out = r.output || ""
    report.push({ tool: st.tool, ok: !r.error, error: r.error || "", info: r.info || "", chars: out.length,
                  preview: out.length > 400 ? out.slice(0, 400) + "…" : out })
    if (r.error) return { output: "", error: "Step " + (i + 1) + " (" + t.name + "): " + r.error, info: "", steps: report, failedAt: i }
    if (out === "" && text !== "") return { output: "", error: "Step " + (i + 1) + " (" + t.name + ") produced nothing", info: "", steps: report, failedAt: i }
    text = out
  }
  return { output: text, error: "", info: steps.length + " steps · " + text.length + " characters", steps: report }
}

// Chains offered before you save your own.
var DEFAULT_CHAINS = [
  { id: "builtin-urljson", name: "URL param → JSON", steps: [
    { tool: "url", mode: "decode", opts: {} }, { tool: "json", mode: "pretty2", opts: { query: "" } }],
    input: "%7B%22user%22%3A%22ada%22%2C%22roles%22%3A%5B%22admin%22%2C%22dev%22%5D%7D" },
  { id: "builtin-b64json", name: "Base64 → JSON", steps: [
    { tool: "base64", mode: "decode", opts: {} }, { tool: "json", mode: "pretty2", opts: { query: "" } }],
    input: "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iLCJkZXYiXSwiZW1vamkiOiLwn5qAIn0=" },
  { id: "builtin-jwtyaml", name: "JWT claims → YAML", steps: [
    { tool: "jwt", mode: "payload", opts: {} }, { tool: "yaml", mode: "to-yaml", opts: {} }] },
  { id: "builtin-emails", name: "Extract unique emails", steps: [
    { tool: "regex", mode: "matches", opts: { pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+", flags: "gi" } },
    { tool: "lines", mode: "unique", opts: {} }, { tool: "lines", mode: "sort", opts: {} }],
    input: "From: Ada <ada@example.com>\nCc: grace@navy.mil, ADA@example.com\nReply to ada@example.com or linus@kernel.org" }
]

// ---------------------------------------------------------------- Samples

// One example per tool (and per mode where the input differs), for the
// Sample button. Generators (UUID, Password) take no input, so have none.
var SAMPLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
  + "eyJzdWIiOiJ1c2VyXzEwNDIiLCJuYW1lIjoiQWRhIExvdmVsYWNlIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9."
  + "Y3r2aHutsUDQjWdbJchEZCADalebiWojzScrMz7bl8s"

var SAMPLE_ORDER = '{"id":"ord_1042","total":59.9,"paid":true,"customer":{"name":"Ada Lovelace","email":null},'
  + '"items":[{"sku":"KB-01","qty":1,"price":49.9},{"sku":"CB-USB","qty":2,"price":5,"gift":true}],"shipped-at":"2024-05-01T10:00:00Z"}'

var SAMPLE_YAML = "# CI pipeline\ndefaults: &defaults\n  image: node:20\n  retries: 2\n\nstages: [test, deploy]\n\ntest:\n  <<: *defaults\n  script:\n    - npm ci\n    - npm test\n  only: no        # a string in YAML 1.2\n\ndeploy:\n  <<: *defaults\n  when: manual\n  description: >\n    Ships the build to\n    production.\n"

// A 2×2 PNG: red, green, blue and white pixels.
var SAMPLE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR42mP4z8DAAMIM/4EAAB/uBfvxq7p3AAAAAElFTkSuQmCC"

var SAMPLES = {
  json: {
    "*": { input: SAMPLE_ORDER },
    minify: { input: '{\n  // JSONC: comments and trailing commas are fine\n  "name": "devkit",\n  "tags": ["json", "jwt",],\n  unquoted: \'single quotes\',\n}' }
  },
  yaml: { "*": { input: SAMPLE_ORDER }, "to-json": { input: SAMPLE_YAML } },
  csv: {
    "*": { input: '[{"name":"Ada","role":"admin","teams":["core"]},{"name":"Linus","role":"dev, ops"},{"name":"Grace","role":"dev","active":false}]' },
    "to-json": { input: 'name,age,zip,active\n"Lovelace, Ada",36,00123,true\nGrace Hopper,85,10001,false\nLinus,,,true' }
  },
  types: { "*": { input: SAMPLE_ORDER } },
  xml: { "*": { input: '<?xml version="1.0" encoding="UTF-8"?><project><modelVersion>4.0.0</modelVersion><!-- coordinates --><groupId>dev.devkit</groupId><dependencies><dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4.13.2</version><scope>test</scope></dependency></dependencies><build><plugins/></build></project>' } },
  html: { "*": { input: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DevKit</title><style>body{font:16px sans-serif}</style></head><body><nav><a href="/">Home</a> | <a href="/docs">Docs</a></nav><main><h1>Hello</h1><p>Formatted <b>offline</b>, with <code>&lt;tags&gt;</code> kept intact.<p>Lists close themselves:<ul><li>one<li>two</ul><pre>  spacing\n    preserved</pre></main><script>console.log("hi")</script></body></html>' } },
  css: {
    "*": { input: '@import url("theme.css");:root{--accent:#7aa2f7}body,html{margin:0;padding:0;font:16px/1.5 system-ui}a:hover>span{color:var(--accent)!important}@media (max-width:600px){.card{padding:8px 12px;background:url("bg;1.png") no-repeat}}' },
    minify: { input: "/* Layout */\n.card,\n.panel {\n  padding: 8px 12px;\n  margin: 0 auto;\n}\n\n@media (max-width: 600px) {\n  .card {\n    display: none;\n  }\n}\n" }
  },
  sql: { "*": { input: "select o.id, c.name, sum(i.qty * i.price) as total, case when o.paid then 'paid' else 'open' end as status from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id where o.created_at >= '2024-01-01' and c.country in ('NL', 'BE') and o.id not in (select order_id from refunds) group by o.id, c.name having sum(i.qty) > 1 order by total desc limit 20;" } },
  jwt: {
    "*": { input: SAMPLE_JWT, opts: { secret: "devkit-sample-secret" } },
    sign: { input: '{\n  "sub": "user_1042",\n  "name": "Ada Lovelace",\n  "role": "admin",\n  "iat": 1700000000,\n  "exp": 1900000000\n}', opts: { secret: "devkit-sample-secret" } }
  },
  base64: {
    "*": { input: "Hello, Omarchy! 👋 DevKit works offline." },
    decode: { input: "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iLCJkZXYiXSwiZW1vamkiOiLwn5qAIn0=" }
  },
  base64img: { decode: { input: "data:image/jpeg;base64," + SAMPLE_PNG } },
  url: {
    "*": { input: "name=Ada Lovelace & friends / 100% café?" },
    decode: { input: "q%3Dhello%20world%26lang%3Den%26emoji%3D%F0%9F%91%8B" },
    parse: { input: "https://ada@api.example.com:8443/v1/search?q=omarchy&tags=dev,tools&page=2#results" }
  },
  time: { "*": { input: "1700000000" } },
  hash: { text: { input: "The quick brown fox jumps over the lazy dog",
                  opts: { expect: "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592" } } },
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
  unicode: {
    "*": { input: "pаypal.com\u200b — “smart” quotes, café, 👩‍💻" },
    "escape-js": { input: "café ☕ 👋" },
    strip: { input: "copied\u00a0from\u200b a\u2009web page\ufeff" }
  },
  color: { "*": { input: "#7aa2f7" } },
  lines: { "*": { input: "GET /api/users 200\nGET /api/users 200\nPOST /api/login 401\nGET /health 200\nGET /api/users 200\n"
                         + "POST /api/login 401\nGET /api/orders 500\nGET /api/users 200\nGET /health 200" } },
  stats: { "*": { input: "DevKit is a set of everyday developer tools for Omarchy. It runs offline, inside the shell.\n\n"
                         + "Paste a token, a payload or a log line, and it shows you what is inside. Nothing you type is sent anywhere." } },
  markdown: { "*": { input: "# DevKit notes\n\nEveryday tools, **offline**, one key away. See [the repo](https://github.com/Coding-Sparrow/omarchy-devkit).\n\n"
    + "## Checklist\n\n- [x] Format JSON\n- [x] Decode a JWT\n- [ ] Write the *release* notes\n  - nested item with `inline code`\n\n"
    + "| Tool | Key | Offline |\n| --- | :---: | ---: |\n| JSON | `Ctrl+1` | ✓ |\n| Cron | `Ctrl+⇧R` | ✓ |\n\n"
    + "> Tip: press **Esc** to close.\n\n```bash\nomarchy plugin update coding-sparrow.devkit\nomarchy restart shell\n```\n\n"
    + "1. Paste\n2. Read\n3. ~~Struggle~~ Ship\n\n---\n\n![a screenshot](https://example.com/shot.png) is shown as text, never loaded." } },
  htmlpreview: { "*": { input: '<h2 onclick="steal()">Order #1042 shipped</h2><p>Hi <b>Ada</b>, your order is on its way. <a href="https://example.com/track">Track it</a> or <a href="javascript:alert(1)">this one is removed</a>.</p><table><tr><th>Item</th><th align="right">Qty</th></tr><tr><td>Keyboard</td><td align="right">1</td></tr></table><img src="https://tracker.example.com/pixel.gif" alt="tracking pixel"><script>alert("removed")</script>' } },
  qr: { "*": { input: "https://github.com/Coding-Sparrow/omarchy-devkit" },
        wifi: { input: "correct horse battery staple", opts: { ssid: "Omarchy Café" } } },
  ids: { "*": { input: "018f2c6a-9b7e-7cc3-8a52-3f4b1c2d9e10\n01HXZ8V9QF4D3K2M1N0P9R8S7T\n0ujtsYcgvSTl8PAuAdqWYSMnLOv\n507f1f77bcf86cd799439011\n1541815603606036480" } }
}

function sample(toolId, mode) {
  var s = SAMPLES[toolId]
  if (!s) return null
  var pick = s[mode] || s["*"]
  if (!pick) return null
  var out = {}
  for (var k in pick) out[k] = k === "opts" ? JSON.parse(JSON.stringify(pick[k])) : pick[k]
  return out
}

// ---------------------------------------------------------------- Detect

// Best guess at which tool the clipboard content belongs to, or "".
var DETECT_MAX = 1048576

function detect(text) {
  var s = String(text || "").trim()
  if (s === "" || s.length > DETECT_MAX) return ""
  if (/^(Bearer\s+)?eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/.test(s)) return "jwt"
  if (/^[\[{]/.test(s)) { try { JSON.parse(s); return "json" } catch (e) { if (/^\{\s*["\/\w]/.test(s) && !parseLenientJson(s).error) return "json"; if (/^\{\s*"/.test(s)) return "json" } }
  if (/^(url\(\s*["']?)?data:image\//i.test(s) || /^<img[^>]+src=["']data:image\//i.test(s)) return "base64img"
  if (s.length <= 64 && /^(#[0-9A-Fa-f]{3,4}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|(rgba?|hsla?|oklch)\([^()]*\))$/.test(s) && parseColor(s)) return "color"
  // A heading, then more lines with list, link, emphasis or code markup.
  if (s.length <= MARKDOWN_MAX && /^#{1,3} \S/.test(s) && /\n/.test(s) && /(^|\n)([-*] |\d+\. |```|> )|\]\(|\*\*|`/.test(s)) return "markdown"
  if (/^0[xX][0-9A-Fa-f_]{1,64}$/.test(s) || /^0[bB][01_]{1,256}$/.test(s)) return "number"
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/i.test(s)) return "cron"
  // Five fields with at least one * or /, e.g. "*/5 * * * *" or "0 9 * * MON-FRI".
  if (s.length <= CRON_MAX && /^([\d*?,\/-]+[ \t]+){4}[\dA-Za-z*?,\/-]+$/.test(s) && /[*\/]/.test(s)) return "cron"
  if (/^\d{10}(\d{3})?$/.test(s)) return "time"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "time"
  // IDs: UUIDs, ULIDs, ObjectIds and KSUIDs, one per line.
  var first = s.split("\n")[0].trim()
  if (/^(urn:uuid:)?\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(first) ||
      /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(first) || /^[0-9a-f]{24}$/.test(first) || /^\d{17,19}$/.test(first)) return "ids"
  if (/^https?:\/\/\S+$/.test(s)) return "url"
  if (/%[0-9A-Fa-f]{2}/.test(s) && !/\s/.test(s)) return "url"
  if (/^<(!DOCTYPE html|html|head|body|div|p|span|table|ul|section|main|a |h[1-6])[\s>]/i.test(s) && />$/.test(s)) return "html"
  if (/^<(\?xml|[A-Za-z_][\w:.-]*[\s>\/])/.test(s) && />$/.test(s)) return "xml"
  if (/^(select|insert\s+into|update|delete\s+from|with)\s/i.test(s) && /\b(from|into|set|as)\b/i.test(s)) return "sql"
  if (s.length <= CSS_MAX && !/</.test(s) && /^[^{}]+\{\s*[\w-]+\s*:[^{}]*\}/.test(s)) return "css"
  // YAML: two or more lines, a top-level "key:" or "- " shape, and not JSON.
  if (/\n/.test(s) && (/^---\s*(\n|$)/.test(s) || /^[A-Za-z_][\w.-]*:(\s|$)/.test(s)) && /\n\s*([\w"'.-]+:|- )/.test(s)) return "yaml"
  if (s.length >= 8 && s.length % 4 !== 1 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(s) && (/[0-9+/=_-]/.test(s) || (/[A-Z]/.test(s) && /[a-z]/.test(s)))) {
    var bytes = bytesFromBase64(s)
    var t = bytes && utf8Decode(bytes)
    if (t && isPrintable(t) && /[A-Za-z]{2}/.test(t)) return "base64"
  }
  // Text with invisible characters or Latin look-alikes is worth a look.
  if (s.length <= 262144) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i)
      if (c > 0x7f && (isInvisible(c) || CONFUSABLES.hasOwnProperty(c))) return "unicode"
    }
  }
  return ""
}

// The mode to open a detected tool in, for what was detected.
function detectMode(toolId, text) {
  var s = String(text || "").trim()
  if (toolId === "base64") return "decode"
  if (toolId === "url") return /^https?:/.test(s) ? "parse" : "decode"
  if (toolId === "yaml") return "to-json"
  if (toolId === "base64img") return "decode"
  if (toolId === "jwt") return "decode"
  return ""
}

// ---------------------------------------------------------------- Dispatch

// state: { input, input2, mode, opts, pattern, flags, replacement, useReplace,
//          count, upper, nowMs, randomBytes, theme }
// A result may carry `job` ({ cmd, payload }): the window runs it through
// bin/devkit-helper and passes the answer to finish().
function run(toolId, state) {
  var input = String(state.input || "")
  var opts = state.opts || {}
  switch (toolId) {
  case "json": return jsonTool(input, state.mode || "pretty2", opts)
  case "yaml": return yamlTool(input, state.mode || "to-yaml")
  case "csv": return csvTool(input, state.mode || "to-csv")
  case "types": return typesTool(input, state.mode || "ts", opts)
  case "xml": return markupTool(input, state.mode || "format", false)
  case "html": return markupTool(input, state.mode || "format", true)
  case "css": return cssTool(input, state.mode || "format")
  case "sql": return sqlTool(input, state.mode || "format", opts)
  case "jwt": return jwtTool(input, state.nowMs, state.mode || "decode", opts)
  case "hash": return hashTool(input, state.mode || "text", opts)
  case "base64": return base64Tool(input, state.mode || "encode")
  case "base64img": return base64imgTool(input, state.mode || "decode")
  case "url": return urlTool(input, state.mode || "encode")
  case "time": return timeTool(input, state.nowMs)
  case "cron": return cronTool(input, state.mode || "local", state.nowMs)
  case "escape": return escapeTool(input, state.mode || "html")
  case "number": return numberTool(input, state.mode || "auto")
  case "unicode": return unicodeTool(input, state.mode || "inspect")
  case "color": return colorTool(input)
  case "lines": return linesTool(input, state.mode || "sort")
  case "stats": return statsTool(input)
  case "markdown": return markdownTool(input, state.mode || "preview", state.theme)
  case "htmlpreview": return htmlPreviewTool(input, state.mode || "preview", state.theme)
  case "qr": return qrTool(input, state.mode || "text", opts)
  case "qrread": return qrreadTool(input)
  case "ids": return idsTool(input, state.nowMs)
  case "lorem": return loremTool(state.mode || "paragraphs", opts)
  case "uuid": return uuidTool(state.mode || "v4", state.count, state.nowMs, state.randomBytes, state.upper)
  case "password": return passwordTool(state, state.randomBytes)
  case "case": return caseTool(input, state.mode)
  case "regex": return regexTool(String(state.pattern || ""), String(state.flags || ""), input, String(state.replacement || ""), !!state.useReplace)
  case "diff": return diffTool(input, String(state.input2 || ""))
  }
  return result()
}
