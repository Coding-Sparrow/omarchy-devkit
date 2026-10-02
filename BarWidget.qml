import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Bar icon for DevKit.
//   left click   open / close
//   right click  open on the clipboard, in the matching tool
BarWidget {
  id: root
  moduleName: "coding-sparrow.devkit"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf121"
    tooltipText: "DevKit — left: open · right: open on the clipboard"

    onPressed: function (mouseButton) {
      if (!root.bar) return
      if (mouseButton === Qt.RightButton)
        root.bar.run("omarchy-shell -q shell summon coding-sparrow.devkit '{\"action\":\"clipboard\"}'")
      else
        root.bar.run("omarchy-shell -q shell toggle coding-sparrow.devkit")
    }
  }
}
