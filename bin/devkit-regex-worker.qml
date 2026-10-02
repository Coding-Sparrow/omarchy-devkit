import QtQml
import "../Tools.js" as Tools

// Headless regex worker, run by bin/devkit-regex in its own `qml` process.
// It uses the same V4 engine and the same Tools.js as the shell, so results
// match exactly, but a catastrophic pattern can only stall this throwaway
// process, which the wrapper kills at its deadline. The request is read from
// an owner-only file whose path is the last argument (the text itself never
// appears in argv), and the result goes out as one tagged log line.
QtObject {
  readonly property int maxOutputChars: 4000000

  Component.onCompleted: {
    var out
    try {
      var xhr = new XMLHttpRequest()
      var args = Qt.application.arguments
      xhr.open("GET", "file://" + args[args.length - 1], false)
      xhr.send()
      var req = JSON.parse(xhr.responseText)
      if (Array.isArray(req.chain))
        out = Tools.chainRun(req.chain, String(req.input || ""), Number(req.nowMs) || Date.now(), true)
      else
        out = Tools.regexTool(String(req.pattern || ""), String(req.flags || ""), String(req.input || ""),
                              String(req.replacement || ""), req.useReplace === true)
      if (out.output.length > maxOutputChars)
        out = { output: "", error: "Result is larger than " + maxOutputChars + " characters", info: "", steps: out.steps }
    } catch (e) {
      out = { output: "", error: "Regex worker error: " + e, info: "" }
    }
    console.log("DEVKIT_RESULT " + JSON.stringify(out))
    Qt.exit(0)
  }
}
