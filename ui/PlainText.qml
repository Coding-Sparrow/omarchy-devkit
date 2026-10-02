import QtQuick
import qs.Commons

// All text DevKit shows may come from the clipboard, so it is never parsed
// as rich text (which would honour <img src="file:///…">).
Text {
  textFormat: Text.PlainText
  font.family: Style.font.family
  font.pixelSize: Style.font.body
  color: Color.menu.text
}
