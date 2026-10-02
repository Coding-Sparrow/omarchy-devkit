import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "../Tools.js" as Tools

// F1: every shortcut on one card.
Rectangle {
  id: help
  property var dk
  signal closeRequested()
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.6)
  color: Qt.rgba(Color.menu.background.r, Color.menu.background.g, Color.menu.background.b, 0.92)

  MouseArea { anchors.fill: parent; onClicked: help.closeRequested() }

  readonly property var general: [
    ["Ctrl+K", "Search tools (↑ ↓ Enter)"], ["Ctrl+Tab", "Next tool  (Ctrl+⇧Tab: previous)"],
    ["Ctrl+⇧V", "Paste into the input"], ["Ctrl+⇧C", "Copy the output"],
    ["Ctrl+↵", "Output → input; generate again"], ["Ctrl+⇧S", "Load the sample, or put your input back"],
    ["Ctrl+D", "Load the clipboard suggestion"], ["Ctrl+B", "Pin or unpin this tool"],
    ["Ctrl+L", "Clear the input"], ["Ctrl+H", "History"], ["F1", "This card"], ["Esc", "Close (clears the search first)"]
  ]
  readonly property var toolKeys: Tools.TOOLS.filter(function (t) { return t.shortcut }).map(function (t) {
    return [help.dk.keyHint(t.shortcut), t.name]
  })

  BorderSurface {
    anchors.centerIn: parent
    width: Math.min(parent.width - Style.space(80), Style.space(820))
    height: Math.min(parent.height - Style.space(60), card.implicitHeight + Style.spacing.panelPadding * 2)
    color: Color.menu.background
    borderSpec: Border.surfaceSpec("menu", "border", Color.menu.border, Math.max(1, Style.normalBorderWidth))
    radius: Style.cornerRadius
    MouseArea { anchors.fill: parent }
    ColumnLayout {
      id: card
      anchors.fill: parent
      anchors.margins: Style.spacing.panelPadding
      spacing: Style.spacing.lg
      RowLayout {
        Layout.fillWidth: true
        PlainText { text: "Keyboard shortcuts"; font.pixelSize: Style.font.heading; font.bold: true; color: Color.accent }
        Item { Layout.fillWidth: true }
        PlainText { text: "Esc or F1 to close"; color: help.dim; font.pixelSize: Style.font.caption }
      }
      RowLayout {
        Layout.fillWidth: true
        spacing: Style.spacing.panelPadding * 2
        GridLayout {
          Layout.alignment: Qt.AlignTop
          columns: 2
          columnSpacing: Style.spacing.xl
          rowSpacing: Style.spacing.sm
          Repeater {
            model: help.general.length * 2
            PlainText {
              required property int index
              readonly property var pair: help.general[Math.floor(index / 2)]
              text: index % 2 === 0 ? pair[0] : pair[1]
              color: index % 2 === 0 ? Color.accent : help.fg
              font.bold: index % 2 === 0
            }
          }
        }
        GridLayout {
          Layout.alignment: Qt.AlignTop
          columns: 2
          columnSpacing: Style.spacing.xl
          rowSpacing: Style.spacing.sm
          Repeater {
            model: help.toolKeys.length * 2
            PlainText {
              required property int index
              readonly property var pair: help.toolKeys[Math.floor(index / 2)]
              text: index % 2 === 0 ? pair[0] : pair[1]
              color: index % 2 === 0 ? Color.accent : help.fg
              font.bold: index % 2 === 0
            }
          }
        }
      }
      PlainText {
        Layout.fillWidth: true
        wrapMode: Text.Wrap
        color: help.dim
        font.pixelSize: Style.font.caption
        text: "Right-click the bar icon to open DevKit on whatever is on your clipboard. Everything runs locally: DevKit makes no network requests, and only pinned tools, recent tools and saved chains are kept on disk (never what you type)."
      }
    }
  }
}
