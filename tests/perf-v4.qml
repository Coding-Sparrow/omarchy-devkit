import QtQuick
import "../Tools.js" as Tools
import "perf-cases.js" as Perf

// The perf cases again, in Qt's V4 engine: the one omarchy-shell runs Tools.js
// in. Prints one line per case and exits non-zero if any is over budget.
QtObject {
  readonly property int budgetMs: 2000
  Component.onCompleted: {
    var cases = Perf.perfCases(Tools), slow = [], worst = 0, worstName = "", n = 0
    for (var name in cases) {
      var start = Date.now()
      try { cases[name]() } catch (e) { slow.push(name + " threw " + e) }
      var ms = Date.now() - start
      n++
      if (ms > worst) { worst = ms; worstName = name }
      if (ms >= budgetMs) slow.push(name + " took " + ms + " ms")
    }
    if (slow.length) { console.log("perf-v4.qml: FAIL (budget " + budgetMs + " ms)\n  " + slow.join("\n  ")); Qt.exit(1) }
    else { console.log("perf-v4.qml: ok (" + n + " worst-case inputs under " + budgetMs + " ms in Qt V4; slowest " + worstName + " " + worst + " ms)"); Qt.exit(0) }
  }
}
