# DevKit for Omarchy

The developer tools you reach for every day, one click away on the Omarchy bar:
JSON (and JSON to YAML, TypeScript or CSV), JWT, Base64, URL, escaping,
timestamps, cron, UUIDs and ULIDs, passwords, hashes, colours, number bases,
case conversion, regex, line tools, text diff and a Markdown preview. Every tool
has a **Sample** button, so you can see what it does before you paste anything. It opens as a floating window. Do the job, press `Esc`, and
you're back.

![DevKit decoding a JWT](preview.png)

Everything runs locally inside `omarchy-shell`. DevKit makes no network requests
and writes nothing to disk. Copies use `wl-copy --sensitive`, so decoded
secrets stay out of clipboard history.

**Contents:** [Tools](#tools) · [Screenshots](#screenshots) · [Requirements](#requirements) ·
[Install](#install) · [Usage](#usage) · [Configure](#configure) · [Update](#update) ·
[Remove](#remove) · [Privacy and security](#privacy-and-security) ·
[Troubleshooting](#troubleshooting) · [Develop](#develop) · [License](#license)

## Tools

| Key | Tool | What it does |
| --- | --- | --- |
| `Ctrl+1` | **JSON** | Format (2/4 spaces), minify, sort keys, validate with line/column errors. Convert to YAML (quotes `yes`/`no`/`on` so YAML 1.1 readers don't turn them into booleans), TypeScript interfaces (optional and nullable fields inferred from every array element, identical shapes shared), and CSV both ways (delimiter sniffed, `00123` stays a string) |
| `Ctrl+2` | **JWT Decoder** | Header, payload, `iat`/`nbf`/`exp` as dates, EXPIRED badge. The signature is *not* verified |
| `Ctrl+3` | **Base64** | Encode, decode, URL-safe. Full UTF-8; binary is shown as hex |
| `Ctrl+4` | **URL** | Encode/decode components; parse a URL into host, port, path and query params |
| `Ctrl+5` | **Timestamp** | Epoch in s/ms/µs/ns ⇄ ISO, local, RFC 2822, relative. Empty input shows a live "now" |
| `Ctrl+6` | **UUID** | v4, v7 and ULID, up to 500 at a time, optional uppercase. Only CSPRNG bytes (Python `secrets`), never `Math.random()`. A ULID batch is sorted, and every ULID has its own random bits |
| `Ctrl+7` | **Hash** | MD5, SHA-1, SHA-256, SHA-512 |
| `Ctrl+8` | **Case Converter** | camel, Pascal, snake, SCREAMING, kebab, Train, dot, path, Title… |
| `Ctrl+9` | **Regex Tester** | JS regex matches, numbered and named groups, replace with `$1` or `$<name>`. Runs in a separate process with a 1.5 s deadline |
| `Ctrl+0` | **Text Diff** | Line diff of two texts |
| `Ctrl+⇧P` | **Password Generator** | Length, count, upper/lower/digits/special sets and a comma-separated exclude list. CSPRNG-only, one character from each selected set. The letter sets skip `I`/`l`. Results under 60 bits are flagged as weak |
| `Ctrl+⇧R` | **Cron** | Explains a 5-field cron expression in plain English and lists the next 10 runs, in local time or UTC. Names (`MON-FRI`, `JAN`), steps, ranges, `@daily`-style macros and pasted crontab lines. Presets to start from |
| `Ctrl+⇧E` | **Escape** | HTML entities both ways (named, decimal, hex), string escape/unescape for JSON, JS, Go and Rust (`\n`, `\u{1F600}`, `\x41`…), and POSIX shell quoting |
| `Ctrl+⇧N` | **Number Base** | Decimal, hex, octal and binary, exact at any size (a 256-bit hash converts digit for digit). Two's complement at 8/16/32/64 bits, the signed reading of a value, and its Unicode character |
| `Ctrl+⇧O` | **Color** | HEX, RGB, HSL, HSV, OKLCH, Hyprland `rgba(…)`, Qt/Android `#AARRGGBB` and CSS names, both ways. Live swatch with alpha, and WCAG contrast on white and black |
| `Ctrl+⇧L` | **Lines** | Natural sort (`file2` before `file10`), reverse sort, unique, count (like `sort \| uniq -c \| sort -rn`), reverse and trim. Always shows lines, unique lines, words, characters and bytes |
| `Ctrl+⇧M` | **Markdown** | Live GitHub-flavoured preview (headings, lists, task lists, tables with alignment, code, quotes, links) and Markdown → HTML. Raw HTML is shown as text and images are never loaded, so previewing a pasted README makes no network request. Links open in your browser only when clicked |

## Screenshots

| | |
| --- | --- |
| **JSON**, formatted and validated<br>![JSON](screenshots/01-json.png) | **JWT**, decoded with time claims<br>![JWT](screenshots/02-jwt.png) |
| **Base64** decode<br>![Base64](screenshots/03-base64.png) | **URL**, parsed into parts and query params<br>![URL](screenshots/04-url.png) |
| **Timestamp**, click a row to copy<br>![Timestamp](screenshots/05-timestamp.png) | **UUID** v7, bulk<br>![UUID](screenshots/06-uuid.png) |
| **Hash**<br>![Hash](screenshots/07-hash.png) | **Case converter**<br>![Case](screenshots/08-case.png) |
| **Regex tester** with named groups<br>![Regex](screenshots/09-regex.png) | **Text diff**<br>![Diff](screenshots/10-diff.png) |
| **Password generator**<br>![Password](screenshots/11-password.png) | **Cron**, explained with its next runs<br>![Cron](screenshots/12-cron.png) |
| **Color**, every format plus contrast<br>![Color](screenshots/13-color.png) | **JSON → TypeScript**<br>![JSON to TypeScript](screenshots/14-json-ts.png) |
| **Number base**, exact with two's complement<br>![Number base](screenshots/15-number.png) | **Lines**, counting repeated log lines<br>![Lines](screenshots/16-lines.png) |
| **Markdown**, live preview<br>![Markdown](screenshots/17-markdown.png) | **Escape**, decoding HTML entities<br>![Escape](screenshots/18-escape.png) |

## Requirements

- **Omarchy 4** (the Quickshell-based `omarchy-shell`), with Hyprland using its
  Lua config (the Omarchy 4 default).
- Runtime tools, all installed by default on Omarchy:

  | Package | Used for |
  | --- | --- |
  | `python` (`python3`) | `bin/devkit-hash` (hashes, and CSPRNG bytes for UUIDs and passwords), `bin/devkit-clip` (bounded clipboard read), `bin/devkit-regex` (regex deadline) |
  | `qt6-declarative` | Its `qml` runtime runs the regex worker (`bin/devkit-regex-worker.qml`) outside the shell. Quickshell depends on it |
  | `wl-clipboard` | `wl-paste` to read the clipboard, `wl-copy --sensitive` to copy results |
  | `jq` | `bin/devkit-window` reads `hyprctl -j status` |
  | `hyprland` | `hyprctl eval` registers the window rule that floats and centers the window |

There are no other dependencies, nothing to build, and no network access.

## Install

```bash
omarchy plugin add https://github.com/Coding-Sparrow/omarchy-devkit.git --enable
```

This clones the repo into `~/.config/omarchy/plugins/coding-sparrow.devkit/`,
enables it, and puts the `` icon on the right side of the bar. Without
`--enable`, the plugin installs disabled so you can read the code first. Enable
it later with:

```bash
omarchy plugin enable coding-sparrow.devkit
```

## Usage

- **Left-click** the bar icon to open or close DevKit.
- **Right-click** it to open DevKit and load the clipboard straight into the
  matching tool.
- Press **`Esc`** to close.

When DevKit opens, it checks the clipboard. If the content looks like a JWT,
JSON, Base64, a URL, a timestamp, a cron expression, a colour or a `0x`/`0b`
number, a banner offers to load it (`Ctrl+D`).
Click any row in the Hash, Case or Timestamp output to copy that value.

**Sample** (`Ctrl+Shift+S`) loads an example for the current tool and mode: a
signed JWT, a CSV file, a crontab line, a Markdown page and so on. Press it
again (**Undo sample**) to get your own input back.

| Key | Action |
| --- | --- |
| `Ctrl+1…0` | Switch tool |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tool |
| `Ctrl+Shift+P` | Jump to the Password Generator |
| `Ctrl+Shift+R` | Jump to Cron |
| `Ctrl+Shift+E` / `N` / `O` / `L` / `M` | Jump to Escape / Number Base / Color / Lines / Markdown |
| `Ctrl+Shift+S` | Load the sample, or put your input back |
| `Ctrl+Shift+V` | Paste the clipboard into the input |
| `Ctrl+Shift+C` | Copy the output |
| `Ctrl+Enter` | Make the output the input (chain, e.g. Base64 → JSON); regenerate in UUID and Password |
| `Ctrl+L` | Clear |
| `Ctrl+D` | Load the clipboard suggestion |
| `Esc` | Close |

Each tool remembers its input until the shell restarts. Inputs are never saved.

## Configure

DevKit has no settings file. The window follows your Omarchy theme and font.

**Window size.** DevKit opens at 62% of the width and 70% of the height of the
focused monitor (about 1590×1010 on a 1440p screen, 1190×760 on 1080p), and
never smaller than 760×480. To use a different share, pass `width` and
`height` (0.3 to 1) when opening it, for example from your keybinding. The
choice lasts until the shell restarts:

```lua
o.bind("SUPER + ALT + D", "DevKit", "omarchy-shell shell summon coding-sparrow.devkit '{\"width\":0.8,\"height\":0.85}'")
```

**Move the bar icon:**

```bash
omarchy bar move coding-sparrow.devkit --after omarchy.clock
omarchy bar move coding-sparrow.devkit --section left
```

**Hide the bar icon but keep DevKit** (for example, to use only a keybinding):
remove the widget in Setup > Bar, or delete the `{ "id": "coding-sparrow.devkit" }`
entry from `bar.layout` in `~/.config/omarchy/shell.json`. The keybinding and
commands below keep working.

**Add a keybinding.** Plugins can't register shortcuts themselves, so add one to
`~/.config/hypr/bindings.lua`. `Super+Alt+D` was free on Omarchy 4.0.4 at the
time of writing, but check your own first with
`omarchy menu keybindings --print`:

```lua
o.bind("SUPER + ALT + D", "DevKit", "omarchy-shell shell toggle coding-sparrow.devkit")
```

**Open a specific tool or pass input** from a keybinding or script:

```bash
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"uuid","mode":"v7"}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"json","input":"{\"a\":1}"}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"regex","pattern":"(\\d+)","input":"a1 b22"}'
omarchy-shell shell summon coding-sparrow.devkit '{"action":"clipboard"}'
```

Payload fields: `tool` (`json`, `jwt`, `base64`, `url`, `time`, `uuid`,
`password`, `hash`, `case`, `regex`, `diff`, `cron`, `escape`, `number`,
`color`, `lines`, `markdown`), `mode` (for example `minify`, `yaml`, `ts`, `decode`,
`parse`, `v7`, `ulid`, `utc`, `shell` or `count`), `input`, `input2` (the diff's second text),
`pattern`, `flags`, `replacement`, `length` (password length), `count` (UUIDs
or passwords), `width` and `height` (window size as a share of the monitor),
`sample: true` (load the tool's sample), and
`action: "clipboard"`.

## Update

```bash
omarchy plugin update coding-sparrow.devkit
omarchy restart shell
```

DevKit keeps its window loaded between opens, so the running shell picks up new
code only after a restart.

## Remove

```bash
omarchy plugin remove coding-sparrow.devkit
```

This disables the plugin, removes its icon from the bar, and deletes
`~/.config/omarchy/plugins/coding-sparrow.devkit/`.

DevKit leaves nothing else behind: it creates no config, cache or state files.
Its Hyprland window rule exists only in memory and is gone after the next
Hyprland reload or login. If you added the keybinding above, delete that line
from `~/.config/hypr/bindings.lua` yourself.

## Privacy and security

- **No network.** DevKit never makes a request.
- **Nothing on disk.** Inputs live in memory only and are gone when the shell
  restarts.
- **Bounded clipboard reads.** `bin/devkit-clip` reads at most 1 MiB and
  gives up after 2 s, killing `wl-paste` either way. A larger or stalled
  clipboard is refused with a message, and partial data is never used.
- **Regexes never run in the shell.** Your pattern runs in a separate `qml`
  process (the same V4 engine and `Tools.js`, so results are identical). It is
  killed after 1.5 s, so a catastrophic pattern such as `(a+)+$` cannot freeze
  the desktop shell. Everything else is linear-time or near it, and
  size-capped. `tests/perf-cases.js` holds the worst cases, which run in both
  node and Qt's own V4 engine.
- **UUIDs and passwords use only secure randomness.** Every byte comes from
  Python's `secrets`. If the pool runs short, generation waits for more bytes.
  There is no `Math.random()` fallback. Passwords draw with rejection sampling
  so every character in a selected set is equally likely.
- **No config changes.** DevKit never edits your files. The only thing it
  registers is a runtime Hyprland window rule (`hyprctl eval`), which matches
  only a Quickshell window titled `DevKit`.
- **Secrets stay out of argv.** Text sent for hashing, to the clipboard, or to
  the regex worker goes over stdin, never on a command line where
  `/proc/<pid>/cmdline` would expose it. The worker gets the regex request in
  a file inside a fresh owner-only (`0700`) directory under `$XDG_RUNTIME_DIR`,
  which is deleted as soon as it finishes.
- **Clipboard hygiene.** Every copy uses `wl-copy --sensitive`.
- **No rich-text injection.** Every label renders as plain text, so markup in a
  pasted value (for example `<img src="file:///…">` in a JWT claim) shows up as
  literal text.
- **Markdown never reaches the network.** DevKit renders Markdown itself
  instead of using Qt's built-in support, which would load remote images and
  interpret raw HTML. All text is escaped, images become `[image: alt]`, and
  only `http(s)` and `mailto` links open, and only when you click one.
- **JWT signatures are not verified.** That needs the signing key, and the
  decoder says so on screen.

Processes DevKit runs: `bin/devkit-clip` (which runs `wl-paste`), `wl-copy`,
`bin/devkit-hash`, `bin/devkit-regex` (which runs `qml` with
`bin/devkit-regex-worker.qml`), `bin/devkit-window` (`hyprctl`, `jq`), and,
only when you click a link in the Markdown preview, your default browser. All
tool logic is plain JavaScript in `Tools.js`.

## Troubleshooting

- **Regex says "possible false negative".** Qt's regex engine stops after a
  fixed backtracking budget and reports "no match" instead of an error. When a
  pattern with nested quantifiers (such as `(a+)+` or `(.*a){20}`) finds
  nothing, DevKit says the result may be wrong. Simplify the pattern to confirm.
- **Regex says "Stopped after 1.5 s".** The pattern was too slow on this text
  and the worker was killed. Make the pattern more specific.
- **The window opens tiled instead of floating.** The window rule needs
  Hyprland's Lua config. Check it with
  `hyprctl -j status | jq -r .configProvider`, which should print `lua`.
- **The icon doesn't appear.** Make sure the plugin is enabled with
  `omarchy plugin list`, then run `omarchy plugin enable coding-sparrow.devkit`.
- **Cron says "Quartz" or "seconds field".** DevKit reads the standard 5-field
  format used by crontab, Kubernetes and GitHub Actions. Quartz and Spring add
  a seconds field and `L`/`W`/`#`, which aren't supported. Drop the seconds
  field to check the rest.
- **Cron times look off by hours.** GitHub Actions and most cloud schedulers
  run cron in UTC. Switch to **UTC** to see their times.
- **Changes don't show after an update.** Run `omarchy restart shell`.

## Develop

Keep a checkout of this repository wherever you like, and symlink it to
`~/.config/omarchy/plugins/coding-sparrow.devkit` in place of an installed
copy. Then:

```bash
omarchy plugin enable coding-sparrow.devkit
tests/run                    # tool logic, worst-case timing in node and Qt's V4, and helpers (needs node)
omarchy restart shell        # load QML edits
```

`Tools.js` holds all the logic as pure functions, loaded by both QML and the node
tests. `DevKit.qml` is the window, `BarWidget.qml` is the bar icon, and `bin/`
contains the hash/random helper and the Hyprland window-rule script.

## License

[MIT](LICENSE) © Coding-Sparrow
