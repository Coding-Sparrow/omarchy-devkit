import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

// The tool list: a search box, pinned and recent tools, then every section.
// `dk` is the DevKit root, which owns the state.
ColumnLayout {
  id: side
  property var dk
  property alias searchField: searchField
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.35)
  spacing: Style.spacing.sm

  RowLayout {
    Layout.fillWidth: true
    Layout.bottomMargin: Style.spacing.sm
    PlainText { text: "DevKit"; font.pixelSize: Style.font.heading; font.bold: true; color: Color.accent }
    Item { Layout.fillWidth: true }
    PlainText { text: side.dk.tools.filter(function (t) { return t.kind !== "view" }).length + " tools"; color: side.faint; font.pixelSize: Style.font.caption }
  }

  TextField {
    id: searchField
    Layout.fillWidth: true
    placeholderText: "Search tools…   Ctrl+K"
    foreground: side.fg
    accent: Color.accent
    font.family: Style.font.family
    onTextChanged: { side.dk.search = text; side.dk.navCursor = 0 }
    Keys.onPressed: function (event) {
      if (event.key === Qt.Key_Down) { side.dk.moveCursor(1); event.accepted = true }
      else if (event.key === Qt.Key_Up) { side.dk.moveCursor(-1); event.accepted = true }
      else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { side.dk.openCursor(); event.accepted = true }
      else if (event.key === Qt.Key_Escape) {
        if (text !== "") text = ""
        else side.dk.focusInput()
        event.accepted = true
      }
    }
  }

  Flickable {
    id: list
    Layout.fillWidth: true
    Layout.fillHeight: true
    contentHeight: column.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    QQC.ScrollBar.vertical: QQC.ScrollBar { policy: list.contentHeight > list.height ? QQC.ScrollBar.AsNeeded : QQC.ScrollBar.AlwaysOff }

    function reveal(item) {
      if (!item) return
      var y = item.mapToItem(column, 0, 0).y
      if (y < contentY) contentY = y
      else if (y + item.height > contentY + height) contentY = y + item.height - height
    }

    ColumnLayout {
      id: column
      width: list.width - (list.contentHeight > list.height ? Style.spacing.lg : 0)
      spacing: 0

      Repeater {
        model: side.dk.navRows
        delegate: Loader {
          id: rowLoader
          required property var modelData
          required property int index
          Layout.fillWidth: true
          sourceComponent: modelData.kind === "header" ? headerC : toolC

          Component {
            id: headerC
            PlainText {
              topPadding: rowLoader.index === 0 ? Style.spacing.xs : Style.spacing.xl
              bottomPadding: Style.spacing.xs
              leftPadding: Style.spacing.sm
              text: String(rowLoader.modelData.label).toUpperCase()
              color: side.faint
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 0.6
            }
          }
          Component {
            id: toolC
            Rectangle {
              id: row
              readonly property var tool: side.dk.toolInfo(rowLoader.modelData.id)
              readonly property bool current: side.dk.toolId === rowLoader.modelData.id
              readonly property bool cursor: side.dk.search !== "" && side.dk.navCursor === rowLoader.modelData.n
              readonly property bool pinned: side.dk.pinned.indexOf(rowLoader.modelData.id) !== -1
              implicitHeight: name.implicitHeight + Style.spacing.md * 2
              radius: Style.cornerRadius
              color: current ? Style.selectedFillFor(side.fg, Color.accent)
                : (mouse.containsMouse || cursor) ? Style.hoverFillFor(side.fg, Color.accent) : "transparent"
              onCursorChanged: if (cursor) list.reveal(row)
              Rectangle {
                visible: row.current
                width: 2; radius: 1
                anchors { left: parent.left; top: parent.top; bottom: parent.bottom; topMargin: Style.spacing.sm; bottomMargin: Style.spacing.sm }
                color: Color.accent
              }
              PlainText {
                id: badge
                x: Style.spacing.md
                width: Style.space(30)
                anchors.verticalCenter: parent.verticalCenter
                text: row.tool.badge
                color: row.current ? Color.accent : side.dim
                font.pixelSize: Style.font.caption
                font.bold: true
                elide: Text.ElideRight
              }
              PlainText {
                id: name
                anchors.left: badge.right
                anchors.leftMargin: Style.spacing.sm
                anchors.right: hint.left
                anchors.rightMargin: Style.spacing.sm
                anchors.verticalCenter: parent.verticalCenter
                text: row.tool.name
                elide: Text.ElideRight
                color: row.current ? Color.accent : side.fg
                font.bold: row.current
              }
              PlainText {
                id: hint
                anchors.right: pin.left
                anchors.rightMargin: Style.spacing.xs
                anchors.verticalCenter: parent.verticalCenter
                text: side.dk.keyHint(row.tool.shortcut)
                visible: !mouse.containsMouse && text !== ""
                color: side.faint
                font.pixelSize: Style.font.caption
              }
              PlainText {
                id: pin
                anchors.right: parent.right
                anchors.rightMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                width: mouse.containsMouse || row.pinned ? implicitWidth : 0
                text: row.pinned ? "★" : "☆"
                visible: mouse.containsMouse || (row.pinned && rowLoader.modelData.section !== "pinned")
                color: pinMouse.containsMouse ? Color.accent : (row.pinned ? Color.accent : side.dim)
                MouseArea {
                  id: pinMouse
                  anchors.fill: parent
                  anchors.margins: -Style.spacing.sm
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: side.dk.togglePin(rowLoader.modelData.id)
                }
              }
              MouseArea {
                id: mouse
                anchors.fill: parent
                anchors.rightMargin: pin.width + Style.spacing.lg
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                cursorShape: Qt.PointingHandCursor
                onClicked: function (m) {
                  if (m.button === Qt.RightButton) side.dk.togglePin(rowLoader.modelData.id)
                  else side.dk.selectTool(rowLoader.modelData.id)
                }
              }
            }
          }
        }
      }

      PlainText {
        visible: side.dk.search !== "" && side.dk.navRows.length <= 1
        Layout.fillWidth: true
        topPadding: Style.spacing.lg
        leftPadding: Style.spacing.sm
        wrapMode: Text.Wrap
        text: "No tool matches “" + side.dk.search + "”"
        color: side.dim
      }
    }
  }

  PlainText {
    Layout.fillWidth: true
    wrapMode: Text.Wrap
    color: side.faint
    font.pixelSize: Style.font.caption
    text: "Right-click or ☆ to pin · F1 shortcuts"
  }
}
