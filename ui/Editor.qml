import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

// A plain-text editor surface. `mono` uses the theme's font, which on
// Omarchy is a monospace one.
BorderSurface {
  id: ed
  property alias text: area.text
  property alias readOnly: area.readOnly
  property alias placeholderText: area.placeholderText
  property alias area: area
  property alias wrapMode: area.wrapMode
  property color textColor: Color.menu.text
  readonly property color fg: Color.menu.text
  signal edited()
  color: Qt.rgba(fg.r, fg.g, fg.b, 0.035)
  borderSpec: Border.controlSpec(area.activeFocus && !area.readOnly ? "focus" : "normal", fg, Color.accent)
  radius: Style.cornerRadius

  QQC.ScrollView {
    id: scroll
    anchors.fill: parent
    anchors.margins: Style.spacing.xs
    clip: true
    QQC.TextArea {
      id: area
      textFormat: TextEdit.PlainText
      wrapMode: TextEdit.WrapAnywhere
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      color: ed.textColor
      placeholderTextColor: Qt.rgba(ed.fg.r, ed.fg.g, ed.fg.b, 0.4)
      selectByMouse: true
      persistentSelection: true
      selectionColor: Style.selectionFillFor(ed.fg, Color.accent)
      selectedTextColor: ed.fg
      tabStopDistance: 4 * fontMetrics.averageCharacterWidth
      background: null
      FontMetrics { id: fontMetrics; font: area.font }
    }
  }
}
