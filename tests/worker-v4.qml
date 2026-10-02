import QtQuick
import "../Tools.js" as Tools

// ToolWorker.js in Qt's V4, the way DevKit.qml uses it: the heaviest
// requests run on the worker thread while a 5 ms timer on this (UI) thread
// records the longest gap between its ticks. Fails if the UI thread stalls
// past stallBudgetMs, a request takes workerBudgetMs, or if an answer differs from calling Tools.js directly.
QtObject {
  id: root
  readonly property int stallBudgetMs: 50
  // Generous, but far below what a collector falling behind costs (see
  // ToolWorker.js): the diff runs after the heaviest requests on purpose.
  readonly property int workerBudgetMs: 3000
  readonly property int big: 1 << 20

  function rep(s, n) { return s.repeat(n) }
  function wide(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a }

  property var requests: [
    { name: "json: invalid numbers", op: "run", tool: "json", state: { input: "[" + rep("1,", big / 2) + "x" } },
    { name: "markdown: backticks", op: "run", tool: "markdown", state: { input: rep("`a ``b ", 16384) } },
    { name: "sql minify", op: "run", tool: "sql", state: { mode: "minify", input: rep("SELECT a, b FROM t WHERE x = 1 AND y = 'z';\n", 20000) } },
    { name: "yaml: unclosed quote", op: "run", tool: "yaml", state: { mode: "to-json", input: "a: \"" + rep("x\n", big / 2) } },
    { name: "html minify", op: "run", tool: "html", state: { mode: "minify", input: "<ul>" + rep("<li> a <i>b</i> </li>", 30000) + "</ul>" } },
    { name: "diff: at the cell cap", op: "run", tool: "diff", state: { input: rep("a\n", 2000), input2: rep("b\n", 2000) } },
    { name: "unicode: at the cap", op: "run", tool: "unicode", state: { input: rep("\u0430\u200b\ud83d\ude00", 65536) } },
    { name: "json: big pretty output", op: "run", tool: "json", state: { input: JSON.stringify(wide(20000, function (i) { return { id: i, name: "n" + i, tags: ["a", "b"] } })) } },
    { name: "detect: lenient json", op: "detect", text: "{" + rep("a: 1, ", Math.floor(big / 7)) },
    { name: "chain: four steps", op: "chain", input: JSON.stringify(wide(5000, function (i) { return { i: i, s: "\u00e9" } })), nowMs: 0,
      steps: [{ tool: "base64", mode: "encode" }, { tool: "base64", mode: "decode" }, { tool: "json", mode: "minify" }, { tool: "yaml", mode: "to-yaml" }] },
    { name: "small: base64", op: "run", tool: "base64", state: { mode: "encode", input: "hello" } }
  ]

  property int index: -1
  property double sentAt: 0
  property double lastTick: 0
  property int maxGap: 0
  property var failures: []
  property var lines: []

  function direct(r) {
    if (r.op === "run") return Tools.run(r.tool, r.state)
    if (r.op === "chain") return Tools.chainRun(r.steps, r.input, r.nowMs, false)
    var t = Tools.detect(r.text)
    return { tool: t, mode: t ? Tools.detectMode(t, r.text) : "" }
  }

  function plain(v) { return JSON.stringify(v, function (k, x) { return x === undefined ? null : x }) }

  function next() {
    index++
    if (index >= requests.length) {
      console.log(lines.join("\n"))
      if (failures.length) { console.log("worker-v4.qml: FAIL\n  " + failures.join("\n  ")); Qt.exit(1) }
      else { console.log("worker-v4.qml: ok (" + requests.length + " requests on the worker thread; UI thread never stalled " + stallBudgetMs + " ms)"); Qt.exit(0) }
      return
    }
    var r = requests[index], req = ({})
    for (var k in r) if (k !== "name") req[k] = r[k]
    req.seq = index
    gc()
    maxGap = 0
    lastTick = Date.now()
    sentAt = lastTick
    worker.sendMessage(req)
  }

  property var worker: WorkerScript {
    source: "../ToolWorker.js"
    onReadyChanged: if (ready) root.next()
    onMessage: function (m) {
      var tookMs = Date.now() - root.sentAt
      var gap = Math.max(root.maxGap, Date.now() - root.lastTick)
      var r = root.requests[root.index]
      if (m.seq !== root.index || m.op !== r.op) root.failures.push(r.name + ": answer for the wrong request")
      var want = root.direct(r)
      var got = r.op === "detect" ? { tool: m.tool, mode: m.mode } : m.result
      if (r.op !== "detect") { var w = ({}); for (var k in want) if (want[k] !== undefined) w[k] = want[k]; want = w }
      if (root.plain(got) !== root.plain(want)) root.failures.push(r.name + ": worker answer differs from Tools.js")
      if (tookMs >= root.workerBudgetMs) root.failures.push(r.name + ": took " + tookMs + " ms on the worker")
      if (gap >= root.stallBudgetMs) root.failures.push(r.name + ": UI thread stalled " + gap + " ms")
      root.lines.push("  " + r.name + ": " + tookMs + " ms on the worker, UI thread's longest stall " + gap + " ms")
      Qt.callLater(root.next)
    }
  }

  property var ticker: Timer {
    interval: 5
    repeat: true
    running: true
    onTriggered: { var now = Date.now(); root.maxGap = Math.max(root.maxGap, now - root.lastTick); root.lastTick = now }
  }
}
