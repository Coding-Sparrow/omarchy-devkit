import QtQuick
import QtQuick.Layouts
import qs.Commons

// A titled area with actions on the right of its title row.
ColumnLayout {
  id: pane
  property string title: ""
  property string status: ""
  property bool statusUrgent: false
  property alias actions: actionRow.children
  default property alias content: body.data
  readonly property color dim: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.55)
  Layout.fillWidth: true
  Layout.fillHeight: true
  // Equal preferred sizes make sibling panes split the space evenly
  // instead of by content width.
  Layout.preferredWidth: 100
  Layout.preferredHeight: 100
  spacing: Style.spacing.sm
  RowLayout {
    Layout.fillWidth: true
    spacing: Style.spacing.md
    PlainText { text: pane.title.toUpperCase(); color: pane.dim; font.pixelSize: Style.font.caption; font.bold: true; font.letterSpacing: 0.5 }
    PlainText {
      Layout.fillWidth: true
      text: pane.status
      elide: Text.ElideRight
      color: pane.statusUrgent ? Color.urgent : pane.dim
      font.pixelSize: Style.font.caption
    }
    Row { id: actionRow; spacing: Style.spacing.xs }
  }
  Item {
    id: body
    Layout.fillWidth: true
    Layout.fillHeight: true
  }
}
