# DevKit for Omarchy

Thirty-two developer tools in one floating window, one click away on the
Omarchy bar. Decode a JWT and check its signature, repair broken JSON, turn YAML
into JSON or JSON into Go structs, format SQL, hash a download and compare it
with its published checksum, render a QR code, find the invisible character
that breaks a string, or work out when an ID was made. Run tools in a row with
**chains**. Press `Ctrl+K` to find one by name, or right-click the bar icon and
DevKit picks the tool for whatever is on your clipboard.

![DevKit verifying a JWT's signature](preview.png)

Everything runs locally. DevKit makes no network requests and never writes
what you type to disk. Copies use `wl-copy --sensitive`, so decoded secrets
stay out of clipboard history.

**Contents:** [Tools](#tools) · [What's new](#whats-new-in-02) · [Working with DevKit](#working-with-devkit) ·
[Screenshots](#screenshots) · [Requirements](#requirements) · [Cost to the shell](#cost-to-the-shell) · [Install](#install) ·
[Keys](#keys) · [Configure](#configure) · [Update](#update) · [Remove](#remove) ·
[Privacy and security](#privacy-and-security) · [Troubleshooting](#troubleshooting) ·
[Develop](#develop) · [License](#license)

## Tools

**Encode & decode**

| Tool | Key | What it does |
| --- | --- | --- |
| **Base64** | `Ctrl+3` | Encode, decode, URL-safe. Full UTF-8; binary is shown as hex |
| **Base64 Image** | | Image ⇄ `data:` URI. Encodes a copied image or a file and gives you the URI, CSS `url()`, `<img>` and Markdown forms. Decodes a pasted URI to a preview. The type comes from the bytes, so a URI labelled `image/jpeg` holding a PNG is called out |
| **URL** | `Ctrl+4` | Encode/decode components; parse a URL into host, port, path and query params |
| **Escape** | `Ctrl+⇧E` | HTML entities both ways (named, decimal, hex), string escape/unescape for JSON, JS, Go and Rust, and POSIX shell quoting |
| **JWT** | `Ctrl+2` | Header, payload, `iat`/`nbf`/`exp` as dates, EXPIRED badge. **Verifies the signature**: HS256/384/512 with a secret, RS/PS/ES 256/384/512 and EdDSA with a PEM public key or certificate. **Signs** a payload with HS256/384/512. Flags `alg: none` |
| **Hash & HMAC** | `Ctrl+7` | MD5, SHA-1, SHA-224/256/384/512, SHA3-256/512, BLAKE2b/2s and CRC32 of text **or a file**, with an SRI value. Add a key for HMAC. Paste the expected checksum (hex, Base64, SRI or a `sha256sum` line) and it tells you which one matches. Hex, UPPER or Base64 output |
| **Number Base** | `Ctrl+⇧N` | Decimal, hex, octal and binary, exact at any size. Two's complement at 8/16/32/64 bits and the signed reading of a value |
| **Unicode Inspector** | `Ctrl+⇧U` | Every code point with its block, UTF-8 bytes and escapes. Flags invisible characters (zero-width spaces, BOMs, direction overrides), unusual spaces and Latin look-alikes from other scripts (`pаypal` with a Cyrillic `а`). Can escape non-ASCII or strip the invisible characters |

**Format & convert**

| Tool | Key | What it does |
| --- | --- | --- |
| **JSON** | `Ctrl+1` | Format, minify, sort keys, validate with line/column errors. Reads **JSONC and most of JSON5** (comments, trailing commas, single quotes, unquoted keys, `True`/`None`) and hands back strict JSON, saying what it forgave. **Query** with JSONPath or jq-style paths: `.items[0].sku`, `$.items[*].price`, `..email`, `.items[?(@.qty > 1)]` |
| **JSON ⇄ YAML** | `Ctrl+⇧Y` | Both ways. Reads YAML 1.2: block and flow collections, block scalars, anchors, aliases, merge keys (`<<`), multiple documents. `no` stays the string `"no"`, and YAML 1.1 booleans are quoted on the way out |
| **JSON ⇄ CSV** | | Arrays of objects to CSV and back. Delimiter sniffed, `00123` stays a string |
| **JSON → Types** | `Ctrl+⇧T` | **TypeScript, Zod, Go, Rust (serde) and JSON Schema** from a sample. Optional and nullable fields inferred from every array element, identical shapes shared, integers told apart from floats. Go gets its initialisms (`ID`, `APIURL`), Rust its `r#type` and `#[serde(rename)]` |
| **XML** | | Format and minify, with well-formedness errors at line and column |
| **HTML Format** | | Indent or minify. Closes `<li>`/`<p>` the way browsers do and leaves `<pre>` and `<script>` content alone |
| **CSS Format** | | Indent or minify; keeps strings and `/*! licence */` comments |
| **SQL Format** | | Clause-per-line formatting with subqueries, `CASE`, `BETWEEN … AND` and joins; or compact to one line. Upper- or lower-case keywords |

**Text**

| Tool | Key | What it does |
| --- | --- | --- |
| **Case Converter** | `Ctrl+8` | camel, Pascal, snake, SCREAMING, kebab, Train, dot, path, Title… |
| **Lines** | `Ctrl+⇧L` | Natural sort, reverse sort, unique, count (like `sort \| uniq -c \| sort -rn`), reverse and trim |
| **Text Statistics** | | Characters, words, sentences, paragraphs, bytes, longest line, reading and speaking time, most used words. Any script |
| **Text Diff** | `Ctrl+0` | Line diff of two texts |
| **Regex Tester** | `Ctrl+9` | JS regex matches, numbered and named groups, replace with `$1` or `$<name>`. Runs in a separate process with a 1.5 s deadline |
| **Markdown** | `Ctrl+⇧M` | Live GitHub-flavoured preview and Markdown → HTML. Never loads an image |
| **HTML Preview** | | Renders pasted HTML (an email, a template) after removing scripts, styles, event handlers, images and anything that could fetch |

**Time & web**

| Tool | Key | What it does |
| --- | --- | --- |
| **Timestamp** | `Ctrl+5` | Epoch in s/ms/µs/ns ⇄ ISO, local, RFC 2822, relative. Empty input shows a live "now" |
| **Cron** | `Ctrl+⇧R` | Explains a 5-field cron expression in plain English and lists the next 10 runs, in local time or UTC |
| **Color** | `Ctrl+⇧O` | HEX, RGB, HSL, HSV, OKLCH, Hyprland `rgba(…)`, Qt `#AARRGGBB` and CSS names, with a swatch and WCAG contrast |
| **QR Code** | `Ctrl+⇧Q` | Text, a URL or **Wi-Fi details** (network, password, security) as a QR code. Four error-correction levels. Copy it as an image or save it to Pictures |
| **QR Reader** | | Reads QR codes and barcodes from a copied image (a screenshot of a slide works) or an image file. Wi-Fi codes are spelled out |

**Generate & inspect**

| Tool | Key | What it does |
| --- | --- | --- |
| **UUID & ULID** | `Ctrl+6` | v4, v7 and ULID, up to 500 at a time. CSPRNG bytes only |
| **Passwords & Tokens** | `Ctrl+⇧P` | Passwords with chosen character sets and exclusions, plus alphanumeric, hex, Base64URL and PIN tokens. CSPRNG only, with the entropy shown and weak results flagged |
| **Lorem Ipsum** | | Paragraphs, sentences or words |
| **ID Inspector** | `Ctrl+⇧I` | What an ID is and when it was made: UUID (v1–v8, with the time for v1/v6/v7), ULID, KSUID, MongoDB ObjectId, XID, Snowflake (Twitter/X and Discord), CUID and Nano ID. One per line |

## What's new in 0.2

- **0.3.0: nothing heavy on the shell's thread.** Every tool now runs on a
  worker thread. Before, formatting or detecting a large document ran on the
  shell's UI thread, and the bar, notifications and the rest of the desktop
  shell stood still until it finished (up to a second for a 1 MB document).
  The output box shows the first 128 KiB of a larger result; Copy and
  → Input still use all of it.

- **0.2.1: nothing loaded while closed.** The shell builds DevKit when you
  open it and frees it five minutes after you close it. Before, it held
  about 15–20 MB of shell memory from login on, even if you never opened it.
  Closed, it now costs only its bar icon. The first open after an unload
  takes about 0.2 s; reopening within five minutes is instant and your input
  is still there.

- 14 new tools: Base64 Image, Unicode Inspector, JSON ⇄ YAML (now both ways),
  JSON ⇄ CSV as its own tool, XML, HTML, CSS and SQL formatters, Text
  Statistics, HTML Preview, QR Code, QR Reader, Lorem Ipsum and ID Inspector.
- Deeper tools: JSONC/JSON5 repair and JSON queries; JWT signature
  verification (HS, RS, PS, ES, EdDSA) and signing; SHA-224/384, SHA3,
  BLAKE2, CRC32, HMAC, file hashing and checksum comparison; Zod, Go, Rust
  and JSON Schema types; tokens and PINs.
- A new window: `Ctrl+K` search, sections, pinned and recent tools, chains,
  session history, hand-offs between tools, copied-image detection, `F1`.
- Payloads written for 0.1 keep working.

## Working with DevKit

- **Find a tool.** `Ctrl+K` and type: names, keywords and descriptions all
  match (`sha256`, `yaml`, `snowflake`, `checksum`). `↑`/`↓` and `Enter` opens
  it with the cursor in its input.
- **Pin what you use.** Right-click a tool, or click its ☆, or press `Ctrl+B`.
  Pinned tools sit at the top of the list; the last few you used follow them.
- **Samples.** Every tool that takes input has a **Sample** button
  (`Ctrl+⇧S`): a signed JWT with its secret, a CI file with anchors, a SQL
  query, an HTML email with a tracking pixel. Press it again to get your own
  input back.
- **The clipboard.** When DevKit opens, it looks at the clipboard. JSON, a JWT,
  YAML, XML, SQL, a URL, a UUID, a colour, a cron line, text with invisible
  characters and more each get a banner offering the right tool (`Ctrl+D`). A
  copied image gets **Read QR code** and **Encode as data: URI**.
- **Hand-offs.** When an output looks like something another tool reads (Base64
  that decodes to JSON, a JWT payload), a **→ JSON** button sends it on.
  `Ctrl+↵` feeds the output back in as input.
- **Chains.** A chain runs your input through several tools in a row, for
  example *URL decode → Base64 decode → JSON format → query*, and shows each
  step's result. **⛓ Chain** on any tool starts one from where you are. Four
  come built in (URL param → JSON, Base64 → JSON, JWT claims → YAML, extract
  unique emails); edit, rename, duplicate or delete them, and add your own.
  Regex steps run in the same deadline-bound worker as the Regex Tester.
- **History** (`Ctrl+H`). What you worked on this session, newest first; click
  an entry to pick up where you left off. History lives in memory only and
  goes when DevKit unloads, five minutes after you close it.
- **All keys:** `F1`.

## Screenshots

| | |
| --- | --- |
| **JSON**: JSONC repaired to strict JSON<br>![JSON](screenshots/01-json.png) | **JWT**: signature verified<br>![JWT](screenshots/02-jwt.png) |
| **YAML → JSON**: anchors and merge keys<br>![YAML](screenshots/03-yaml.png) | **JSON → Go** structs<br>![Types](screenshots/04-types.png) |
| **Hash** compared with an expected checksum<br>![Hash](screenshots/05-hash.png) | **QR code**<br>![QR](screenshots/06-qr.png) |
| **Unicode**: a look-alike and a zero-width space<br>![Unicode](screenshots/07-unicode.png) | **ID Inspector**<br>![IDs](screenshots/08-ids.png) |
| **Chain**: extract unique emails<br>![Chains](screenshots/09-chains.png) | **SQL** formatted<br>![SQL](screenshots/10-sql.png) |
| **HTML preview**, sanitised<br>![HTML preview](screenshots/11-html-preview.png) | **Base64 Image**: image → data: URI<br>![Base64 image](screenshots/12-base64-image.png) |
| **Regex** replace with named groups<br>![Regex](screenshots/13-regex.png) | **Text diff**<br>![Diff](screenshots/14-diff.png) |
| **Cron** with its next runs<br>![Cron](screenshots/15-cron.png) | **Color** with contrast<br>![Color](screenshots/16-color.png) |
| **Markdown** preview<br>![Markdown](screenshots/17-markdown.png) | **Passwords & tokens**<br>![Password](screenshots/18-password.png) |
| **Search** (`Ctrl+K`)<br>![Search](screenshots/19-search.png) | **Every key** (`F1`)<br>![Help](screenshots/20-help.png) |

## Requirements

- **Omarchy 4** (the Quickshell-based `omarchy-shell`), with Hyprland using its
  Lua config (the Omarchy 4 default).
- Nothing else to install: a default Omarchy has every package DevKit uses.

  | Package | Comes with | Used for |
  | --- | --- | --- |
  | `python` (`python3`) | `uwsm` | The helpers in `bin/`: hashing and CSPRNG bytes, the bounded clipboard reader, the regex deadline, and `devkit-helper` (JWT signatures, images, QR codes) |
  | `qt6-declarative` | `quickshell` | Its `qml` runtime runs the regex and chain worker outside the shell |
  | `wl-clipboard` | Omarchy | `wl-paste` and `wl-copy --sensitive` |
  | `openssl` | Arch base | Verifying RS/PS/ES/EdDSA JWT signatures |
  | `jq`, `hyprland` | Omarchy | `bin/devkit-window` registers the rule that floats and centres the window |
  | `qrencode` | Omarchy | **QR Code** |
  | `zbar` (`zbarimg`) | Omarchy | **QR Reader** |

  If you removed `qrencode` or `zbar`, the QR tool says so in place and
  everything else keeps working.

There is nothing to build and no network access.

## Cost to the shell

DevKit runs inside `omarchy-shell`, next to the bar, notifications and the
lock screen, so it is built to cost nothing until you use it. Measured on
Omarchy 4 (the shell's resident memory):

| | Shell memory |
| --- | --- |
| DevKit disabled | 479 MB |
| DevKit enabled, closed | 480 MB, the same |
| DevKit open | about 42 MB more, freed five minutes after you close it |

- **Loaded only while you use it.** The shell builds DevKit when you open it
  (about 0.2 s) and frees it five minutes after you close it. Reopen within
  those five minutes and it is instant, with your input still there.
- **Nothing heavy on the shell's thread.** Tools run on a worker thread, so
  formatting a 1 MB document doesn't stall the bar. What's left on the
  shell's thread is drawing the text: about 0.5 ms per KiB you paste, once.
  The output box shows the first 128 KiB of a larger result.
- **No polling.** Closed, DevKit polls nothing and runs no processes. Open,
  it ticks only to keep the Timestamp, Cron, JWT and ID tools' times current.

## Install

```bash
omarchy plugin add https://github.com/Coding-Sparrow/omarchy-devkit.git --enable
```

DevKit is also listed on the [Omarchy plugin marketplace](https://omarchyplugins.com)
under Developer Tools.

This clones the repo into `~/.config/omarchy/plugins/coding-sparrow.devkit/`,
enables it, and puts the `` icon on the right side of the bar. Without
`--enable` the plugin installs disabled so you can read the code first; enable
it later with `omarchy plugin enable coding-sparrow.devkit`.

- **Left-click** the bar icon to open or close DevKit.
- **Right-click** it to open DevKit on the clipboard, in the matching tool.
- **`Esc`** closes it (or clears the search first).

## Keys

| Key | Action |
| --- | --- |
| `Ctrl+K` | Search tools (`↑` `↓` `Enter`) |
| `Ctrl+1…0`, `Ctrl+⇧…` | Jump to a tool (shown next to it in the list) |
| `Ctrl+Tab` / `Ctrl+⇧Tab` | Next / previous tool |
| `Ctrl+⇧V` | Paste into the input (in the image tools: read the clipboard's image) |
| `Ctrl+⇧C` | Copy the output |
| `Ctrl+↵` | Output → input; generate again in the generators |
| `Ctrl+⇧S` | Load the sample, or put your input back |
| `Ctrl+D` | Load the clipboard suggestion |
| `Ctrl+B` | Pin or unpin the current tool |
| `Ctrl+L` | Clear the input |
| `Ctrl+H` | History |
| `F1` | Every shortcut |
| `Esc` | Close |

Click any row of a result list (hashes, cases, colours, claims, IDs) to copy
that value.

## Configure

The window follows your Omarchy theme and font.

**Window size.** DevKit opens at 66% of the width and 74% of the height of the
focused monitor, never smaller than 860×520. To use a different share, pass
`width` and `height` (0.3 to 1) when opening it; the choice lasts until
DevKit unloads, so put it in the keybinding:

```lua
o.bind("SUPER + ALT + D", "DevKit", "omarchy-shell shell summon coding-sparrow.devkit '{\"action\":\"toggle\",\"width\":0.8,\"height\":0.85}'")
```

**Move or hide the bar icon:**

```bash
omarchy bar move coding-sparrow.devkit --after omarchy.clock
omarchy bar move coding-sparrow.devkit --section left
```

To keep DevKit but drop the icon, remove the widget in Setup > Bar.

**Add a keybinding.** Plugins can't register shortcuts themselves, so add one to
`~/.config/hypr/bindings.lua` (check yours are free with
`omarchy menu keybindings --print`):

```lua
o.bind("SUPER + ALT + D", "DevKit", "omarchy-shell shell summon coding-sparrow.devkit '{\"action\":\"toggle\"}'")
```

`{"action":"toggle"}` opens DevKit or closes it the way `Esc` does, keeping
your input for the next five minutes. `omarchy-shell shell toggle
coding-sparrow.devkit` works too, but its close frees DevKit at once and your
input goes with it.

**Open a specific tool or pass input** from a keybinding or script:

```bash
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"uuid","mode":"v7"}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"json","input":"{\"a\":[1,2]}","query":".a[0]"}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"yaml","mode":"to-json","sample":true}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"regex","pattern":"(\\d+)","input":"a1 b22"}'
omarchy-shell shell summon coding-sparrow.devkit '{"action":"clipboard"}'
```

Payload fields: `tool` (any id below), `mode`, `input`, `input2` (the diff's
second text), `query` (JSON), `pattern`, `flags`, `replacement` (regex),
`length` and `count` (passwords, UUIDs), `width` and `height`, `sample: true`
and `action` (`"clipboard"` or `"toggle"`). Payloads written for 0.1 (`{"tool":"json","mode":"yaml"}`)
still land in the right tool.

Tool ids: `base64`, `base64img`, `url`, `escape`, `jwt`, `hash`, `number`,
`unicode`, `json`, `yaml`, `csv`, `types`, `xml`, `html`, `css`, `sql`, `case`,
`lines`, `stats`, `diff`, `regex`, `markdown`, `htmlpreview`, `time`, `cron`,
`color`, `qr`, `qrread`, `uuid`, `password`, `lorem`, `ids`, `chains`, `history`.

## Update

```bash
omarchy plugin update coding-sparrow.devkit
omarchy restart shell
```

The shell caches DevKit's code once it has loaded it, so restart the shell to
run the new version.

## Remove

```bash
omarchy plugin remove coding-sparrow.devkit
```

This disables the plugin, removes its icon and deletes
`~/.config/omarchy/plugins/coding-sparrow.devkit/`. Two things are yours and
left in place:

```bash
rm ~/.local/state/omarchy/devkit.json          # pinned and recent tools, saved chains
rm -r "$XDG_RUNTIME_DIR/coding-sparrow-devkit" # last few QR/decoded images (gone at logout anyway)
```

If you added a keybinding, delete it from `~/.config/hypr/bindings.lua`.

## Privacy and security

- **No network.** DevKit never makes a request. Previews never load images; links
  open in your browser only when you click one.
- **What touches the disk.** `~/.local/state/omarchy/devkit.json` (mode 0600)
  holds the shape of your workspace: pinned and recent tool ids and saved
  chains (tool, mode, options). Never your input, output, secrets or history.
  Pictures DevKit makes or reads (QR codes, decoded `data:` URIs, a copied
  screenshot) go to `$XDG_RUNTIME_DIR/coding-sparrow-devkit/` (0700, files
  0600, the newest dozen kept), which is in memory and cleared at logout.
  **Save** in the image tools writes to your Pictures folder only when you press it.
- **History is memory only**, gone five minutes after you close DevKit, and leaves out secrets (JWT secrets, HMAC keys).
- **Bounded clipboard reads.** `bin/devkit-clip` reads at most 1 MiB within 2 s
  and kills `wl-paste` either way. Partial data is never used. Images are read
  by `bin/devkit-helper` with a 16 MiB cap.
- **User regexes never run in the shell.** The Regex Tester and any chain with a
  regex step run in a separate `qml` process (same engine, same `Tools.js`),
  killed after 1.5 s, so `(a+)+$` cannot freeze the desktop shell.
- **No tool runs on the shell's UI thread.** The bar, notifications and the
  lock screen share a thread with every Omarchy plugin. DevKit's tools,
  chains and clipboard detection run on a Qt worker thread
  (`ToolWorker.js`), so a 1 MB document being formatted never holds them
  up. Work there is linear or near it and size-capped; `tests/perf-cases.js`
  holds over a hundred worst cases, run in node and in Qt's own V4 engine,
  and `tests/worker-v4.qml` fails if the UI thread stalls 50 ms while the
  worker runs the heaviest of them. What remains on the UI thread is drawing
  the text: the output box shows at most 128 KiB (Copy takes all of it), and
  pasting a very large input costs Qt about 0.5 ms per KiB to lay out, once.
- **Secure randomness only.** UUIDs, passwords and tokens use bytes from Python's
  `secrets`, drawn with rejection sampling. There is no `Math.random()`
  fallback. (Lorem ipsum, which is not a secret, uses a seeded generator.)
- **Signatures are checked properly.** HMAC comparison is constant-time
  (`hmac.compare_digest`); public-key signatures are verified by `openssl`.
  Secret fields are masked until you press **show**.
- **Secrets stay out of argv.** Everything sent to a helper (text to hash, JWT
  keys, clipboard writes, regex requests) goes over stdin or into an owner-only
  file, never onto a command line where `/proc/<pid>/cmdline` would expose it.
- **Clipboard hygiene.** Text copies use `wl-copy --sensitive`.
- **No rich-text injection.** Labels render as plain text. The Markdown and HTML
  previews are built from escaped text and a short allow-list of tags with no
  attributes beyond safe links, alignment and spans.
- **No config changes.** DevKit never edits your files. The only thing it
  registers is a runtime Hyprland window rule (`hyprctl eval`) matching a
  Quickshell window titled `DevKit`.

Processes DevKit runs: `bin/devkit-clip` (`wl-paste`), `wl-copy`,
`bin/devkit-hash` (CSPRNG bytes), `bin/devkit-helper` (hashes; `openssl` for
JWTs; `qrencode`, `zbarimg`, `wl-paste`/`wl-copy` for images),
`bin/devkit-regex` (`qml` with `bin/devkit-regex-worker.qml`),
`bin/devkit-window` (`hyprctl`, `jq`), and your browser when you click a link.

## Troubleshooting

- **"qrencode is not installed" / "zbarimg is not installed".** Install the
  `qrencode` or `zbar` package.
- **JWT says "Could not read that key".** Paste the public key as PEM
  (`-----BEGIN PUBLIC KEY-----…`) or a certificate. A key pasted on one line is
  fine. JWKs are not read; convert them to PEM first.
- **JSON says "Not strict JSON".** The input had comments, trailing commas or
  similar. DevKit read it anyway and the output is strict JSON; the message
  names the first thing a strict parser would reject.
- **Regex says "possible false negative".** Qt's regex engine stops after a
  fixed backtracking budget and reports no match. Simplify the pattern to confirm.
- **Regex says "Stopped after 1.5 s".** The pattern was too slow on this text.
- **The window opens tiled.** The window rule needs Hyprland's Lua config:
  `hyprctl -j status | jq -r .configProvider` should print `lua`.
- **The icon doesn't appear.** `omarchy plugin list`, then
  `omarchy plugin enable coding-sparrow.devkit`.
- **Cron says "Quartz" or "seconds field".** DevKit reads the standard 5-field
  format (crontab, Kubernetes, GitHub Actions); drop the seconds field.
- **Changes don't show after an update.** `omarchy restart shell`.
- **The bar ignores clicks right after a restart.** The shell loads its
  plugins for a few seconds after `omarchy restart shell`; wait for it.
- **The bar or the whole shell freezes.** Please
  [open an issue](https://github.com/Coding-Sparrow/omarchy-devkit/issues)
  with the trace from a core dump, taken before restarting:

  ```bash
  kill -ABRT "$(pgrep -xf 'quickshell -n -p /usr/share/omarchy/shell')"
  coredumpctl info quickshell | head -80
  ```

  The shell restarts itself afterwards.

## Develop

Keep a checkout wherever you like and symlink it to
`~/.config/omarchy/plugins/coding-sparrow.devkit`. Then:

```bash
omarchy plugin enable coding-sparrow.devkit
tests/run                    # logic, worst-case timing in node and Qt's V4, the worker, helpers (needs node)
omarchy restart shell        # load QML edits
```

- `Tools.js`: every tool as pure functions, plus the registry (`TOOLS`) the
  window renders from. Loaded by QML, by the tool worker, by the regex/chain worker and by the node
  tests. A tool declares its modes and options there; most need no QML at all.
- `DevKit.qml`: the window and its state. `ui/`: the sidebar, chain editor,
  history, help card and shared components.
- `ToolWorker.js`: runs `Tools.js` on Qt's worker thread. `DevKit.qml` sends
  every computation there (`askWorker`) and keeps only the newest answer per
  kind of request, so the shell's UI thread only posts and draws.
- `bin/`: the helpers. Anything that needs a process (hashing, signatures,
  images, QR codes, regexes) runs there and answers in one JSON line.

## License

[MIT](LICENSE) © Coding-Sparrow
