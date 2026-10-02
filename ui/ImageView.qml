import QtQuick
import qs.Commons
import qs.Ui

// A picture DevKit wrote itself (a QR code, a decoded data: URI, a copied
// screenshot). Only absolute local paths are ever loaded, so a pasted URL can
// never make Qt fetch anything.
BorderSurface {
  id: root
  property string path: ""
  property string placeholder: ""
  property bool pixelated: false
  readonly property color fg: Color.menu.text
  readonly property bool usable: /^\/[^\0]+$/.test(path)
  readonly property bool ready: preview.status === Image.Ready
  color: Qt.rgba(fg.r, fg.g, fg.b, 0.035)
  borderSpec: Border.controlSpec("normal", fg, Color.accent)
  radius: Style.cornerRadius
  clip: true

  // A checkerboard shows transparency.
  Grid {
    anchors.centerIn: preview
    width: preview.paintedWidth
    height: preview.paintedHeight
    clip: true
    visible: root.ready && !root.pixelated && !preview.tiny
    columns: Math.ceil(width / 10)
    Repeater {
      model: parent.visible ? Math.min(4000, parent.columns * Math.ceil(parent.height / 10)) : 0
      Rectangle {
        required property int index
        width: 10; height: 10
        color: (Math.floor(index / parent.columns) + index % parent.columns) % 2 ? "#bbbbbb" : "#eeeeee"
      }
    }
  }
  Image {
    id: preview
    anchors.fill: parent
    anchors.margins: Style.spacing.lg
    source: root.usable ? Util.fileUrl(root.path) : ""
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    cache: false
    // Small pictures (a QR code, an icon, a 2×2 sample) are scaled up with
    // hard pixel edges instead of being smeared into a blur.
    readonly property bool tiny: status === Image.Ready && Math.max(implicitWidth, implicitHeight) <= 256
    smooth: !root.pixelated && !tiny
    mipmap: !root.pixelated && !tiny
  }
  PlainText {
    anchors.centerIn: parent
    width: parent.width - Style.spacing.xl * 2
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    visible: !root.ready
    text: root.usable && preview.status === Image.Error ? "Qt cannot display this image type" : root.placeholder
    color: Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.5)
  }
}
