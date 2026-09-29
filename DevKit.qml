import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Tools.js" as Tools

// DevKit: a small floating window of everyday developer tools. Everything is
// computed locally inside the shell; nothing is sent over the network and
// nothing typed here is written to disk.
Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false

  readonly property string pluginId: (manifest && manifest.id) || "coding-sparrow.devkit"
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")

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

  readonly property int preferredWidth: Style.space(1080)
  readonly property int preferredHeight: Style.space(680)

  // ---- tool state
  readonly property var tools: Tools.TOOLS
  property string toolId: "json"
  readonly property var tool: Tools.toolById(toolId)
  property string mode: ""
  property bool useReplace: false
  property bool upper: false
  property var stash: ({})           // per-tool editor state, session only

  // ---- results
  property string outText: ""
  property string errText: ""
  property string infoText: ""
  property bool infoUrgent: false
  property var outPairs: []
  property var diffRows: []

  // ---- clipboard hint
  property string clipText: ""
  property string clipTool: ""
  property string toast: ""

  // ---- CSPRNG pool for UUIDs, filled only from python's `secrets`
  // (bin/devkit-hash random). There is no other randomness source: when the
  // pool is short, generation waits for the helper instead of falling back.
  property var randomPool: []
  property int randomWanted: 0         // bytes a pending UUID request needs
  property bool randomFailed: false
  readonly property int randomPoolTarget: 8192
  readonly property int randomRequestMax: 65536

  // ---- regex worker state (see bin/devkit-regex)
  property bool regexBusy: false

  // ------------------------------------------------------------ lifecycle

  property bool windowRuleReady: false
  property string pendingPayload: ""

  function open(payloadJson) {
    if (!windowRuleReady) {
      pendingPayload = payloadJson || "{}"
      if (!windowRuleProc.running) windowRuleProc.running = true
      return
    }
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }
    opened = true
    window.visible = true
    if (payload.tool) selectTool(String(payload.tool))
    if (payload.mode) mode = String(payload.mode)
    if (payload.input !== undefined) inputEd.text = String(payload.input)
    if (payload.input2 !== undefined) input2Ed.text = String(payload.input2)
    if (payload.count !== undefined) countField.text = String(Tools.uuidCount(payload.count))
    if (payload.pattern !== undefined) patternField.text = String(payload.pattern)
    if (payload.flags !== undefined) flagsField.text = String(payload.flags)
    if (payload.replacement !== undefined) { replField.text = String(payload.replacement); useReplace = true }
    if (payload.tool || payload.mode) compute()
    readClipboard(payload.action === "clipboard" ? "load" : "hint")
    if (randomPool.length < randomPoolTarget) requestRandom(randomPoolTarget)
    Qt.callLater(focusInput)
  }

  function close() {
    opened = false
    window.visible = false
    clipTool = ""
    clipText = ""
  }

  function dismiss() {
    close()
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }

  function focusInput() {
    if (toolId === "regex") patternField.forceActiveFocus()
    else if (toolId === "uuid") generateButton.forceActiveFocus()
    else {
      inputEd.area.forceActiveFocus()
      inputEd.area.cursorPosition = inputEd.area.length
    }
  }

  // ------------------------------------------------------------ tools

  function saveStash() {
    var next = ({})
    for (var k in stash) next[k] = stash[k]
    next[toolId] = {
      input: inputEd.text, input2: input2Ed.text, mode: mode,
      pattern: patternField.text, flags: flagsField.text, replacement: replField.text,
      useReplace: useReplace, count: countField.text, upper: upper
    }
    stash = next
  }

  property bool initialized: false

  function selectTool(id) {
    if (initialized && id === toolId) { focusInput(); return }
    if (initialized) saveStash()
    initialized = true
    var t = Tools.toolById(id)
    var s = stash[t.id] || ({})
    toolId = t.id
    mode = s.mode || (t.modes.length ? t.modes[0].value : "")
    useReplace = !!s.useReplace
    upper = !!s.upper
    inputEd.text = s.input || ""
    input2Ed.text = s.input2 || ""
    patternField.text = s.pattern !== undefined ? s.pattern : ""
    flagsField.text = s.flags !== undefined ? s.flags : "g"
    replField.text = s.replacement || ""
    countField.text = s.count || "5"
    compute()
    Qt.callLater(focusInput)
  }

  function cycleTool(delta) {
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].id === toolId) {
        selectTool(tools[(i + delta + tools.length) % tools.length].id)
        return
      }
    }
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

  function computeUuid() {
    diffRows = []
    outPairs = []
    infoUrgent = false
    var need = Tools.uuidBytesNeeded(countField.text)
    var bytes = takeRandom(need)
    if (!bytes) {
      // Defer until the helper delivers enough secure bytes.
      randomWanted = need
      outText = ""
      errText = randomFailed ? "Secure random source (bin/devkit-hash) is unavailable" : ""
      infoText = randomFailed ? "" : "Generating…"
      requestRandom(Math.max(need, randomPoolTarget))
      return
    }
    randomWanted = 0
    applyResult(Tools.run("uuid", { mode: mode, count: countField.text, upper: upper,
                                    nowMs: Date.now(), randomBytes: bytes }))
  }

  function applyResult(r) {
    outText = r.output
    errText = r.error
    infoText = r.info
    infoUrgent = r.urgent === true
    outPairs = r.pairs || []
    diffRows = r.rows || []
  }

  function compute() {
    if (toolId === "hash") { computeHash(); return }
    if (toolId === "uuid") { computeUuid(); return }
    if (toolId === "regex") { computeRegex(); return }
    applyResult(Tools.run(toolId, {
      input: inputEd.text, input2: input2Ed.text, mode: mode,
      nowMs: Date.now()
    }))
  }

  // User regexes never run in the shell: they go to a separate, killable
  // worker process with a deadline. One request in flight at a time; edits
  // made meanwhile are sent when it returns.
  function computeRegex() {
    diffRows = []
    outPairs = []
    infoUrgent = false
    if (patternField.text === "") {
      outText = ""; errText = ""; infoText = "Enter a pattern"
      return
    }
    regexDebounce.restart()
  }

  function sendRegex() {
    if (toolId !== "regex") return
    if (regexProc.running) { regexProc.rerun = true; return }
    regexProc.payload = JSON.stringify({
      pattern: patternField.text, flags: flagsField.text, input: inputEd.text,
      replacement: replField.text, useReplace: useReplace
    })
    regexBusy = true
    infoText = "Matching…"
    regexProc.stdinEnabled = true
    regexProc.running = true
    regexWatchdog.restart()
  }

  function computeHash() {
    errText = ""
    diffRows = []
    if (inputEd.text === "") {
      outText = ""; outPairs = []; infoText = ""
      return
    }
    hashDebounce.restart()
  }

  function useOutputAsInput() {
    if (!outText) return
    inputEd.text = outText
    inputEd.area.forceActiveFocus()
  }

  // ------------------------------------------------------------ clipboard

  function copy(text, label) {
    if (!text) return
    copyProc.payload = text
    copyProc.stdinEnabled = true
    copyProc.running = true
    flash("Copied " + (label || "output"))
  }

  function flash(message, ms) {
    toast = message
    toastTimer.interval = ms || 1600
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

  function handleClipboardOutput(raw, intent) {
    var nl = raw.indexOf("\n")
    var status = nl === -1 ? raw : raw.slice(0, nl)
    var text = nl === -1 ? "" : raw.slice(nl + 1)
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
    if (intent === "paste2") {
      input2Ed.text = text
      input2Ed.area.forceActiveFocus()
      return
    }
    if (intent === "paste") {
      inputEd.text = text
      inputEd.area.forceActiveFocus()
      return
    }
    var detected = Tools.detect(text)
    if (intent === "load" && detected) {
      clipTool = ""
      selectTool(detected)
      if (detected === "base64") mode = "decode"
      if (detected === "url" && /^https?:/.test(text.trim())) mode = "parse"
      else if (detected === "url") mode = "decode"
      inputEd.text = text.trim()
      compute()
      return
    }
    // Only suggest when it would change something.
    clipText = text
    clipTool = detected && !(detected === toolId && inputEd.text.trim() === text.trim()) ? detected : ""
  }

  function loadClipboardSuggestion() {
    if (!clipTool) return
    handleClipboard(clipText, "load")
  }

  // ------------------------------------------------------------ processes

  Process {
    id: windowRuleProc
    command: [root.pluginDir + "/bin/devkit-window", String(root.preferredWidth), String(root.preferredHeight)]
    onExited: function () {
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

  // Belt and braces: devkit-clip enforces its own 2 s deadline.
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
        if (regexProc.rerun || root.toolId !== "regex") return
        var lines = String(text || "").split("\n").filter(function (l) { return l.trim() })
        try {
          var r = JSON.parse(lines[lines.length - 1])
          root.applyResult({ output: String(r.output || ""), error: String(r.error || ""),
                             info: String(r.info || ""), urgent: r.timeout === true })
        } catch (e) {
          root.applyResult({ output: "", error: "The regex worker returned no result", info: "" })
        }
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

  // Belt and braces: devkit-regex kills its worker after 1.5 s.
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
    id: hashDebounce
    interval: 150
    onTriggered: {
      hashProc.payload = inputEd.text
      hashProc.stdinEnabled = true
      if (hashProc.running) hashProc.rerun = true
      else hashProc.running = true
    }
  }

  Process {
    id: hashProc
    property string payload: ""
    property bool rerun: false
    command: [root.pluginDir + "/bin/devkit-hash"]
    stdinEnabled: true
    onStarted: {
      write(payload)
      payload = ""
      stdinEnabled = false
    }
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (root.toolId !== "hash") return
        var lines = String(text || "").split("\n").filter(function (l) { return l.trim() })
        if (!lines.length) return
        try {
          var h = JSON.parse(lines[lines.length - 1])
          if (h.error) { root.errText = h.error; return }
          root.outPairs = [["MD5", h.md5], ["SHA-1", h.sha1], ["SHA-256", h.sha256], ["SHA-512", h.sha512]]
          root.outText = root.outPairs.map(function (p) { return (p[0] + "         ").slice(0, 9) + p[1] }).join("\n")
          root.infoText = h.bytes + " bytes (UTF-8)"
        } catch (e) {}
      }
    }
    onExited: {
      if (!rerun) return
      rerun = false
      hashDebounce.restart()
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
      if (root.randomWanted > 0 && root.toolId === "uuid") {
        if (root.randomPool.length >= root.randomWanted) root.computeUuid()
        else if (!root.randomFailed) root.requestRandom(root.randomWanted)
        else root.computeUuid()
      }
    }
  }

  Timer { id: toastTimer; interval: 1600; onTriggered: root.toast = "" }

  // Keep "now" live in the Timestamp tool when the input is empty.
  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.toolId === "time" && inputEd.text.trim() === ""
    onTriggered: root.compute()
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
    implicitWidth: root.preferredWidth
    implicitHeight: root.preferredHeight
    minimumSize: Qt.size(Style.space(760), Style.space(480))

    onVisibleChanged: if (!visible && root.opened) root.dismiss()

    BorderSurface {
      anchors.fill: parent
      color: root.background
      borderSpec: Border.surfaceSpec("menu", "border", root.border, Math.max(1, Style.normalBorderWidth))
      radius: Style.cornerRadius

      Shortcut { sequence: "Escape"; onActivated: root.dismiss() }
      Shortcut { sequences: ["Ctrl+Tab", "Ctrl+PgDown"]; onActivated: root.cycleTool(1) }
      Shortcut { sequences: ["Ctrl+Shift+Tab", "Ctrl+PgUp"]; onActivated: root.cycleTool(-1) }
      Shortcut { sequence: "Ctrl+Shift+C"; onActivated: root.copy(root.outText) }
      Shortcut { sequence: "Ctrl+Shift+V"; onActivated: root.readClipboard("paste") }
      Shortcut { sequence: "Ctrl+L"; onActivated: { inputEd.text = ""; input2Ed.text = ""; root.focusInput() } }
      Shortcut { sequence: "Ctrl+Return"; onActivated: root.toolId === "uuid" ? root.compute() : root.useOutputAsInput() }
      Shortcut { sequence: "Ctrl+D"; enabled: root.clipTool !== ""; onActivated: root.loadClipboardSuggestion() }
      Repeater {
        model: root.tools.length
        delegate: Item {
          id: shortcutHost
          required property int index
          Shortcut {
            sequence: "Ctrl+" + ((shortcutHost.index + 1) % 10)
            onActivated: root.selectTool(root.tools[shortcutHost.index].id)
          }
        }
      }

      RowLayout {
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
        spacing: Style.spacing.panelPadding

        // ------------------------------------------------ sidebar
        ColumnLayout {
          Layout.preferredWidth: Style.space(200)
          Layout.maximumWidth: Style.space(200)
          Layout.fillWidth: false
          Layout.fillHeight: true
          spacing: Style.spacing.xs

          PlainText {
            text: "DevKit"
            font.pixelSize: Style.font.heading
            font.bold: true
            color: root.accent
            Layout.bottomMargin: Style.spacing.lg
          }

          Repeater {
            model: root.tools
            delegate: Button {
              required property var modelData
              required property int index
              Layout.fillWidth: true
              leftAlign: true
              selected: root.toolId === modelData.id
              text: (modelData.badge + "    ").slice(0, 4) + " " + modelData.name
              foreground: root.foreground
              accent: root.accent
              tooltipText: "Ctrl+" + ((index + 1) % 10)
              onClicked: root.selectTool(modelData.id)
            }
          }

          Item { Layout.fillHeight: true }

          PlainText {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            color: root.dim
            font.pixelSize: Style.font.caption
            lineHeight: 1.25
            text: "Ctrl+1…0   switch tool\nCtrl+Tab   next tool\nCtrl+⇧V    paste input\nCtrl+⇧C    copy output\nCtrl+↵     output → input\nCtrl+L     clear\nEsc        close"
          }
        }

        Rectangle { Layout.fillHeight: true; implicitWidth: 1; color: root.faint }

        // ------------------------------------------------ main
        ColumnLayout {
          Layout.fillWidth: true
          Layout.fillHeight: true
          spacing: Style.spacing.lg

          // header
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.spacing.lg
            ColumnLayout {
              spacing: Style.spacing.xxs
              PlainText { text: root.tool.name; font.pixelSize: Style.font.title; font.bold: true }
              PlainText { text: root.tool.description; color: root.dim; font.pixelSize: Style.font.caption }
            }
            Item { Layout.fillWidth: true }
            PlainText {
              Layout.maximumWidth: Math.max(Style.space(120), parent.width * 0.5)
              elide: Text.ElideRight
              horizontalAlignment: Text.AlignRight
              text: root.toast || root.infoText
              color: root.toast ? root.accent : (root.infoUrgent ? root.urgent : root.dim)
              font.pixelSize: Style.font.bodySmall
              font.bold: root.infoUrgent && !root.toast
            }
          }

          // clipboard suggestion
          BorderSurface {
            Layout.fillWidth: true
            visible: root.clipTool !== ""
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
                text: "Clipboard looks like " + Tools.toolById(root.clipTool).name
                  + ":  " + root.clipText.replace(/\s+/g, " ").slice(0, 80)
              }
              Button { text: "Load  (Ctrl+D)"; foreground: root.foreground; accent: root.accent; bordered: true; onClicked: root.loadClipboardSuggestion() }
              Button { text: "✕"; foreground: root.dim; onClicked: root.clipTool = "" }
            }
          }

          // options
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.spacing.md
            visible: root.tool.modes.length > 0 || root.toolId === "regex" || root.toolId === "time"

            ButtonGroup {
              visible: root.tool.modes.length > 0
              options: root.tool.modes
              value: root.mode
              foreground: root.foreground
              accent: root.accent
              onChanged: function (value) { root.mode = value; root.compute() }
            }

            // regex
            TextField {
              id: patternField
              visible: root.toolId === "regex"
              Layout.fillWidth: true
              placeholderText: "Pattern, e.g. (\\w+)@(\\w+)\\.com"
              foreground: root.foreground
              accent: root.accent
              font.family: root.fontFamily
              onTextChanged: root.compute()
            }
            TextField {
              id: flagsField
              visible: root.toolId === "regex"
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
              visible: root.toolId === "regex"
              text: "Replace"
              bordered: true
              selected: root.useReplace
              foreground: root.foreground
              accent: root.accent
              onClicked: { root.useReplace = !root.useReplace; root.compute() }
            }

            // uuid
            Item { visible: root.toolId === "uuid"; Layout.fillWidth: true }
            PlainText { visible: root.toolId === "uuid"; text: "Count"; color: root.dim }
            TextField {
              id: countField
              visible: root.toolId === "uuid"
              Layout.preferredWidth: Style.space(70)
              text: "5"
              foreground: root.foreground
              accent: root.accent
              validator: IntValidator { bottom: 1; top: 500 }
              onTextChanged: if (root.toolId === "uuid") root.compute()
            }
            Button {
              visible: root.toolId === "uuid"
              text: "UPPER"
              bordered: true
              selected: root.upper
              foreground: root.foreground
              accent: root.accent
              onClicked: { root.upper = !root.upper; root.compute() }
            }
            Button {
              id: generateButton
              visible: root.toolId === "uuid"
              text: "Generate  (Ctrl+↵)"
              bordered: true
              focusable: true
              foreground: root.foreground
              accent: root.accent
              onClicked: root.compute()
            }

            // time
            Button {
              visible: root.toolId === "time"
              text: "Now"
              bordered: true
              foreground: root.foreground
              accent: root.accent
              onClicked: { inputEd.text = String(Math.floor(Date.now() / 1000)) }
            }
            Item { visible: root.toolId === "time"; Layout.fillWidth: true }
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

          // editors
          RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: 100
            spacing: Style.spacing.lg

            Pane {
              visible: root.toolId !== "uuid"
              title: root.toolId === "diff" ? "Original" : (root.toolId === "regex" ? "Test text" : "Input")
              Editor {
                id: inputEd
                anchors.fill: parent
                placeholderText: root.tool.placeholder
                onTextChanged: root.compute()
              }
              actions: [
                Button { text: "Paste"; foreground: root.dim; onClicked: root.readClipboard("paste") },
                Button { text: "Clear"; foreground: root.dim; onClicked: { inputEd.text = ""; inputEd.area.forceActiveFocus() } }
              ]
            }

            Pane {
              visible: root.toolId === "diff"
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
              visible: root.toolId !== "diff"
              title: "Output"
              Editor {
                id: outputEd
                anchors.fill: parent
                visible: root.outPairs.length === 0
                readOnly: true
                text: root.outText
                textColor: root.foreground
              }
              PairList {
                anchors.fill: parent
                visible: root.outPairs.length > 0
                pairs: root.outPairs
              }
              actions: [
                Button {
                  visible: root.toolId !== "uuid" && root.toolId !== "hash" && root.outPairs.length === 0
                  text: "→ Input"; foreground: root.dim; tooltipText: "Use output as input (Ctrl+↵)"
                  onClicked: root.useOutputAsInput()
                },
                Button { text: "Copy"; foreground: root.accent; onClicked: root.copy(root.outText) }
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
            visible: root.errText !== ""
            text: "⚠  " + root.errText
            color: root.urgent
            wrapMode: Text.Wrap
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ components

  // All text here may come from the clipboard, so it must never be parsed as
  // rich text (which would honour <img src="file:///…">).
  component PlainText: Text {
    textFormat: Text.PlainText
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    color: root.foreground
  }

  component Pane: ColumnLayout {
    id: pane
    property string title: ""
    property alias actions: actionRow.children
    default property alias content: body.data
    Layout.fillWidth: true
    Layout.fillHeight: true
    // Equal preferred sizes make sibling panes split the space evenly
    // instead of by content width.
    Layout.preferredWidth: 100
    Layout.preferredHeight: 100
    spacing: Style.spacing.sm
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.spacing.xs
      PlainText { text: pane.title.toUpperCase(); color: root.dim; font.pixelSize: Style.font.caption; font.bold: true }
      Item { Layout.fillWidth: true }
      Row { id: actionRow; spacing: Style.spacing.xs }
    }
    Item {
      id: body
      Layout.fillWidth: true
      Layout.fillHeight: true
    }
  }

  component Editor: BorderSurface {
    id: ed
    property alias text: area.text
    property alias readOnly: area.readOnly
    property alias placeholderText: area.placeholderText
    property alias area: area
    property color textColor: root.foreground
    color: root.fieldFill
    borderSpec: Border.controlSpec(area.activeFocus && !area.readOnly ? "focus" : "normal", root.foreground, root.accent)
    radius: Style.cornerRadius

    QQC.ScrollView {
      anchors.fill: parent
      anchors.margins: Style.spacing.xs
      clip: true
      QQC.TextArea {
        id: area
        textFormat: TextEdit.PlainText
        wrapMode: TextEdit.WrapAnywhere
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        color: ed.textColor
        placeholderTextColor: root.dim
        selectByMouse: true
        persistentSelection: true
        selectionColor: Style.selectionFillFor(root.foreground, root.accent)
        selectedTextColor: root.foreground
        tabStopDistance: 4 * fontMetrics.averageCharacterWidth
        background: null
        FontMetrics { id: fontMetrics; font: area.font }
      }
    }
  }

  // Labelled values; click a row to copy its value.
  component PairList: BorderSurface {
    id: pl
    property var pairs: []
    color: root.fieldFill
    borderSpec: Border.controlSpec("normal", root.foreground, root.accent)
    radius: Style.cornerRadius
    readonly property real keyWidth: {
      var w = 0
      for (var i = 0; i < pairs.length; i++) w = Math.max(w, pairs[i][0].length)
      return (w + 3) * keyMetrics.averageCharacterWidth
    }
    FontMetrics { id: keyMetrics; font.family: root.fontFamily; font.pixelSize: Style.font.bodySmall }

    ListView {
      id: pairView
      anchors.fill: parent
      anchors.margins: Style.spacing.xs
      clip: true
      model: pl.pairs
      boundsBehavior: Flickable.StopAtBounds
      QQC.ScrollBar.vertical: QQC.ScrollBar {}
      delegate: Rectangle {
        id: row
        required property var modelData
        width: pairView.width
        height: Math.max(valueText.implicitHeight, keyText.implicitHeight) + Style.spacing.md * 2
        radius: Style.cornerRadius
        color: rowMouse.containsMouse ? Style.hoverFillFor(root.foreground, root.accent) : "transparent"
        PlainText {
          id: keyText
          x: Style.spacing.md
          width: pl.keyWidth
          anchors.verticalCenter: parent.verticalCenter
          text: row.modelData[0]
          color: root.dim
          font.pixelSize: Style.font.bodySmall
        }
        PlainText {
          id: valueText
          anchors.left: keyText.right
          anchors.right: copyHint.left
          anchors.rightMargin: Style.spacing.md
          anchors.verticalCenter: parent.verticalCenter
          text: row.modelData[1]
          wrapMode: Text.WrapAnywhere
        }
        PlainText {
          id: copyHint
          anchors.right: parent.right
          anchors.rightMargin: Style.spacing.md
          anchors.verticalCenter: parent.verticalCenter
          text: "copy"
          color: root.accent
          font.pixelSize: Style.font.caption
          opacity: rowMouse.containsMouse ? 1 : 0
        }
        MouseArea {
          id: rowMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.copy(row.modelData[1], row.modelData[0])
        }
      }
    }
  }
}
