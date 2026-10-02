import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// The extra controls a tool declares in Tools.TOOLS (`options`): text fields,
// toggles, choices and numbers. Values live with the caller; this only shows
// them and reports edits. Bump `revision` to reload values set from outside
// (a sample, a restored session).
RowLayout {
  id: bar
  property var options: []
  property var values: ({})
  property int revision: 0
  signal changed(string id, var value)
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  spacing: Style.spacing.md
  visible: options.length > 0

  function valueOf(id, fallback) {
    return values && values[id] !== undefined ? values[id] : fallback
  }

  Repeater {
    // Recreated on every revision, so each control reads its value afresh.
    model: bar.revision >= 0 ? bar.options : []
    delegate: Loader {
      id: opt
      required property var modelData
      Layout.fillWidth: modelData.grow === true
      Layout.preferredWidth: modelData.grow === true ? 100 : -1
      sourceComponent: modelData.type === "toggle" ? toggleC : modelData.type === "choice" ? choiceC : textC

      Component {
        id: textC
        RowLayout {
          spacing: Style.spacing.sm
          PlainText { visible: !!opt.modelData.label && opt.modelData.type !== "toggle"; text: opt.modelData.label || ""; color: bar.dim }
          TextField {
            id: field
            Layout.fillWidth: true
            Layout.preferredWidth: opt.modelData.grow ? -1 : Style.space(opt.modelData.width || 120)
            placeholderText: opt.modelData.placeholder || ""
            foreground: bar.fg
            accent: Color.accent
            font.family: Style.font.family
            password: opt.modelData.secret === true && !reveal.selected
            validator: opt.modelData.type === "number" ? numberValidator : null
            Component.onCompleted: text = String(bar.valueOf(opt.modelData.id, opt.modelData.value !== undefined ? opt.modelData.value : ""))
            onTextEdited: bar.changed(opt.modelData.id, text)
            IntValidator { id: numberValidator; bottom: 1; top: opt.modelData.max || 100000 }
          }
          Button {
            id: reveal
            visible: opt.modelData.secret === true
            text: selected ? "hide" : "show"
            foreground: bar.dim
            accent: Color.accent
            tooltipText: "Show or hide the secret"
            onClicked: selected = !selected
          }
        }
      }
      Component {
        id: toggleC
        Button {
          text: opt.modelData.label
          bordered: true
          selected: bar.valueOf(opt.modelData.id, opt.modelData.value === true) === true
          foreground: bar.fg
          accent: Color.accent
          tooltipText: opt.modelData.tooltip || ""
          onClicked: bar.changed(opt.modelData.id, !selected)
        }
      }
      Component {
        id: choiceC
        RowLayout {
          spacing: Style.spacing.sm
          PlainText { visible: !!opt.modelData.label; text: opt.modelData.label || ""; color: bar.dim }
          ButtonGroup {
            options: opt.modelData.choices
            value: String(bar.valueOf(opt.modelData.id, opt.modelData.value))
            foreground: bar.fg
            accent: Color.accent
            onChanged: function (v) { bar.changed(opt.modelData.id, v) }
          }
        }
      }
    }
  }
}
