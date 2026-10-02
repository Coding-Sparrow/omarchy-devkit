import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui
import "../Tools.js" as Tools

// This session's work, newest first. Held in memory only: it is never
// written to disk, and it is gone when the shell restarts.
ColumnLayout {
  id: view
  property var dk
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  spacing: Style.spacing.md

  RowLayout {
    Layout.fillWidth: true
    PlainText { text: view.dk.history.length + (view.dk.history.length === 1 ? " entry" : " entries") + " · memory only, never saved"; color: view.dim }
    Item { Layout.fillWidth: true }
    Button { text: "Clear history"; bordered: true; visible: view.dk.history.length > 0; foreground: view.fg; accent: Color.accent; onClicked: view.dk.clearHistory() }
  }

  BorderSurface {
    Layout.fillWidth: true
    Layout.fillHeight: true
    color: Qt.rgba(view.fg.r, view.fg.g, view.fg.b, 0.035)
    borderSpec: Border.controlSpec("normal", view.fg, Color.accent)
    radius: Style.cornerRadius
    ListView {
      id: lv
      anchors.fill: parent
      anchors.margins: Style.spacing.xs
      clip: true
      model: view.dk.history
      boundsBehavior: Flickable.StopAtBounds
      QQC.ScrollBar.vertical: QQC.ScrollBar {}
      delegate: Rectangle {
        id: row
        required property var modelData
        required property int index
        readonly property var tool: Tools.toolById(modelData.tool)
        width: lv.width
        height: col.implicitHeight + Style.spacing.md * 2
        radius: Style.cornerRadius
        color: mouse.containsMouse ? Style.hoverFillFor(view.fg, Color.accent) : "transparent"
        RowLayout {
          id: col
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Style.spacing.md
          anchors.rightMargin: Style.spacing.md
          spacing: Style.spacing.lg
          PlainText { text: row.modelData.when; color: view.dim; font.pixelSize: Style.font.caption }
          PlainText { text: row.tool.badge; color: Color.accent; font.bold: true; font.pixelSize: Style.font.caption; Layout.preferredWidth: Style.space(30) }
          PlainText {
            text: row.tool.name + (row.modelData.modeLabel ? " · " + row.modelData.modeLabel : "")
            Layout.preferredWidth: Style.space(190)
            elide: Text.ElideRight
          }
          PlainText {
            Layout.fillWidth: true
            text: row.modelData.preview
            color: view.dim
            elide: Text.ElideRight
          }
          PlainText { text: "open"; color: Color.accent; font.pixelSize: Style.font.caption; opacity: mouse.containsMouse ? 1 : 0 }
        }
        MouseArea {
          id: mouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: view.dk.restoreHistory(row.index)
        }
      }
    }
    PlainText {
      anchors.centerIn: parent
      visible: view.dk.history.length === 0
      width: parent.width * 0.7
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      text: "Nothing yet. What you paste, copy and leave behind in a tool shows up here, so you can get back to it."
      color: view.dim
    }
  }
}
