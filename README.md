# DevKit for Omarchy

The developer tools you reach for every day, one click away on the Omarchy bar.
It opens as a floating window: do the job, press `Esc`, and you're back.

Everything runs locally inside `omarchy-shell`. There are no network requests
and nothing is written to disk. Copies use `wl-copy --sensitive`, so decoded
secrets stay out of clipboard history.

## Tools

| Key | Tool | What it does |
| --- | --- | --- |
| `Ctrl+1` | **JSON** | Format (2/4 spaces), minify, sort keys, validate with line/column errors |
| `Ctrl+2` | **JWT Decoder** | Header, payload, `iat`/`nbf`/`exp` as dates, EXPIRED badge. Signature is *not* verified |
| `Ctrl+3` | **Base64** | Encode, decode, URL-safe. Full UTF-8; binary is shown as hex |
| `Ctrl+4` | **URL** | Encode/decode components; parse a URL into host, port, path and query params |
| `Ctrl+5` | **Timestamp** | Epoch in s/ms/µs/ns ⇄ ISO, local, RFC 2822, relative. Empty input shows a live "now" |
| `Ctrl+6` | **UUID** | v4 and v7, bulk, uppercase. Uses a CSPRNG (Python `secrets`) |
| `Ctrl+7` | **Hash** | MD5, SHA-1, SHA-256, SHA-512 |
| `Ctrl+8` | **Case Converter** | camel, Pascal, snake, SCREAMING, kebab, Train, dot, path, Title… |
| `Ctrl+9` | **Regex Tester** | JS regex matches, numbered and named groups, replace |
| `Ctrl+0` | **Text Diff** | Line diff of two texts |

When you open DevKit, it checks the clipboard. If the content looks like a JWT,
JSON, Base64, a URL or a timestamp, a banner offers to load it into the right
tool (`Ctrl+D`). Right-clicking the bar icon does this straight away.

Click any row in Hash, Case or Timestamp output to copy that value.

## Keys

| Key | Action |
| --- | --- |
| `Ctrl+1…0` | Switch tool |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tool |
| `Ctrl+Shift+V` | Paste clipboard into the input |
| `Ctrl+Shift+C` | Copy the output |
| `Ctrl+Enter` | Output becomes input (chain, e.g. Base64 → JSON); regenerate in UUID |
| `Ctrl+L` | Clear |
| `Ctrl+D` | Load the clipboard suggestion |
| `Esc` | Close |

Each tool remembers its input while the shell session runs. It is never saved.

## Install

```bash
omarchy plugin add https://github.com/Coding-Sparrow/omarchy-devkit.git --enable
```

The icon goes on the right of the bar. Move it with
`omarchy bar move coding-sparrow.devkit --after <widget-id>`.

Optional keybinding in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER CTRL, D", "DevKit", "omarchy-shell shell toggle coding-sparrow.devkit")
```

To open a specific tool, or pass input from a script:

```bash
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"uuid","mode":"v7"}'
omarchy-shell shell summon coding-sparrow.devkit '{"tool":"json","input":"{\"a\":1}"}'
omarchy-shell shell summon coding-sparrow.devkit '{"action":"clipboard"}'
```

## Develop

```bash
tests/run                    # manifest, helpers, and all tool logic (node)
omarchy restart shell        # keepLoaded panels pick up QML edits on restart
```

`Tools.js` holds all the logic as pure functions. `DevKit.qml` is the window,
`BarWidget.qml` the bar icon, and `bin/` has the hash/random helper plus the
Hyprland window rule that floats and centers the window.

## License

MIT
