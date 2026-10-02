import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui
import "../Tools.js" as Tools

// Chains: saved recipes of tool steps, run on one input. `dk` owns the state.
RowLayout {
  id: view
  property var dk
  property alias inputEditor: inputEd
  readonly property color fg: Color.menu.text
  readonly property color dim: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.1)
  spacing: Style.spacing.panelPadding

  // ---- saved chains
  ColumnLayout {
    Layout.preferredWidth: Style.space(200)
    Layout.maximumWidth: Style.space(200)
    Layout.fillHeight: true
    spacing: Style.spacing.xs
    PlainText { text: "SAVED CHAINS"; color: view.dim; font.pixelSize: Style.font.caption; font.bold: true; bottomPadding: Style.spacing.xs }
    Flickable {
      id: chainList
      Layout.fillWidth: true
      Layout.fillHeight: true
      contentHeight: chainCol.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      ColumnLayout {
        id: chainCol
        width: chainList.width
        spacing: Style.spacing.xxs
        Repeater {
          model: view.dk.chains
          delegate: Button {
            required property var modelData
            Layout.fillWidth: true
            leftAlign: true
            text: "⛓  " + modelData.name
            selected: view.dk.chainId === modelData.id
            foreground: view.fg
            accent: Color.accent
            tooltipText: modelData.steps.map(function (s) { return Tools.toolById(s.tool).name + (s.mode ? " (" + s.mode + ")" : "") }).join("  →  ")
            onClicked: view.dk.selectChain(modelData.id)
          }
        }
      }
    }
    Button {
      Layout.fillWidth: true
      text: "+ New chain"
      bordered: true
      foreground: view.fg
      accent: Color.accent
      onClicked: view.dk.newChain()
    }
  }

  Rectangle { Layout.fillHeight: true; implicitWidth: 1; color: view.faint }

  // ---- the chain
  ColumnLayout {
    Layout.fillWidth: true
    Layout.fillHeight: true
    spacing: Style.spacing.lg
    visible: view.dk.chain !== null

    RowLayout {
      Layout.fillWidth: true
      spacing: Style.spacing.md
      TextField {
        id: nameField
        Layout.fillWidth: true
        placeholderText: "Chain name"
        foreground: view.fg
        accent: Color.accent
        font.family: Style.font.family
        font.bold: true
        text: view.dk.chain ? view.dk.chain.name : ""
        onTextEdited: view.dk.renameChain(text)
      }
      Button { text: "Duplicate"; bordered: true; foreground: view.fg; accent: Color.accent; onClicked: view.dk.duplicateChain() }
      Button { text: "Delete"; bordered: true; foreground: Color.urgent; accent: Color.accent; onClicked: view.dk.deleteChain() }
    }

    // Steps
    Flickable {
      id: stepFlick
      Layout.fillWidth: true
      Layout.preferredHeight: Math.min(stepCol.implicitHeight, view.height * 0.42)
      contentHeight: stepCol.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      QQC.ScrollBar.vertical: QQC.ScrollBar { policy: stepFlick.contentHeight > stepFlick.height ? QQC.ScrollBar.AsNeeded : QQC.ScrollBar.AlwaysOff }
      ColumnLayout {
        id: stepCol
        width: stepFlick.width - Style.spacing.lg
        spacing: Style.spacing.sm
        Repeater {
          model: view.dk.chainSteps
          delegate: BorderSurface {
            id: stepBox
            required property var modelData
            required property int index
            readonly property var report: view.dk.chainResult.steps && view.dk.chainResult.steps[index]
            readonly property var modes: Tools.chainModes(modelData.tool)
            Layout.fillWidth: true
            implicitHeight: stepRow.implicitHeight + Style.spacing.md * 2
            color: Qt.rgba(view.fg.r, view.fg.g, view.fg.b, 0.03)
            borderSpec: Border.controlSpec(view.dk.chainResult.failedAt === index ? "focus" : "normal", view.fg, Color.accent)
            radius: Style.cornerRadius
            ColumnLayout {
              id: stepRow
              anchors.fill: parent
              anchors.margins: Style.spacing.md
              spacing: Style.spacing.sm
              RowLayout {
                Layout.fillWidth: true
                spacing: Style.spacing.md
                PlainText { text: (stepBox.index + 1) + "."; color: Color.accent; font.bold: true }
                Dropdown {
                  Layout.preferredWidth: Style.space(190)
                  showLabel: false
                  options: view.dk.chainToolOptions
                  value: stepBox.modelData.tool
                  onChanged: function (v) { view.dk.setStepTool(stepBox.index, v) }
                }
                ButtonGroup {
                  visible: stepBox.modes.length > 0 && stepBox.modes.length <= 6
                  options: stepBox.modes
                  value: stepBox.modelData.mode
                  foreground: view.fg
                  accent: Color.accent
                  onChanged: function (v) { view.dk.setStepMode(stepBox.index, v) }
                }
                Dropdown {
                  visible: stepBox.modes.length > 6
                  Layout.preferredWidth: Style.space(170)
                  showLabel: false
                  options: stepBox.modes
                  value: stepBox.modelData.mode
                  onChanged: function (v) { view.dk.setStepMode(stepBox.index, v) }
                }
                Item { Layout.fillWidth: true }
                PlainText {
                  Layout.maximumWidth: Style.space(260)
                  elide: Text.ElideRight
                  text: !stepBox.report ? "" : stepBox.report.ok ? "✓ " + stepBox.report.chars + " chars" : "✗ " + stepBox.report.error
                  color: stepBox.report && !stepBox.report.ok ? Color.urgent : view.dim
                  font.pixelSize: Style.font.caption
                }
                Button { text: "↑"; foreground: view.dim; tooltipText: "Move up"; enabled: stepBox.index > 0; opacity: enabled ? 1 : 0.3; onClicked: view.dk.moveStep(stepBox.index, -1) }
                Button { text: "↓"; foreground: view.dim; tooltipText: "Move down"; enabled: stepBox.index < view.dk.chainSteps.length - 1; opacity: enabled ? 1 : 0.3; onClicked: view.dk.moveStep(stepBox.index, 1) }
                Button { text: "✕"; foreground: view.dim; tooltipText: "Remove step"; onClicked: view.dk.removeStep(stepBox.index) }
              }
              OptionBar {
                Layout.fillWidth: true
                options: Tools.chainOptions(stepBox.modelData.tool, stepBox.modelData.mode)
                values: stepBox.modelData.opts || ({})
                onChanged: function (id, value) { view.dk.setStepOpt(stepBox.index, id, value) }
              }
            }
          }
        }
        PlainText {
          visible: view.dk.chainSteps.length === 0
          text: "No steps yet. Add one: each step's output is the next one's input."
          color: view.dim
        }
      }
    }
    RowLayout {
      Layout.fillWidth: true
      Button {
        text: "+ Add step"
        bordered: true
        foreground: view.fg
        accent: Color.accent
        enabled: view.dk.chainSteps.length < Tools.CHAIN_MAX_STEPS
        onClicked: view.dk.addStep()
      }
      Item { Layout.fillWidth: true }
      PlainText {
        text: view.dk.chainSteps.map(function (s) { return Tools.toolById(s.tool).name }).join("  →  ")
        color: view.dim
        elide: Text.ElideLeft
        Layout.maximumWidth: view.width * 0.5
        font.pixelSize: Style.font.caption
      }
    }

    RowLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: Style.spacing.lg
      Pane {
        title: "Input"
        Editor {
          id: inputEd
          anchors.fill: parent
          placeholderText: "Input for the first step…"
          onTextChanged: view.dk.chainInputChanged(text)
        }
        actions: [
          Button { text: "Paste"; foreground: view.dim; onClicked: view.dk.readClipboard("paste-chain") },
          Button { text: "Clear"; foreground: view.dim; onClicked: inputEd.text = "" }
        ]
      }
      Pane {
        title: "Output"
        status: view.dk.chainBusy ? "running…" : (view.dk.chainResult.info || "")
        Editor {
          anchors.fill: parent
          readOnly: true
          text: view.dk.chainResult.output || ""
        }
        actions: [
          Button { text: "→ Input"; foreground: view.dim; tooltipText: "Run the chain again on its output"; onClicked: inputEd.text = view.dk.chainResult.output || "" },
          Button { text: "Copy"; foreground: Color.accent; onClicked: view.dk.copy(view.dk.chainResult.output || "", "chain output") }
        ]
      }
    }
    PlainText {
      Layout.fillWidth: true
      visible: (view.dk.chainResult.error || "") !== ""
      text: "⚠  " + (view.dk.chainResult.error || "")
      color: Color.urgent
      wrapMode: Text.Wrap
    }
  }
  PlainText {
    visible: view.dk.chain === null
    Layout.fillWidth: true
    text: "Pick a chain, or make a new one."
    color: view.dim
  }
}
