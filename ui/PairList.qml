import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

// Labelled values; click a row to copy its value. A row is [label, shown]
// or [label, shown, copied] when what is copied differs from what is shown
// (a shortened data: URI, a character shown as a dot).
BorderSurface {
  id: pl
  property var pairs: []
  signal copyRequested(string value, string label)
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  color: Qt.rgba(fg.r, fg.g, fg.b, 0.035)
  borderSpec: Border.controlSpec("normal", fg, Color.accent)
  radius: Style.cornerRadius
  readonly property real keyWidth: {
    var w = 0
    for (var i = 0; i < pairs.length; i++) w = Math.max(w, String(pairs[i][0]).length)
    return Math.min(pl.width * 0.4, (w + 3) * keyMetrics.averageCharacterWidth)
  }
  FontMetrics { id: keyMetrics; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }

  ListView {
    id: pairView
    anchors.fill: parent
    anchors.margins: Style.spacing.xs
    clip: true
    model: pl.pairs
    boundsBehavior: Flickable.StopAtBounds
    reuseItems: true
    QQC.ScrollBar.vertical: QQC.ScrollBar {}
    delegate: Rectangle {
      id: row
      required property var modelData
      readonly property bool heading: String(modelData[0]).charAt(0) === "#" && modelData[0].length < 5
      width: pairView.width
      height: Math.max(valueText.implicitHeight, keyText.implicitHeight) + Style.spacing.md * 2
      radius: Style.cornerRadius
      color: rowMouse.containsMouse ? Style.hoverFillFor(pl.fg, Color.accent) : "transparent"
      PlainText {
        id: keyText
        x: Style.spacing.md
        width: pl.keyWidth
        anchors.verticalCenter: parent.verticalCenter
        text: row.modelData[0]
        elide: Text.ElideRight
        color: row.heading ? Color.accent : pl.dim
        font.bold: row.heading
        font.pixelSize: Style.font.bodySmall
      }
      PlainText {
        id: valueText
        anchors.left: keyText.right
        anchors.right: copyHint.left
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: row.modelData[1]
        color: /^[⚠✗]/.test(text) ? Color.urgent : (/^✓/.test(text) ? Color.accent : pl.fg)
        font.bold: row.heading
        // Break at spaces when possible, anywhere for long unbroken values.
        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
      }
      PlainText {
        id: copyHint
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: "copy"
        color: Color.accent
        font.pixelSize: Style.font.caption
        opacity: rowMouse.containsMouse ? 1 : 0
      }
      MouseArea {
        id: rowMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: pl.copyRequested(row.modelData.length > 2 ? String(row.modelData[2]) : String(row.modelData[1]),
                                    String(row.modelData[0]).replace(/^\s+|\s+✓$/g, ""))
      }
    }
  }
}
