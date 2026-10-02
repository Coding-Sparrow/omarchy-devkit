// Tools.js on Qt's worker thread. DevKit.qml sends every computation here:
// a tool run, a chain without regex steps, the clipboard and output
// detection. The shell's UI thread (the bar, notifications, the lock screen)
// only posts the request and shows the answer, so a large input never stalls
// the desktop. User regexes still go to bin/devkit-regex, which can be killed
// at a deadline; this thread cannot, so it only runs code that is bounded
// (tests/perf-cases.js).
//
// Requests: { op, seq, ... }. Each answer carries the same op and seq; the
// window keeps only the newest per op.
//   run     { tool, state }        -> { result }
//   chain   { steps, input, nowMs } -> { result }
//   detect  { text }               -> { tool, mode }   (the clipboard)
//   next    { text }               -> { tool, mode }   (the output)

// WorkerScript has no `.import`; Qt.include puts Tools.js's functions in
// this script's scope.
Qt.include("Tools.js")

// Values cross threads as a copy; drop undefined fields so `r.image !==
// undefined` reads the same on both sides.
function devkitPlain(r) {
  var out = {}
  for (var k in r) if (r[k] !== undefined) out[k] = r[k]
  return out
}

function devkitAnswer(req) {
  switch (req.op) {
  case "run": return { result: devkitPlain(run(req.tool, req.state || {})) }
  case "chain": return { result: devkitPlain(chainRun(req.steps || [], String(req.input || ""), Number(req.nowMs) || Date.now(), false)) }
  case "detect":
  case "next":
    var t = detect(req.text)
    return { tool: t, mode: t ? detectMode(t, req.text) : "" }
  }
  return {}
}

// After a heavy request V4's collector falls behind: the next large job ran
// 18x slower (a 2,000-line diff: 9 s instead of 0.5 s) until a full
// collection. One after any request that took a while costs a few ms to
// 60 ms, here, off the UI thread.
var devkitGcAfterMs = 25

WorkerScript.onMessage = function (req) {
  var out, started = Date.now()
  try {
    out = devkitAnswer(req)
  } catch (e) {
    out = { result: { output: "", error: "DevKit error: " + e, info: "" }, tool: "", mode: "" }
  }
  out.op = req.op
  out.seq = req.seq
  WorkerScript.sendMessage(out)
  out = null
  req = null
  if (Date.now() - started >= devkitGcAfterMs) gc()
}
