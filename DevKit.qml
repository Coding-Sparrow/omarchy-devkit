import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui
import "ui"
import "Tools.js" as Tools

// DevKit: a floating window of everyday developer tools. Everything is
// computed locally; nothing is sent over the network. What you type is never
// written to disk: the only file DevKit keeps holds pinned and recent tools
// and saved chains (see statePath).
Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false

  readonly property string pluginId: (manifest && manifest.id) || "coding-sparrow.devkit"
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string helper: pluginDir + "/bin/devkit-helper"

  // ---- theme (shares the menu surface tokens, so themes style it for free)
  readonly property color background: Color.menu.background
  readonly property color foreground: Color.menu.text
  readonly property color border: Color.menu.border
  readonly property color accent: Color.accent
  readonly property color urgent: Color.urgent
  readonly property color dim: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.55)
  readonly property color faint: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.10)
  readonly property color fieldFill: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.035)
  readonly property string fontFamily: Style.font.family

  // ---- window size: a share of the monitor DevKit opens on, so it suits a
  // laptop and a 4K display alike. A summon payload can override the share
  // ({"width": 0.8, "height": 0.85}); it lasts until the shell restarts.
  readonly property real defaultWidthRatio: 0.66
  readonly property real defaultHeightRatio: 0.74
  property real widthRatio: defaultWidthRatio
  property real heightRatio: defaultHeightRatio
  readonly property int minWidth: Style.space(860)
  readonly property int minHeight: Style.space(520)
  property bool remapping: false
  property int windowWidth: Style.space(1180)
  property int windowHeight: Style.space(740)

  function focusedScreen() {
    var name = Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : ""
    var screens = Quickshell.screens
    for (var i = 0; i < screens.length; i++) if (screens[i].name === name) return screens[i]
    return screens.length ? screens[0] : null
  }

  function ratio(value, fallback) {
    var n = Number(value)
    return isFinite(n) && n >= 0.3 && n <= 1 ? n : fallback
  }

  function fitToScreen() {
    var scr = focusedScreen()
    if (!scr || !(scr.width > 0) || !(scr.height > 0)) return
    var maxW = Math.max(1, scr.width - Style.space(40)), maxH = Math.max(1, scr.height - Style.space(80))
    windowWidth = Math.min(maxW, Math.max(minWidth, Math.round(scr.width * widthRatio)))
    windowHeight = Math.min(maxH, Math.max(minHeight, Math.round(scr.height * heightRatio)))
    window.screen = scr
  }

  // ---- tool state
  readonly property var tools: Tools.TOOLS
  property string toolId: "json"
  readonly property var tool: Tools.toolById(toolId)
  readonly property string kind: tool.kind || "text"
  property string mode: ""
  property var opts: ({})              // the tool's declared options (Tools.TOOLS[].options)
  property int optsRevision: 0         // bumped when opts change from outside the controls
  property bool useReplace: false
  property bool upper: false
  property bool pwUpper: true
  property bool pwLower: true
  property bool pwDigits: true
  property bool pwSpecial: true
  property var stash: ({})             // per-tool editor state, session only
  property bool restoring: false       // true while many fields are set at once
  property bool initialized: false

  readonly property bool usesInput: kind !== "generator" && kind !== "view"
  readonly property bool takesImage: toolId === "qrread" || (toolId === "base64img" && mode === "encode")

  // ---- results
  property string outText: ""
  property string errText: ""
  property string infoText: ""
  property bool infoUrgent: false
  property var outPairs: []
  property var swatch: null            // Color tool: { r, g, b, a, dark } in 0..1
  property string outHtml: ""          // Markdown / HTML preview (escaped and sanitised in Tools.js)
  property string outImage: ""         // a picture bin/devkit-helper wrote
  property var preSample: null         // the user's fields before Sample, to restore
  property var diffRows: []
  // A tool the output could go to next ("→ JSON"), from Tools.detect.
  readonly property string nextTool: {
    if (!outText || outText.length > 1048576 || kind !== "text" || outPairs.length > 0 || outHtml !== "") return ""
    var t = Tools.detect(outText)
    return t && t !== toolId ? t : ""
  }

  // ---- clipboard hint
  property string clipText: ""
  property string clipTool: ""
  property string clipImage: ""        // MIME type when the clipboard holds a picture
  property string toast: ""

  // ---- sidebar
  property string search: ""
  property int navCursor: 0
  property var pinned: []
  property var recent: []
  readonly property var navRows: buildNav(search, pinned, recent)
  property bool helpOpen: false

  // ---- chains
  property var chains: []
  property string chainId: ""
  readonly property var chain: findChain(chainId)
  property var chainSteps: []          // the open chain's steps, replaced only on structural edits
  property var chainInputs: ({})       // per chain, session only
  property var chainResult: ({ output: "", error: "", info: "", steps: [] })
  property bool chainBusy: false
  readonly property var chainToolOptions: Tools.chainTools().map(function (t) { return { value: t.id, label: t.name } })

  // ---- history (memory only)
  property var history: []
  property var lastRecorded: ({})

  // ---- CSPRNG pool for UUIDs and passwords, filled only from python's
  // `secrets` (bin/devkit-hash random). There is no other randomness source:
  // when the pool is short, generation waits for the helper.
  property var randomPool: []
  property int randomWanted: 0
  property bool randomFailed: false
  readonly property int randomPoolTarget: 8192
  readonly property int randomRequestMax: 65536

  property bool regexBusy: false

  // ---- helper jobs (bin/devkit-helper): one in flight; newer ones replace it
  property int jobSeq: 0
  property var jobPartial: null
  property var jobState: null
  property bool jobBusy: false

  // ---- persisted UI state: no inputs, no outputs, no secrets
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")) + "/omarchy"
  readonly property string statePath: stateDir + "/devkit.json"
  property bool stateLoaded: false
  property string lastTool: ""

  // ------------------------------------------------------------ lifecycle

  property bool windowRuleReady: false
  property string pendingPayload: ""

  // DevKit is not kept loaded: the shell builds it on the first open and frees
  // it when hidden. Closing it from inside (Esc, the window's close, a toggle
  // payload) keeps it in memory for unloadAfterMs so a quick reopen finds your
  // input where you left it; then it hands itself back to the shell, which
  // destroys it. Closed, DevKit costs only its bar icon.
  readonly property int unloadAfterMs: 5 * 60 * 1000

  function open(payloadJson) {
    unloadTimer.stop()
    if (!windowRuleReady) {
      pendingPayload = payloadJson || "{}"
      if (!windowRuleProc.running) windowRuleProc.running = true
      return
    }
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }
    // {"action":"toggle"} closes an open window but keeps DevKit warm, where
    // the shell's own toggle would free it at once.
    if (payload.action === "toggle" && opened) { dismiss(); return }
    if (payload.width !== undefined) widthRatio = ratio(payload.width, widthRatio)
    if (payload.height !== undefined) heightRatio = ratio(payload.height, heightRatio)
    var resize = payload.width !== undefined || payload.height !== undefined
    if (window.visible && resize) {
      // Hyprland keeps a mapped window's size, so re-show it at the new one.
      remapping = true
      window.visible = false
      remapping = false
    }
    if (!window.visible) fitToScreen()
    opened = true
    window.visible = true
    // Payloads written for 0.1 ({"tool":"json","mode":"yaml"}) still land.
    var routed = payload.tool ? Tools.legacyRoute(payload.tool, payload.mode) : null
    if (routed) { payload.tool = routed.tool; payload.mode = routed.mode }
    var wasRestoring = restoring
    restoring = true
    if (payload.tool) selectTool(String(payload.tool))
    if (payload.mode) mode = String(payload.mode)
    if (payload.input !== undefined) inputEd.text = String(payload.input)
    if (payload.input2 !== undefined) input2Ed.text = String(payload.input2)
    if (payload.count !== undefined)
      countField.text = String(toolId === "password" ? Tools.passwordCount(payload.count) : Tools.uuidCount(payload.count))
    if (payload.length !== undefined) lengthField.text = String(Tools.passwordLength(payload.length))
    if (payload.pattern !== undefined) patternField.text = String(payload.pattern)
    if (payload.flags !== undefined) flagsField.text = String(payload.flags)
    if (payload.replacement !== undefined) { replField.text = String(payload.replacement); useReplace = true }
    if (payload.query !== undefined && toolId === "json") setOpt("query", String(payload.query), true)
    restoring = wasRestoring
    if (payload.sample === true) { loadSample(); payload.tool = payload.tool || toolId }
    if (payload.tool || payload.mode || payload.input !== undefined || payload.input2 !== undefined
        || payload.count !== undefined || payload.length !== undefined || payload.pattern !== undefined
        || payload.flags !== undefined || payload.replacement !== undefined || payload.query !== undefined) compute()
    readClipboard(payload.action === "clipboard" ? "load" : "hint")
    if (randomPool.length < randomPoolTarget) requestRandom(randomPoolTarget)
    Qt.callLater(focusInput)
  }

  function close() {
    recordHistory()
    opened = false
    window.visible = false
    clipTool = ""
    clipText = ""
    clipImage = ""
    helpOpen = false
    // The shell may destroy DevKit right after this; write pending state now.
    if (persistTimer.running) { persistTimer.stop(); saveState() }
  }

  function dismiss() {
    close()
    unloadTimer.restart()
  }

  function unload() {
    if (opened) return
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }

  function focusInput() {
    if (toolId === "regex") patternField.forceActiveFocus()
    else if (toolId === "uuid" || toolId === "password" || toolId === "lorem") generateButton.forceActiveFocus()
    else if (toolId === "chains") { if (chainLoader.item) chainLoader.item.inputEditor.area.forceActiveFocus() }
    else if (toolId === "history") sidebar.searchField.forceActiveFocus()
    else {
      inputEd.area.forceActiveFocus()
      inputEd.area.cursorPosition = sampleShown ? 0 : inputEd.area.length
    }
  }

  function setSearch(text) {
    sidebar.searchField.text = String(text || "")
  }

  function focusSearch() {
    sidebar.searchField.forceActiveFocus()
    sidebar.searchField.selectAll()
  }

  // ------------------------------------------------------------ sidebar

  function toolInfo(id) { return Tools.toolById(id) }

  function keyHint(seq) {
    if (!seq) return ""
    return String(seq).replace("Ctrl+Shift+", "^⇧").replace("Ctrl+", "^")
  }

  function buildNav(q, pins, rec) {
    var rows = [], n = 0
    function add(id, section) { rows.push({ kind: "tool", id: id, section: section, n: n++ }) }
    if (String(q).trim() !== "") {
      var hits = Tools.searchTools(q)
      rows.push({ kind: "header", label: hits.length + (hits.length === 1 ? " match" : " matches") })
      hits.forEach(function (t) { add(t.id, "search") })
      return rows
    }
    if (pins.length) {
      rows.push({ kind: "header", label: "Pinned" })
      pins.forEach(function (id) { add(id, "pinned") })
    }
    var recentRows = rec.filter(function (id) { return pins.indexOf(id) === -1 }).slice(0, 4)
    if (recentRows.length) {
      rows.push({ kind: "header", label: "Recent" })
      recentRows.forEach(function (id) { add(id, "recent") })
    }
    Tools.SECTIONS.forEach(function (s) {
      rows.push({ kind: "header", label: s.label })
      Tools.toolsIn(s.id).forEach(function (t) { add(t.id, s.id) })
    })
    return rows
  }

  function toolRows() { return navRows.filter(function (r) { return r.kind === "tool" }) }

  function moveCursor(d) {
    var count = toolRows().length
    if (count) navCursor = (navCursor + d + count) % count
  }

  function openCursor() {
    var rows = toolRows()
    if (!rows.length) return
    var id = rows[Math.max(0, Math.min(rows.length - 1, navCursor))].id
    sidebar.searchField.text = ""
    selectTool(id)
  }

  function togglePin(id) {
    var next = pinned.slice()
    var at = next.indexOf(id)
    if (at === -1) next.push(id); else next.splice(at, 1)
    pinned = next
    flash(at === -1 ? "Pinned " + Tools.toolById(id).name : "Unpinned " + Tools.toolById(id).name)
    saveStateSoon()
  }

  function noteRecent(id) {
    if (id === "history") return
    var next = [id].concat(recent.filter(function (x) { return x !== id })).slice(0, 8)
    if (next.join() === recent.join()) return
    recent = next
    lastTool = id
    saveStateSoon()
  }

  function cycleTool(delta) {
    // Through the sidebar's own order, so Ctrl+Tab walks what you see.
    var rows = buildNav("", [], []).filter(function (r) { return r.kind === "tool" })
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === toolId) { selectTool(rows[(i + delta + rows.length) % rows.length].id); return }
    }
  }

  // ------------------------------------------------------------ tools

  function saveStash() {
    var next = ({})
    for (var k in stash) next[k] = stash[k]
    next[toolId] = {
      input: inputEd.text, input2: input2Ed.text, mode: mode, opts: opts,
      pattern: patternField.text, flags: flagsField.text, replacement: replField.text,
      useReplace: useReplace, count: countField.text, upper: upper,
      length: lengthField.text, exclude: excludeField.text,
      pwUpper: pwUpper, pwLower: pwLower, pwDigits: pwDigits, pwSpecial: pwSpecial
    }
    stash = next
  }

  function selectTool(id) {
    if (initialized && id === toolId) { focusInput(); return }
    if (initialized) { recordHistory(); saveStash() }
    initialized = true
    var t = Tools.toolById(id)
    var s = stash[t.id] || ({})
    // Every field below fires its own onTextChanged, so restore them all first
    // and compute once.
    var wasRestoring = restoring
    restoring = true
    toolId = t.id
    mode = s.mode || (t.modes.length ? t.modes[0].value : "")
    opts = s.opts || Tools.optionDefaults(t.id)
    optsRevision++
    useReplace = !!s.useReplace
    upper = !!s.upper
    inputEd.text = s.input || ""
    input2Ed.text = s.input2 || ""
    patternField.text = s.pattern !== undefined ? s.pattern : ""
    flagsField.text = s.flags !== undefined ? s.flags : "g"
    replField.text = s.replacement || ""
    countField.text = s.count !== undefined ? s.count : (t.id === "password" ? "1" : "5")
    lengthField.text = s.length !== undefined ? s.length : String(Tools.PASSWORD_LENGTH_DEFAULT)
    excludeField.text = s.exclude || ""
    pwUpper = s.pwUpper !== false
    pwLower = s.pwLower !== false
    pwDigits = s.pwDigits !== false
    pwSpecial = s.pwSpecial !== false
    restoring = wasRestoring
    outImage = ""
    noteRecent(t.id)
    if (t.id === "chains" && !chainId && chains.length) selectChain(chains[0].id)
    compute()
    if (opened) Qt.callLater(focusInput)
    Qt.callLater(focusInput)
  }

  function setMode(value) {
    mode = value
    optsRevision++
    compute()
  }

  // `quiet`: the controls already show the value (a field being typed in).
  function setOpt(id, value, quiet) {
    var next = ({})
    for (var k in opts) next[k] = opts[k]
    next[id] = value
    opts = next
    if (!quiet) optsRevision++
    compute()
  }

  // Take exactly n CSPRNG bytes from the pool, or null if it holds fewer.
  function takeRandom(n) {
    if (randomPool.length < n) return null
    var taken = randomPool.slice(0, n)
    randomPool = randomPool.slice(n)
    if (randomPool.length < randomPoolTarget) requestRandom(randomPoolTarget)
    return taken
  }

  function requestRandom(bytes) {
    if (randomProc.running) return
    randomProc.bytes = Math.max(1, Math.min(randomRequestMax, bytes))
    randomProc.running = true
  }

  function clearResult() {
    diffRows = []
    outPairs = []
    outHtml = ""
    swatch = null
    infoUrgent = false
  }

  function waitForRandom(need) {
    randomWanted = need
    outText = ""
    errText = randomFailed ? "Secure random source (bin/devkit-hash) is unavailable" : ""
    infoText = randomFailed ? "" : "Generating…"
    requestRandom(Math.max(need, randomPoolTarget))
  }

  function computeUuid() {
    clearResult()
    var need = Tools.uuidBytesNeeded(countField.text)
    var bytes = takeRandom(need)
    if (!bytes) { waitForRandom(need); return }
    randomWanted = 0
    applyResult(Tools.run("uuid", { mode: mode, count: countField.text, upper: upper, nowMs: Date.now(), randomBytes: bytes }))
  }

  function passwordOptions() {
    return { mode: mode, length: lengthField.text, count: countField.text,
             upper: pwUpper, lower: pwLower, digits: pwDigits, special: pwSpecial, exclude: excludeField.text }
  }

  function computePassword() {
    clearResult()
    var o = passwordOptions()
    var invalid = Tools.passwordValidate(o)
    if (invalid) { randomWanted = 0; outText = ""; errText = invalid; infoText = ""; return }
    var need = Tools.passwordBytesNeeded(o.count, o.length)
    var bytes = takeRandom(need)
    if (!bytes) { waitForRandom(need); return }
    randomWanted = 0
    o.randomBytes = bytes
    applyResult(Tools.run("password", o))
  }

  function applyResult(r) {
    outText = r.output || ""
    errText = r.error || ""
    infoText = r.info || ""
    infoUrgent = r.urgent === true
    outPairs = r.pairs || []
    diffRows = r.rows || []
    swatch = r.swatch || null
    outHtml = r.html || ""
    if (r.image !== undefined) outImage = r.image || ""
  }

  function currentState() {
    return { input: inputEd.text, input2: input2Ed.text, mode: mode, opts: opts,
             nowMs: Date.now(), theme: (toolId === "markdown" || toolId === "htmlpreview") ? previewTheme() : null }
  }

  function compute() {
    if (restoring) return
    if (toolId === "uuid") { computeUuid(); return }
    if (toolId === "password") { computePassword(); return }
    if (toolId === "regex") { computeRegex(); return }
    if (kind === "view") { clearResult(); outText = ""; errText = ""; infoText = ""; outImage = "" }
    if (toolId === "chains") { runChain(); return }
    if (toolId === "history") return
    if (toolId === "lorem" && opts.seed === undefined) { var o = ({}); for (var k in opts) o[k] = opts[k]; o.seed = Date.now() % 100000; opts = o }
    // Long documents re-render once typing pauses, not on every key.
    if ((toolId === "markdown" || toolId === "htmlpreview" || inputEd.text.length > 65536) && inputEd.text.length > 16384 && !slowDebounce.firing) {
      slowDebounce.restart()
      return
    }
    var state = currentState()
    var r = Tools.run(toolId, state)
    applyResult(r)
    if (r.job) scheduleJob(r, state)
    else if (tool.job) { jobPartial = null; jobSeq++ }
    if (tool.kind === "image" && !r.job && r.image === undefined && (r.error || !r.output)) outImage = ""
  }

  // Opaque theme colours for the preview's inline styles.
  function hexColor(c) {
    function h(v) { return ("0" + Math.round(v * 255).toString(16)).slice(-2) }
    return "#" + h(c.r) + h(c.g) + h(c.b)
  }
  function previewTheme() {
    function mix(a) { return hexColor(Qt.tint(root.background, Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, a))) }
    return { accent: hexColor(root.accent), dim: mix(0.6), code: mix(0.09), border: mix(0.25) }
  }

  // ------------------------------------------------------------ helper jobs

  function scheduleJob(partial, state) {
    jobSeq++
    jobPartial = partial
    jobState = state
    jobBusy = true
    // Typing into a hash or a JWT secret should not start a process per key.
    jobDebounce.interval = partial.job.cmd === "hash" && partial.job.payload.text !== undefined && partial.job.payload.text.length < 4096 ? 90 : 160
    jobDebounce.restart()
  }

  function startJob() {
    if (!jobPartial || !jobPartial.job) { jobBusy = false; return }
    if (helperProc.running) {
      // A newer request wins: stop the old one (a big file can take a while).
      helperProc.restart = true
      helperProc.running = false
      return
    }
    helperProc.seq = jobSeq
    helperProc.tool = toolId
    helperProc.cmd = jobPartial.job.cmd
    helperProc.payload = JSON.stringify(jobPartial.job.payload)
    helperProc.stdinEnabled = true
    helperProc.running = true
  }

  function jobDone(seq, tool, raw) {
    if (seq !== jobSeq || tool !== toolId || !jobPartial) return
    jobBusy = false
    var resp
    try {
      var lines = String(raw || "").split("\n").filter(function (l) { return l.trim() })
      resp = JSON.parse(lines[lines.length - 1])
    } catch (e) { resp = { error: "bin/devkit-helper gave no answer" } }
    applyResult(Tools.finish(toolId, jobState, jobPartial, resp))
  }

  // Image tools read the clipboard's picture through the helper.
  function imageFromClipboard() {
    var state = currentState()
    var partial
    if (toolId === "qrread") partial = { output: "", error: "", info: "Reading the clipboard…", job: { cmd: "qr-read", payload: { clipboard: true } } }
    else {
      if (toolId !== "base64img") selectTool("base64img")
      mode = "encode"
      state = currentState()
      partial = { output: "", error: "", info: "Reading the clipboard…", job: { cmd: "image-encode", payload: { clipboard: true } } }
    }
    applyResult(partial)
    scheduleJob(partial, state)
  }

  function imageAction(cmd, label) {
    if (!outImage) return
    actionProc.label = label
    actionProc.cmd = cmd
    actionProc.payload = JSON.stringify({ path: outImage, name: toolId === "qr" ? "qr-code" : "devkit-image" })
    actionProc.stdinEnabled = true
    actionProc.running = true
  }

  // ------------------------------------------------------------ samples

  readonly property bool hasSample: Tools.sample(toolId, mode) !== null
  readonly property bool sampleShown: preSample !== null && preSample.tool === toolId && inputEd.text === preSample.sampleInput

  function loadSample() {
    if (sampleShown) {
      var p = preSample
      preSample = null
      restoring = true
      inputEd.text = p.input; input2Ed.text = p.input2
      patternField.text = p.pattern; flagsField.text = p.flags; replField.text = p.replacement
      useReplace = p.useReplace
      opts = p.opts
      optsRevision++
      restoring = false
      compute()
      flash("Your input is back")
      return
    }
    var s = Tools.sample(toolId, mode)
    if (!s) return
    preSample = { tool: toolId, input: inputEd.text, input2: input2Ed.text, pattern: patternField.text, opts: opts,
                  flags: flagsField.text, replacement: replField.text, useReplace: useReplace, sampleInput: s.input }
    restoring = true
    inputEd.text = s.input
    if (s.input2 !== undefined) input2Ed.text = s.input2
    if (s.pattern !== undefined) patternField.text = s.pattern
    if (s.flags !== undefined) flagsField.text = s.flags
    if (s.replacement !== undefined) { replField.text = s.replacement; useReplace = true }
    if (s.opts) {
      var o = ({})
      for (var k in opts) o[k] = opts[k]
      for (var j in s.opts) o[j] = s.opts[j]
      opts = o
      optsRevision++
    }
    restoring = false
    compute()
    focusInput()
  }

  // ------------------------------------------------------------ regex

  // User regexes never run in the shell: they go to a separate, killable
  // worker process with a deadline. Edits made meanwhile are sent when it returns.
  function computeRegex() {
    clearResult()
    if (patternField.text === "") { outText = ""; errText = ""; infoText = "Enter a pattern"; return }
    regexDebounce.restart()
  }

  function sendRegex() {
    if (toolId !== "regex" && !(toolId === "chains" && Tools.chainNeedsWorker(chainSteps))) return
    if (regexProc.running) { regexProc.rerun = true; return }
    if (toolId === "chains") {
      regexProc.payload = JSON.stringify({ chain: chainSteps, input: chainInputs[chainId] || "", nowMs: Date.now() })
      regexProc.forChain = true
    } else {
      regexProc.payload = JSON.stringify({
        pattern: patternField.text, flags: flagsField.text, input: inputEd.text,
        replacement: replField.text, useReplace: useReplace
      })
      regexProc.forChain = false
      infoText = "Matching…"
    }
    regexBusy = true
    regexProc.stdinEnabled = true
    regexProc.running = true
    regexWatchdog.restart()
  }

  function useOutputAsInput() {
    if (!outText) return
    inputEd.text = outText
    inputEd.area.forceActiveFocus()
  }

  // Send the output to the tool it looks like it belongs to.
  function sendToTool(id) {
    var text = outText
    if (!text) return
    selectTool(id)
    var m = Tools.detectMode(id, text)
    if (m) mode = m
    inputEd.text = text
    compute()
    flash("Sent to " + Tools.toolById(id).name)
  }

  // ------------------------------------------------------------ chains

  function findChain(id) {
    for (var i = 0; i < chains.length; i++) if (chains[i].id === id) return chains[i]
    return null
  }

  function cloneSteps(steps) { return JSON.parse(JSON.stringify(steps || [])) }

  function selectChain(id) {
    var c = findChain(id)
    if (!c) return
    chainId = id
    chainSteps = cloneSteps(c.steps)
    var input = chainInputs.hasOwnProperty(id) ? chainInputs[id] : (c.input !== undefined ? c.input : (id === "builtin-jwtyaml" ? Tools.SAMPLE_JWT : ""))
    if (chainLoader.item) chainLoader.item.inputEditor.text = input
    chainInputChanged(input)
  }

  function chainInputChanged(text) {
    if (!chainId) return
    var next = ({})
    for (var k in chainInputs) next[k] = chainInputs[k]
    next[chainId] = text
    chainInputs = next
    chainDebounce.restart()
  }

  function storeChain(mutator, structural) {
    var c = findChain(chainId)
    if (!c) return
    var next = chains.map(function (x) {
      if (x.id !== chainId) return x
      var copy = { id: x.id, name: x.name, steps: cloneSteps(structural ? chainSteps : x.steps) }
      if (x.input !== undefined) copy.input = x.input
      mutator(copy)
      return copy
    })
    chains = next
    saveStateSoon()
    chainDebounce.restart()
  }

  function newChain() {
    var id = "chain-" + Date.now().toString(36)
    var steps = [Tools.chainStep("url"), Tools.chainStep("json")]
    steps[0].mode = "decode"
    chains = chains.concat([{ id: id, name: "New chain", steps: steps }])
    saveStateSoon()
    selectChain(id)
  }

  // A chain that starts with the tool you are in, on what is in it now.
  function chainFromHere() {
    if (!Tools.chainable(tool)) return
    var id = "chain-" + Date.now().toString(36)
    var step = Tools.chainStep(toolId)
    if (mode && Tools.chainModes(toolId).some(function (m) { return m.value === mode })) step.mode = mode
    for (var k in opts) if (Tools.secretOptions(toolId).indexOf(k) === -1) step.opts[k] = opts[k]
    var input = inputEd.text
    chains = chains.concat([{ id: id, name: tool.name + " → …", steps: [step] }])
    var ins = ({})
    for (var j in chainInputs) ins[j] = chainInputs[j]
    ins[id] = input
    chainInputs = ins
    saveStateSoon()
    selectTool("chains")
    selectChain(id)
    flash("New chain from " + tool.name + ": add the next step")
  }

  function duplicateChain() {
    var c = findChain(chainId)
    if (!c) return
    var id = "chain-" + Date.now().toString(36)
    chains = chains.concat([{ id: id, name: c.name + " (copy)", steps: cloneSteps(c.steps) }])
    saveStateSoon()
    selectChain(id)
  }

  function deleteChain() {
    var at = -1
    for (var i = 0; i < chains.length; i++) if (chains[i].id === chainId) at = i
    if (at === -1) return
    var name = chains[at].name
    var next = chains.slice()
    next.splice(at, 1)
    chains = next
    saveStateSoon()
    chainId = ""
    chainSteps = []
    if (next.length) selectChain(next[Math.min(at, next.length - 1)].id)
    else chainResult = ({ output: "", error: "", info: "", steps: [] })
    flash("Deleted " + name)
  }

  function renameChain(name) { storeChain(function (c) { c.name = name || "Untitled chain" }, false) }

  function addStep() {
    var steps = cloneSteps(chainSteps)
    steps.push(Tools.chainStep("json"))
    chainSteps = steps
    storeChain(function () {}, true)
  }

  function removeStep(i) {
    var steps = cloneSteps(chainSteps)
    steps.splice(i, 1)
    chainSteps = steps
    storeChain(function () {}, true)
  }

  function moveStep(i, d) {
    var j = i + d
    if (j < 0 || j >= chainSteps.length) return
    var steps = cloneSteps(chainSteps)
    var t = steps[i]; steps[i] = steps[j]; steps[j] = t
    chainSteps = steps
    storeChain(function () {}, true)
  }

  function setStepTool(i, toolIdValue) {
    if (chainSteps[i] && chainSteps[i].tool === toolIdValue) return
    var steps = cloneSteps(chainSteps)
    steps[i] = Tools.chainStep(toolIdValue)
    chainSteps = steps
    storeChain(function () {}, true)
  }

  function setStepMode(i, m) {
    var steps = cloneSteps(chainSteps)
    steps[i].mode = m
    chainSteps = steps
    storeChain(function () {}, true)
  }

  // Text edits change the step in place, so the field being typed in keeps focus.
  function setStepOpt(i, id, value) {
    if (!chainSteps[i]) return
    if (!chainSteps[i].opts) chainSteps[i].opts = ({})
    chainSteps[i].opts[id] = value
    var steps = chainSteps
    storeChain(function (c) { c.steps = cloneSteps(steps) }, false)
    if (typeof value === "boolean") chainSteps = cloneSteps(chainSteps)
  }

  function runChain() {
    if (toolId !== "chains") return
    if (!chainId) { chainResult = ({ output: "", error: "", info: "", steps: [] }); return }
    var input = chainInputs[chainId] || ""
    if (input === "") { chainResult = ({ output: "", error: "", info: "Give the first step some input", steps: [] }); return }
    if (Tools.chainNeedsWorker(chainSteps)) {
      chainBusy = true
      regexDebounce.restart()
      return
    }
    chainResult = Tools.chainRun(chainSteps, input, Date.now(), false)
  }

  // ------------------------------------------------------------ history

  function preview(text) {
    var s = String(text || "").replace(/\s+/g, " ").trim()
    return s.length > 120 ? s.slice(0, 120) + "…" : s
  }

  function recordHistory() {
    if (!initialized || !usesInput || toolId === "chains") return
    var input = inputEd.text
    if (input.trim() === "" || input.length > 262144) return
    var key = toolId + "\u0000" + mode + "\u0000" + input
    if (lastRecorded[toolId] === key) return
    var lr = ({})
    for (var k in lastRecorded) lr[k] = lastRecorded[k]
    lr[toolId] = key
    lastRecorded = lr
    var safeOpts = ({})
    var secrets = Tools.secretOptions(toolId)
    for (var o in opts) if (secrets.indexOf(o) === -1) safeOpts[o] = opts[o]
    var modeLabel = ""
    tool.modes.forEach(function (m) { if (m.value === mode) modeLabel = m.label })
    var d = new Date()
    var entry = {
      tool: toolId, mode: mode, modeLabel: modeLabel, input: input, input2: input2Ed.text, opts: safeOpts,
      pattern: patternField.text, flags: flagsField.text, replacement: replField.text, useReplace: useReplace,
      when: ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2),
      preview: preview(toolId === "regex" ? "/" + patternField.text + "/ " + input : input)
    }
    history = [entry].concat(history).slice(0, 100)
  }

  function restoreHistory(i) {
    var e = history[i]
    if (!e) return
    selectTool(e.tool)
    restoring = true
    mode = e.mode
    var o = Tools.optionDefaults(e.tool)
    for (var k in e.opts) o[k] = e.opts[k]
    opts = o
    optsRevision++
    inputEd.text = e.input
    input2Ed.text = e.input2 || ""
    patternField.text = e.pattern || ""
    flagsField.text = e.flags || "g"
    replField.text = e.replacement || ""
    useReplace = !!e.useReplace
    restoring = false
    compute()
    focusInput()
  }

  function clearHistory() { history = []; lastRecorded = ({}) }

  // ------------------------------------------------------------ clipboard

  function copy(text, label) {
    if (!text) return
    copyProc.payload = text
    copyProc.stdinEnabled = true
    copyProc.running = true
    flash("Copied " + (label || "output"))
    recordHistory()
  }

  function copyOutput() {
    if (toolId === "chains") { copy(chainResult.output || "", "chain output"); return }
    if (tool.kind === "image" && outImage && toolId === "qr") { imageAction("image-copy", "QR code"); return }
    copy(outText)
  }

  function flash(message, ms) {
    toast = message
    toastTimer.interval = ms || 1800
    toastTimer.restart()
  }

  // Clipboard reads go through bin/devkit-clip, which caps them at 1 MiB and
  // 2 s and prints a status line first, so partial data is never used.
  function readClipboard(intent) {
    if (clipProc.running) return
    clipProc.intent = intent
    clipProc.running = true
    clipWatchdog.restart()
  }

  function pasteShortcut() {
    if (takesImage) { imageFromClipboard(); return }
    readClipboard(toolId === "chains" ? "paste-chain" : "paste")
  }

  function handleClipboardOutput(raw, intent) {
    var nl = raw.indexOf("\n")
    var status = nl === -1 ? raw : raw.slice(0, nl)
    var text = nl === -1 ? "" : raw.slice(nl + 1)
    if (status === "image") {
      clipTool = ""
      clipText = ""
      if (intent === "hint" || intent === "load") { clipImage = text.trim() || "image"; if (intent === "load") flash("The clipboard holds an image: read a QR code, or encode it") ; return }
      flash("The clipboard holds an image, not text", 3000)
      return
    }
    clipImage = ""
    if (status !== "ok") {
      clipTool = ""
      clipText = ""
      if (intent === "hint") return
      flash(status === "too-large" ? "Clipboard is larger than 1 MiB, not loaded"
        : status === "timeout" ? "Clipboard owner did not respond, not loaded"
        : status === "empty" ? "Clipboard has no text"
        : "Clipboard is unavailable", 4000)
      return
    }
    handleClipboard(text, intent)
  }

  function handleClipboard(text, intent) {
    if (intent === "paste2") { input2Ed.text = text; input2Ed.area.forceActiveFocus(); return }
    if (intent === "paste") { inputEd.text = text; inputEd.area.forceActiveFocus(); return }
    if (intent === "paste-chain") { if (chainLoader.item) chainLoader.item.inputEditor.text = text; return }
    var detected = Tools.detect(text)
    if (intent === "load" && detected) {
      clipTool = ""
      selectTool(detected)
      var m = Tools.detectMode(detected, text)
      if (m) mode = m
      inputEd.text = text.trim()
      compute()
      return
    }
    // Only suggest when it would change something.
    clipText = text
    clipTool = detected && !(detected === toolId && inputEd.text.trim() === text.trim()) ? detected : ""
  }

  function loadClipboardSuggestion() {
    if (clipTool) { handleClipboard(clipText, "load"); return }
    if (clipImage) { clipImage = ""; selectTool("qrread"); imageFromClipboard() }
  }

  // ------------------------------------------------------------ persisted state

  // Only the shape of your workspace is kept: pinned tools, recent tools and
  // saved chains. Never inputs, outputs or secrets.
  function saveStateSoon() { if (stateLoaded) persistTimer.restart() }

  function saveState() {
    var data = { version: 1, pinned: pinned, recent: recent, lastTool: lastTool,
                 chains: chains.map(function (c) { return { id: c.id, name: c.name, steps: c.steps } }) }
    stateFile.setText(JSON.stringify(data, null, 2) + "\n")
    // FileView writes with the umask; tighten it, testing first so the change
    // itself does not loop through a file watcher.
    Quickshell.execDetached(["sh", "-c", "test \"$(stat -c %a \"$1\")\" = 600 || chmod 600 \"$1\"", "sh", statePath])
  }

  function loadState(raw) {
    var parsed = ({})
    try { parsed = JSON.parse(raw || "{}") } catch (e) { parsed = ({}) }
    function knownTools(list) {
      return (Array.isArray(list) ? list : []).filter(function (id, i, a) {
        return typeof id === "string" && Tools.toolById(id).id === id && a.indexOf(id) === i
      })
    }
    pinned = knownTools(parsed.pinned)
    recent = knownTools(parsed.recent)
    if (Array.isArray(parsed.chains)) {
      chains = parsed.chains.filter(function (c) { return c && typeof c.id === "string" && Array.isArray(c.steps) })
        .map(function (c) {
          var builtin = Tools.DEFAULT_CHAINS.filter(function (d) { return d.id === c.id })[0]
          var out = { id: c.id, name: String(c.name || "Chain"), steps: c.steps.slice(0, Tools.CHAIN_MAX_STEPS) }
          if (builtin && builtin.input !== undefined) out.input = builtin.input
          return out
        })
    } else chains = JSON.parse(JSON.stringify(Tools.DEFAULT_CHAINS))
    lastTool = typeof parsed.lastTool === "string" && Tools.toolById(parsed.lastTool).id === parsed.lastTool ? parsed.lastTool : ""
    stateLoaded = true
    if (lastTool && lastTool !== toolId && !opened) selectTool(lastTool)
  }

  // ------------------------------------------------------------ processes

  Process {
    id: windowRuleProc
    command: [root.pluginDir + "/bin/devkit-window"]
    property int failures: 0
    onExited: function (exitCode) {
      // Without the rule the window is tiled into the current workspace and
      // pushes its windows around, so try again before giving up on it.
      if (exitCode !== 0 && exitCode !== 2 && failures < 4) {
        failures++
        ruleRetryTimer.restart()
        return
      }
      if (exitCode !== 0) console.warn("DevKit: could not register its floating window rule (exit " + exitCode + ")")
      failures = 0
      root.windowRuleReady = true
      if (!root.pendingPayload) return
      var p = root.pendingPayload
      root.pendingPayload = ""
      root.open(p)
    }
  }

  // Window rules live in the Hyprland config and vanish on reload.
  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (String(event && event.name || "") === "configreloaded") ruleReloadTimer.restart()
    }
  }

  Timer {
    id: ruleRetryTimer
    interval: 250
    onTriggered: if (!windowRuleProc.running) windowRuleProc.running = true
  }

  Timer {
    id: ruleReloadTimer
    interval: 300
    onTriggered: if (!windowRuleProc.running) windowRuleProc.running = true
  }

  Process {
    id: clipProc
    property string intent: "hint"
    command: [root.pluginDir + "/bin/devkit-clip"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.handleClipboardOutput(String(text || ""), clipProc.intent)
    }
    onExited: clipWatchdog.stop()
  }

  Timer {
    id: clipWatchdog
    interval: 5000
    onTriggered: if (clipProc.running) clipProc.running = false
  }

  Timer {
    id: regexDebounce
    interval: 200
    onTriggered: root.sendRegex()
  }

  Process {
    id: regexProc
    property string payload: ""
    property bool rerun: false
    property bool forChain: false
    command: [root.pluginDir + "/bin/devkit-regex"]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (regexProc.rerun) return
        var lines = String(text || "").split("\n").filter(function (l) { return l.trim() })
        var r
        try { r = JSON.parse(lines[lines.length - 1]) } catch (e) { r = { output: "", error: "The regex worker returned no result", info: "" } }
        if (regexProc.forChain) {
          if (root.toolId !== "chains") return
          root.chainBusy = false
          root.chainResult = { output: String(r.output || ""), error: String(r.error || ""), info: String(r.info || ""),
                               steps: r.steps || [], failedAt: r.steps ? r.steps.findIndex(function (s) { return !s.ok }) : -1 }
          return
        }
        if (root.toolId !== "regex") return
        root.applyResult({ output: String(r.output || ""), error: String(r.error || ""),
                           info: String(r.info || ""), urgent: r.timeout === true })
      }
    }
    onExited: {
      regexWatchdog.stop()
      root.regexBusy = false
      if (!rerun) return
      rerun = false
      root.sendRegex()
    }
  }

  Timer {
    id: regexWatchdog
    interval: 5000
    onTriggered: if (regexProc.running) regexProc.running = false
  }

  // Secrets go through stdin, never argv; --sensitive keeps them out of
  // clipboard-history tools.
  Process {
    id: copyProc
    property string payload: ""
    command: ["wl-copy", "--type", "text/plain", "--sensitive"]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
  }

  Timer {
    id: jobDebounce
    interval: 120
    onTriggered: root.startJob()
  }

  Process {
    id: helperProc
    property string cmd: "hash"
    property string payload: ""
    property int seq: 0
    property string tool: ""
    property bool restart: false
    command: [root.helper, cmd]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: if (!helperProc.restart) root.jobDone(helperProc.seq, helperProc.tool, String(text || ""))
    }
    onExited: {
      if (!restart) return
      restart = false
      root.startJob()
    }
  }

  // Copy or save a picture DevKit made (a QR code, a decoded image).
  Process {
    id: actionProc
    property string cmd: "image-copy"
    property string payload: ""
    property string label: ""
    command: [root.helper, cmd]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var r = ({})
        try { r = JSON.parse(String(text || "").trim().split("\n").pop()) } catch (e) { r = { error: "No answer" } }
        if (r.error) root.flash(r.error, 4000)
        else if (r.saved) root.flash("Saved " + r.saved, 4000)
        else root.flash("Copied " + actionProc.label + " as an image")
      }
    }
  }

  Process {
    id: randomProc
    property int bytes: 8192
    command: [root.pluginDir + "/bin/devkit-hash", "random", String(bytes)]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          var hex = JSON.parse(String(text || "").trim().split("\n").pop()).random || ""
          if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw "bad"
          var pool = []
          for (var i = 0; i < hex.length; i += 2) pool.push(parseInt(hex.substr(i, 2), 16))
          root.randomPool = root.randomPool.concat(pool)
          root.randomFailed = false
        } catch (e) {
          root.randomFailed = true
        }
      }
    }
    onExited: function (exitCode) {
      if (exitCode !== 0) root.randomFailed = true
      if (root.randomWanted > 0 && (root.toolId === "uuid" || root.toolId === "password")) {
        if (root.randomPool.length >= root.randomWanted) root.compute()
        else if (!root.randomFailed) root.requestRandom(root.randomWanted)
        else root.compute()
      }
    }
  }

  FileView {
    id: stateFile
    path: root.statePath
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadState(text())
    onLoadFailed: root.loadState("")
  }

  Timer { id: persistTimer; interval: 500; onTriggered: root.saveState() }
  Timer { id: unloadTimer; interval: root.unloadAfterMs; onTriggered: root.unload() }
  Timer { id: toastTimer; interval: 1800; onTriggered: root.toast = "" }
  Timer { id: chainDebounce; interval: 120; onTriggered: root.runChain() }

  Timer {
    id: slowDebounce
    property bool firing: false
    interval: 250
    onTriggered: { firing = true; root.compute(); firing = false }
  }

  // Keep "now" live in the Timestamp tool when the input is empty.
  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.toolId === "time" && inputEd.text.trim() === ""
    onTriggered: root.compute()
  }

  // Keep Cron's next runs and relative times current while it is open.
  Timer {
    interval: 15000
    repeat: true
    running: root.opened && (root.toolId === "cron" || root.toolId === "jwt" || root.toolId === "ids")
    onTriggered: if (!root.tool.job || root.toolId === "ids") root.compute()
  }

  Component.onCompleted: {
    requestRandom(randomPoolTarget)
    windowRuleProc.running = true
    selectTool("json")
  }

  // ------------------------------------------------------------ window

  FloatingWindow {
    id: window
    visible: false
    title: "DevKit"
    color: root.background
    implicitWidth: root.windowWidth
    implicitHeight: root.windowHeight
    minimumSize: Qt.size(Math.min(root.minWidth, root.windowWidth), Math.min(root.minHeight, root.windowHeight))

    onVisibleChanged: if (!visible && root.opened && !root.remapping) root.dismiss()

    BorderSurface {
      anchors.fill: parent
      color: root.background
      borderSpec: Border.surfaceSpec("menu", "border", root.border, Math.max(1, Style.normalBorderWidth))
      radius: Style.cornerRadius

      Shortcut {
        sequence: "Escape"
        onActivated: {
          if (root.helpOpen) root.helpOpen = false
          else if (root.search !== "") sidebar.searchField.text = ""
          else root.dismiss()
        }
      }
      Shortcut { sequences: ["F1", "Ctrl+/", "Ctrl+?"]; onActivated: root.helpOpen = !root.helpOpen }
      Shortcut { sequences: ["Ctrl+K", "Ctrl+P"]; onActivated: root.focusSearch() }
      Shortcut { sequences: ["Ctrl+Tab", "Ctrl+PgDown"]; onActivated: root.cycleTool(1) }
      Shortcut { sequences: ["Ctrl+Shift+Tab", "Ctrl+PgUp"]; onActivated: root.cycleTool(-1) }
      Shortcut { sequence: "Ctrl+Shift+C"; onActivated: root.copyOutput() }
      Shortcut { sequence: "Ctrl+Shift+V"; onActivated: root.pasteShortcut() }
      Shortcut { sequence: "Ctrl+B"; onActivated: root.togglePin(root.toolId) }
      Shortcut { sequence: "Ctrl+L"; onActivated: { inputEd.text = ""; input2Ed.text = ""; root.focusInput() } }
      Shortcut {
        sequence: "Ctrl+Return"
        onActivated: {
          if (root.kind === "generator") { if (root.toolId === "lorem") root.setOpt("seed", Date.now() % 100000); else root.compute() }
          else if (root.toolId === "chains") { if (chainLoader.item) chainLoader.item.inputEditor.text = root.chainResult.output || "" }
          else root.useOutputAsInput()
        }
      }
      Shortcut { sequence: "Ctrl+D"; enabled: root.clipTool !== "" || root.clipImage !== ""; onActivated: root.loadClipboardSuggestion() }
      Shortcut { sequence: "Ctrl+Shift+S"; enabled: root.hasSample || root.sampleShown; onActivated: root.loadSample() }
      Repeater {
        model: root.tools.filter(function (t) { return t.shortcut })
        delegate: Item {
          id: shortcutHost
          required property var modelData
          Shortcut {
            sequence: shortcutHost.modelData.shortcut
            onActivated: root.selectTool(shortcutHost.modelData.id)
          }
        }
      }

      RowLayout {
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
        spacing: Style.spacing.panelPadding

        // ------------------------------------------------ sidebar
        Sidebar {
          id: sidebar
          dk: root
          Layout.preferredWidth: Style.space(232)
          Layout.minimumWidth: Style.space(232)
          Layout.maximumWidth: Style.space(232)
          Layout.fillHeight: true
        }

        Rectangle { Layout.fillHeight: true; implicitWidth: 1; color: root.faint }

        // ------------------------------------------------ main
        ColumnLayout {
          Layout.fillWidth: true
          Layout.fillHeight: true
          // Takes what the sidebar leaves; its content wraps or elides.
          Layout.minimumWidth: 0
          Layout.preferredWidth: 100
          clip: true
          spacing: Style.spacing.lg

          // header
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.spacing.lg
            PlainText {
              text: root.tool.badge
              color: root.accent
              font.bold: true
              font.pixelSize: Style.font.title
              Layout.alignment: Qt.AlignTop
            }
            ColumnLayout {
              spacing: Style.spacing.xxs
              Layout.fillWidth: true
              Layout.minimumWidth: 0
              RowLayout {
                spacing: Style.spacing.md
                PlainText { text: root.tool.name; font.pixelSize: Style.font.title; font.bold: true }
                PlainText {
                  visible: root.pinned.indexOf(root.toolId) !== -1
                  text: "★"
                  color: root.accent
                }
              }
              PlainText {
                Layout.fillWidth: true
                text: root.tool.description
                color: root.dim
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }
            PlainText {
              // A fixed cap: bounding it by its own row's width makes the row
              // lay itself out again every time the text changes.
              Layout.maximumWidth: Style.space(520)
              Layout.minimumWidth: 0
              elide: Text.ElideRight
              horizontalAlignment: Text.AlignRight
              text: root.toast || (root.jobBusy && !root.infoText ? "Working…" : root.infoText)
              color: root.toast ? root.accent : (root.infoUrgent ? root.urgent : root.dim)
              font.pixelSize: Style.font.bodySmall
              font.bold: root.infoUrgent && !root.toast
            }
            Button {
              visible: root.hasSample || root.sampleShown
              text: root.sampleShown ? "Undo sample" : "Sample"
              bordered: true
              foreground: root.sampleShown ? root.accent : root.foreground
              accent: root.accent
              tooltipText: root.sampleShown ? "Put your input back (Ctrl+⇧S)" : "Load an example (Ctrl+⇧S)"
              onClicked: root.loadSample()
            }
            Button {
              visible: Tools.chainable(root.tool)
              text: "⛓ Chain"
              bordered: true
              foreground: root.foreground
              accent: root.accent
              tooltipText: "Start a chain with this tool and this input"
              onClicked: root.chainFromHere()
            }
          }

          // clipboard suggestion
          BorderSurface {
            Layout.fillWidth: true
            visible: root.clipTool !== "" || root.clipImage !== ""
            implicitHeight: clipRow.implicitHeight + Style.spacing.md * 2
            color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.10)
            radius: Style.cornerRadius
            RowLayout {
              id: clipRow
              anchors.fill: parent
              anchors.leftMargin: Style.spacing.rowPaddingX
              anchors.rightMargin: Style.spacing.sm
              PlainText {
                Layout.fillWidth: true
                elide: Text.ElideRight
                text: root.clipImage !== "" ? "Clipboard holds an image (" + root.clipImage + ")"
                  : "Clipboard looks like " + Tools.toolById(root.clipTool).name + ":  " + root.clipText.replace(/\s+/g, " ").slice(0, 80)
              }
              Button {
                visible: root.clipImage !== ""
                text: "Read QR code  (Ctrl+D)"; foreground: root.foreground; accent: root.accent; bordered: true
                onClicked: root.loadClipboardSuggestion()
              }
              Button {
                visible: root.clipImage !== ""
                text: "Encode as data: URI"; foreground: root.foreground; accent: root.accent; bordered: true
                onClicked: { root.clipImage = ""; root.imageFromClipboard() }
              }
              Button {
                visible: root.clipTool !== ""
                text: "Load  (Ctrl+D)"; foreground: root.foreground; accent: root.accent; bordered: true
                onClicked: root.loadClipboardSuggestion()
              }
              Button { text: "✕"; foreground: root.dim; onClicked: { root.clipTool = ""; root.clipImage = "" } }
            }
          }

          // ---------------------------------------------- views (chains, history)
          Loader {
            id: chainLoader
            Layout.fillWidth: true
            Layout.fillHeight: true
            active: root.toolId === "chains"
            visible: active
            sourceComponent: ChainView { dk: root }
            onLoaded: {
              var input = root.chainInputs[root.chainId]
              if (input === undefined && root.chain) input = root.chain.input !== undefined ? root.chain.input : (root.chainId === "builtin-jwtyaml" ? Tools.SAMPLE_JWT : "")
              item.inputEditor.text = input || ""
            }
          }
          Loader {
            Layout.fillWidth: true
            Layout.fillHeight: true
            active: root.toolId === "history"
            visible: active
            sourceComponent: HistoryView { dk: root }
          }

          // ---------------------------------------------- options
          Flow {
            Layout.fillWidth: true
            spacing: Style.spacing.md
            visible: root.kind !== "view" && (root.tool.modes.length > 0 || specialOptions.visible || genericOptions.visible)

            ButtonGroup {
              visible: root.tool.modes.length > 0
              options: root.tool.modes
              value: root.mode
              foreground: root.foreground
              accent: root.accent
              onChanged: function (value) { root.setMode(value) }
            }

            // Tool-specific controls that are not declarative options.
            Row {
              id: specialOptions
              spacing: Style.spacing.md
              visible: ["cron", "uuid", "password", "time", "lorem", "qrread", "base64img"].indexOf(root.toolId) !== -1

              Repeater {
                model: root.toolId === "cron" ? Tools.CRON_PRESETS : []
                delegate: Button {
                  required property var modelData
                  text: modelData.label
                  bordered: true
                  selected: inputEd.text.trim() === modelData.expr
                  foreground: root.foreground
                  accent: root.accent
                  tooltipText: modelData.expr
                  onClicked: { inputEd.text = modelData.expr; root.focusInput() }
                }
              }
              PlainText { visible: root.toolId === "password"; text: root.mode === "pin" ? "Digits" : "Length"; color: root.dim; anchors.verticalCenter: parent.verticalCenter }
              TextField {
                id: lengthField
                visible: root.toolId === "password"
                width: Style.space(70)
                text: String(Tools.PASSWORD_LENGTH_DEFAULT)
                foreground: root.foreground
                accent: root.accent
                validator: IntValidator { bottom: 1; top: Tools.PASSWORD_LENGTH_MAX }
                onTextChanged: if (root.toolId === "password") root.compute()
              }
              PlainText { visible: root.toolId === "uuid" || root.toolId === "password"; text: "Count"; color: root.dim; anchors.verticalCenter: parent.verticalCenter }
              TextField {
                id: countField
                visible: root.toolId === "uuid" || root.toolId === "password"
                width: Style.space(70)
                text: "5"
                foreground: root.foreground
                accent: root.accent
                validator: IntValidator { bottom: 1; top: root.toolId === "password" ? Tools.PASSWORD_COUNT_MAX : Tools.UUID_MAX }
                onTextChanged: if (root.toolId === "uuid" || root.toolId === "password") root.compute()
              }
              Button {
                // ULIDs are uppercase by definition.
                visible: root.toolId === "uuid" && root.mode !== "ulid"
                text: "UPPER"
                bordered: true
                selected: root.upper
                foreground: root.foreground
                accent: root.accent
                onClicked: { root.upper = !root.upper; root.compute() }
              }
              Button {
                id: generateButton
                visible: root.kind === "generator"
                text: "Generate  (Ctrl+↵)"
                bordered: true
                focusable: true
                foreground: root.foreground
                accent: root.accent
                onClicked: root.toolId === "lorem" ? root.setOpt("seed", Date.now() % 100000) : root.compute()
              }
              Button {
                visible: root.toolId === "time"
                text: "Now"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                onClicked: { inputEd.text = String(Math.floor(Date.now() / 1000)) }
              }
              Button {
                visible: root.takesImage
                text: "From clipboard  (Ctrl+⇧V)"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                onClicked: root.imageFromClipboard()
              }
            }

            OptionBar {
              id: genericOptions
              width: Math.max(implicitWidth, parent.width * (options.some(function (o) { return o.grow }) ? 1 : 0))
              options: Tools.toolOptions(root.toolId, root.mode)
              values: root.opts
              revision: root.optsRevision
              onChanged: function (id, value) { root.setOpt(id, value, typeof value === "string") }
            }
          }

          // regex pattern row
          RowLayout {
            Layout.fillWidth: true
            visible: root.toolId === "regex"
            spacing: Style.spacing.md
            PlainText { text: "/"; color: root.dim; font.pixelSize: Style.font.title }
            TextField {
              id: patternField
              Layout.fillWidth: true
              placeholderText: "Pattern, e.g. (\\w+)@(\\w+)\\.com"
              foreground: root.foreground
              accent: root.accent
              font.family: root.fontFamily
              onTextChanged: root.compute()
            }
            PlainText { text: "/"; color: root.dim; font.pixelSize: Style.font.title }
            TextField {
              id: flagsField
              Layout.preferredWidth: Style.space(70)
              placeholderText: "flags"
              text: "g"
              foreground: root.foreground
              accent: root.accent
              font.family: root.fontFamily
              validator: RegularExpressionValidator { regularExpression: /[dgimsuvy]*/ }
              onTextChanged: root.compute()
            }
            Button {
              text: "Replace"
              bordered: true
              selected: root.useReplace
              foreground: root.foreground
              accent: root.accent
              onClicked: { root.useReplace = !root.useReplace; root.compute() }
            }
          }

          TextField {
            id: replField
            visible: root.toolId === "regex" && root.useReplace
            Layout.fillWidth: true
            placeholderText: "Replacement ($1, $<name>, $&)"
            foreground: root.foreground
            accent: root.accent
            font.family: root.fontFamily
            onTextChanged: root.compute()
          }

          // Password character sets (password mode only)
          RowLayout {
            Layout.fillWidth: true
            visible: root.toolId === "password"
            spacing: Style.spacing.md
            Repeater {
              model: root.mode === "password" ? [["A-Z", "pwUpper", "uppercase letters"], ["a-z", "pwLower", "lowercase letters"],
                                                 ["0-9", "pwDigits", "digits"], ["!@#", "pwSpecial", "special characters (!@#$%^&*)"]] : []
              delegate: Button {
                required property var modelData
                text: modelData[0]; bordered: true; selected: root[modelData[1]]
                foreground: root.foreground; accent: root.accent
                tooltipText: "Include " + modelData[2]
                onClicked: { root[modelData[1]] = !root[modelData[1]]; root.compute() }
              }
            }
            TextField {
              id: excludeField
              Layout.fillWidth: true
              placeholderText: "Exclude characters (separate with comma), e.g. O,0,l,1"
              foreground: root.foreground
              accent: root.accent
              font.family: root.fontFamily
              onTextChanged: if (root.toolId === "password") root.compute()
            }
          }

          // ---------------------------------------------- editors
          RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: 100
            spacing: Style.spacing.lg
            visible: root.kind !== "view"

            Pane {
              visible: root.usesInput
              Layout.horizontalStretchFactor: root.toolId === "cron" ? 2 : (root.takesImage ? 1 : 1)
              title: root.toolId === "diff" ? "Original" : (root.toolId === "regex" ? "Test text"
                : root.takesImage ? "Image path" : (root.toolId === "jwt" && root.mode === "sign" ? "Payload" : "Input"))
              status: inputEd.text.length > 0 ? inputEd.text.length + " chars" + (inputEd.text.indexOf("\n") !== -1 ? " · " + (inputEd.text.split("\n").length) + " lines" : "") : ""
              Editor {
                id: inputEd
                anchors.fill: parent
                placeholderText: Tools.placeholderFor(root.toolId, root.mode)
                onTextChanged: root.compute()
              }
              actions: [
                Button { text: "Paste"; foreground: root.dim; tooltipText: "Ctrl+⇧V"; onClicked: root.pasteShortcut() },
                Button { text: "Clear"; foreground: root.dim; tooltipText: "Ctrl+L"; onClicked: { inputEd.text = ""; inputEd.area.forceActiveFocus() } }
              ]
            }

            Pane {
              visible: root.toolId === "diff"
              Layout.horizontalStretchFactor: 1
              title: "Changed"
              Editor {
                id: input2Ed
                anchors.fill: parent
                placeholderText: "Changed text…"
                onTextChanged: root.compute()
              }
              actions: [
                Button { text: "Paste"; foreground: root.dim; onClicked: root.readClipboard("paste2") },
                Button { text: "Swap"; foreground: root.dim; onClicked: { var a = inputEd.text; inputEd.text = input2Ed.text; input2Ed.text = a } }
              ]
            }

            Pane {
              id: outputPane
              visible: root.toolId !== "diff"
              Layout.horizontalStretchFactor: root.toolId === "cron" ? 3 : 1
              title: root.outHtml !== "" ? "Preview" : (root.tool.kind === "image" && root.toolId !== "qrread" ? "Image" : "Output")
              status: root.outText && root.outPairs.length === 0 && root.outHtml === "" && root.tool.kind !== "image"
                ? root.outText.length + " chars" + (root.outText.indexOf("\n") !== -1 ? " · " + root.outText.split("\n").length + " lines" : "") : ""

              // Colour swatch with white and black text on it
              Rectangle {
                visible: root.toolId === "color" && root.swatch !== null
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: visible ? Style.space(64) : 0
                radius: Style.cornerRadius
                border.width: 1
                border.color: root.faint
                Grid {
                  anchors.fill: parent
                  anchors.margins: 1
                  clip: true
                  visible: root.swatch !== null && root.swatch.a < 1
                  columns: Math.ceil(width / 8)
                  Repeater {
                    model: parent.visible ? Math.min(3000, parent.columns * Math.ceil(parent.height / 8)) : 0
                    Rectangle {
                      required property int index
                      width: 8; height: 8
                      color: (Math.floor(index / parent.columns) + index % parent.columns) % 2 ? "#bbbbbb" : "#ffffff"
                    }
                  }
                }
                Rectangle {
                  anchors.fill: parent
                  anchors.margins: 1
                  radius: Style.cornerRadius
                  color: root.swatch ? Qt.rgba(root.swatch.r, root.swatch.g, root.swatch.b, root.swatch.a) : "transparent"
                  Row {
                    anchors.centerIn: parent
                    spacing: Style.space(40)
                    PlainText { text: "White text"; color: "#ffffff"; font.bold: true }
                    PlainText { text: "Black text"; color: "#000000"; font.bold: true }
                  }
                }
              }

              // Rich preview. The HTML comes from Tools.markdownHtml or
              // Tools.htmlSanitize, which escape all text and emit no <img>.
              BorderSurface {
                anchors.fill: parent
                visible: root.outHtml !== ""
                color: root.fieldFill
                borderSpec: Border.controlSpec("normal", root.foreground, root.accent)
                radius: Style.cornerRadius
                QQC.ScrollView {
                  id: previewScroll
                  anchors.fill: parent
                  anchors.margins: Style.spacing.md
                  clip: true
                  TextEdit {
                    width: previewScroll.availableWidth
                    readOnly: true
                    selectByMouse: true
                    textFormat: TextEdit.RichText
                    wrapMode: TextEdit.Wrap
                    text: root.outHtml
                    color: root.foreground
                    font.pixelSize: Style.font.body
                    selectionColor: Style.selectionFillFor(root.foreground, root.accent)
                    selectedTextColor: root.foreground
                    onLinkActivated: function (link) {
                      if (/^(https?:|mailto:)/i.test(link)) Qt.openUrlExternally(link)
                    }
                    HoverHandler { cursorShape: parent.hoveredLink ? Qt.PointingHandCursor : Qt.IBeamCursor }
                  }
                }
              }

              // Image tools: the picture, with its details or decoded text below.
              ColumnLayout {
                anchors.fill: parent
                visible: root.tool.kind === "image"
                spacing: Style.spacing.md
                ImageView {
                  Layout.fillWidth: true
                  Layout.fillHeight: true
                  Layout.preferredHeight: 3
                  path: root.outImage
                  pixelated: root.toolId === "qr"
                  placeholder: root.errText ? "" : root.toolId === "qrread" ? "Copy an image with a QR code or barcode in it, then press From clipboard."
                    : root.toolId === "qr" ? "Type something to encode." : root.mode === "encode" ? "Copy an image, then press From clipboard, or type a path."
                    : "Paste a data: URI to see the picture."
                }
                PairList {
                  Layout.fillWidth: true
                  Layout.fillHeight: true
                  Layout.preferredHeight: 2
                  visible: root.outPairs.length > 0
                  pairs: root.outPairs
                  onCopyRequested: function (value, label) { root.copy(value, label) }
                }
                Editor {
                  Layout.fillWidth: true
                  Layout.fillHeight: true
                  Layout.preferredHeight: 1
                  visible: root.outPairs.length === 0 && root.toolId === "qrread" && root.outText !== ""
                  readOnly: true
                  text: root.toolId === "qrread" ? root.outText : ""
                }
              }

              Editor {
                id: outputEd
                anchors.fill: parent
                anchors.topMargin: root.toolId === "color" && root.swatch !== null ? Style.space(64) + Style.spacing.md : 0
                visible: root.outPairs.length === 0 && root.outHtml === "" && root.tool.kind !== "image"
                readOnly: true
                text: root.outText
                placeholderText: root.errText ? "" : root.kind === "generator" ? "Press Generate" : ""
              }
              PairList {
                anchors.fill: parent
                anchors.topMargin: root.toolId === "color" && root.swatch !== null ? Style.space(64) + Style.spacing.md : 0
                visible: root.outPairs.length > 0 && root.tool.kind !== "image"
                pairs: root.outPairs
                onCopyRequested: function (value, label) { root.copy(value, label) }
              }
              actions: [
                Button {
                  visible: root.nextTool !== ""
                  text: "→ " + (root.nextTool ? Tools.toolById(root.nextTool).name : "")
                  foreground: root.accent
                  tooltipText: "The output looks like " + (root.nextTool ? Tools.toolById(root.nextTool).name : "") + ": open it there"
                  onClicked: root.sendToTool(root.nextTool)
                },
                Button {
                  visible: root.kind === "text" && root.outPairs.length === 0 && root.outHtml === "" && root.toolId !== "cron"
                  text: "→ Input"; foreground: root.dim; tooltipText: "Use output as input (Ctrl+↵)"
                  onClicked: root.useOutputAsInput()
                },
                Button {
                  visible: root.tool.kind === "image" && root.outImage !== "" && root.toolId !== "qrread"
                  text: "Copy image"; foreground: root.dim
                  onClicked: root.imageAction("image-copy", root.toolId === "qr" ? "QR code" : "image")
                },
                Button {
                  visible: root.tool.kind === "image" && root.outImage !== "" && root.toolId !== "qrread"
                  text: "Save"; foreground: root.dim; tooltipText: "Save to your Pictures folder"
                  onClicked: root.imageAction("image-save", "image")
                },
                Button {
                  text: root.toolId === "qr" ? "Copy text" : (root.toolId === "base64img" ? "Copy URI" : "Copy")
                  foreground: root.accent
                  tooltipText: "Ctrl+⇧C"
                  onClicked: root.copy(root.outText)
                }
              ]
            }
          }

          // diff result
          Pane {
            visible: root.toolId === "diff"
            title: "Diff"
            BorderSurface {
              anchors.fill: parent
              color: root.fieldFill
              borderSpec: Border.controlSpec("normal", root.foreground, root.accent)
              radius: Style.cornerRadius
              ListView {
                id: diffView
                anchors.fill: parent
                anchors.margins: Style.spacing.sm
                clip: true
                model: root.diffRows
                boundsBehavior: Flickable.StopAtBounds
                QQC.ScrollBar.vertical: QQC.ScrollBar {}
                delegate: Rectangle {
                  required property var modelData
                  width: diffView.width
                  height: diffLine.implicitHeight + 2
                  color: modelData.t === "+" ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.14)
                    : modelData.t === "-" ? Qt.rgba(root.urgent.r, root.urgent.g, root.urgent.b, 0.16) : "transparent"
                  PlainText {
                    id: diffLine
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: Style.spacing.sm
                    anchors.verticalCenter: parent.verticalCenter
                    wrapMode: Text.WrapAnywhere
                    text: parent.modelData.t + " " + parent.modelData.s
                    color: parent.modelData.t === "+" ? root.accent : parent.modelData.t === "-" ? root.urgent : root.dim
                  }
                }
              }
            }
            actions: [
              Button { text: "Copy"; foreground: root.accent; onClicked: root.copy(root.outText, "diff") }
            ]
          }

          PlainText {
            Layout.fillWidth: true
            visible: root.errText !== "" && root.kind !== "view"
            text: "⚠  " + root.errText
            color: root.urgent
            wrapMode: Text.Wrap
          }

          // footer: the keys that matter here
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.spacing.xl
            Repeater {
              model: [["Ctrl+K", "search"], ["Ctrl+⇧V", "paste"], ["Ctrl+⇧C", "copy"],
                      [root.kind === "generator" ? "Ctrl+↵" : "Ctrl+↵", root.kind === "generator" ? "generate" : "output → input"],
                      ["Ctrl+⇧S", "sample"], ["Ctrl+B", "pin"], ["F1", "all keys"]]
              delegate: Row {
                required property var modelData
                spacing: Style.spacing.xs
                PlainText { text: modelData[0]; color: root.dim; font.pixelSize: Style.font.caption; font.bold: true }
                PlainText { text: modelData[1]; color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.4); font.pixelSize: Style.font.caption }
              }
            }
            Item { Layout.fillWidth: true }
            PlainText { text: "offline · nothing you type is saved"; color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35); font.pixelSize: Style.font.caption }
          }
        }
      }

      HelpOverlay {
        anchors.fill: parent
        visible: root.helpOpen
        dk: root
        onCloseRequested: root.helpOpen = false
      }
    }
  }
}
