# DevKit for Omarchy

The developer tools you reach for every day, one click away on the Omarchy bar:
JSON, JWT, Base64, URL, timestamps, UUIDs, hashes, case conversion, regex and
text diff. It opens as a floating window. Do the job, press `Esc`, and you're back.

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
| `Ctrl+1` | **JSON** | Format (2/4 spaces), minify, sort keys, validate with line/column errors |
| `Ctrl+2` | **JWT Decoder** | Header, payload, `iat`/`nbf`/`exp` as dates, EXPIRED badge. The signature is *not* verified |
| `Ctrl+3` | **Base64** | Encode, decode, URL-safe. Full UTF-8; binary is shown as hex |
| `Ctrl+4` | **URL** | Encode/decode components; parse a URL into host, port, path and query params |
| `Ctrl+5` | **Timestamp** | Epoch in s/ms/µs/ns ⇄ ISO, local, RFC 2822, relative. Empty input shows a live "now" |
| `Ctrl+6` | **UUID** | v4 and v7, in bulk, optional uppercase. Uses a CSPRNG (Python `secrets`) |
| `Ctrl+7` | **Hash** | MD5, SHA-1, SHA-256, SHA-512 |
| `Ctrl+8` | **Case Converter** | camel, Pascal, snake, SCREAMING, kebab, Train, dot, path, Title… |
| `Ctrl+9` | **Regex Tester** | JS regex matches, numbered and named groups, replace with `$1` or `$<name>` |
| `Ctrl+0` | **Text Diff** | Line diff of two texts |

## Screenshots

| | |
| --- | --- |
| **JSON**, formatted and validated<br>![JSON](screenshots/01-json.png) | **JWT**, decoded with time claims<br>![JWT](screenshots/02-jwt.png) |
| **Base64** decode<br>![Base64](screenshots/03-base64.png) | **URL**, parsed into parts and query params<br>![URL](screenshots/04-url.png) |
| **Timestamp**, click a row to copy<br>![Timestamp](screenshots/05-timestamp.png) | **UUID** v7, bulk<br>![UUID](screenshots/06-uuid.png) |
| **Hash**<br>![Hash](screenshots/07-hash.png) | **Case converter**<br>![Case](screenshots/08-case.png) |
| **Regex tester** with named groups<br>![Regex](screenshots/09-regex.png) | **Text diff**<br>![Diff](screenshots/10-diff.png) |

## Requirements

- **Omarchy 4** (the Quickshell-based `omarchy-shell`), with Hyprland using its
  Lua config (the Omarchy 4 default).
- Runtime tools, all installed by default on Omarchy:

  | Package | Used for |
  | --- | --- |
  | `python` (`python3`) | `bin/devkit-hash`: hashes (`hashlib`) and random bytes for UUIDs (`secrets`) |
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
JSON, Base64, a URL or a timestamp, a banner offers to load it (`Ctrl+D`).
Click any row in the Hash, Case or Timestamp output to copy that value.

| Key | Action |
| --- | --- |
| `Ctrl+1…0` | Switch tool |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tool |
| `Ctrl+Shift+V` | Paste the clipboard into the input |
| `Ctrl+Shift+C` | Copy the output |
| `Ctrl+Enter` | Make the output the input (chain, e.g. Base64 → JSON); regenerate in UUID |
| `Ctrl+L` | Clear |
| `Ctrl+D` | Load the clipboard suggestion |
| `Esc` | Close |

Each tool remembers its input until the shell restarts. Inputs are never saved.

## Configure

DevKit has no settings file. The window follows your Omarchy theme and font.

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

Payload fields: `tool` (`json`, `jwt`, `base64`, `url`, `time`, `uuid`, `hash`,
`case`, `regex`, `diff`), `mode` (for example `minify`, `decode`, `parse` or
`v7`), `input`, `input2` (the diff's second text), `pattern`, `flags`,
`replacement`, and `action: "clipboard"`.

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
- **No config changes.** DevKit never edits your files. The only thing it
  registers is a runtime Hyprland window rule (`hyprctl eval`), which matches
  only a Quickshell window titled `DevKit`.
- **Secrets stay out of argv.** Text sent for hashing, or to the clipboard, goes
  over stdin, never on a command line where `/proc/<pid>/cmdline` would expose it.
- **Clipboard hygiene.** Every copy uses `wl-copy --sensitive`.
- **No rich-text injection.** Every label renders as plain text, so markup in a
  pasted value (for example `<img src="file:///…">` in a JWT claim) shows up as
  literal text.
- **JWT signatures are not verified.** That needs the signing key, and the
  decoder says so on screen.

Processes DevKit runs: `wl-paste`, `wl-copy`, `bin/devkit-hash` (Python) and
`bin/devkit-window` (`hyprctl`, `jq`). All tool logic is plain JavaScript in
`Tools.js`.

## Troubleshooting

- **The window opens tiled instead of floating.** The window rule needs
  Hyprland's Lua config. Check it with
  `hyprctl -j status | jq -r .configProvider`, which should print `lua`.
- **The icon doesn't appear.** Make sure the plugin is enabled with
  `omarchy plugin list`, then run `omarchy plugin enable coding-sparrow.devkit`.
- **Changes don't show after an update.** Run `omarchy restart shell`.

## Develop

```bash
git clone https://github.com/Coding-Sparrow/omarchy-devkit.git ~/code/omarchy-devkit
ln -s ~/code/omarchy-devkit ~/.config/omarchy/plugins/coding-sparrow.devkit
omarchy plugin enable coding-sparrow.devkit
tests/run                    # manifest, helpers and all tool logic (needs node)
```

`Tools.js` holds all the logic as pure functions, loaded by both QML and the node
tests. `DevKit.qml` is the window, `BarWidget.qml` is the bar icon, and `bin/`
contains the hash/random helper and the Hyprland window-rule script.

## License

[MIT](LICENSE) © Coding-Sparrow
