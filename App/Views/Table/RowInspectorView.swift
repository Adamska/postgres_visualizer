import SwiftUI
import TableCore

/// Right-hand inspector listing every column of the focused row, editable when the table is.
struct RowInspectorView: View {
    @Bindable var model: TableTabModel
    @State private var editingCell: GridCellPosition?

    var body: some View {
        if let row = model.focusedCell?.row ?? model.selectedRows.first, let result = model.result, model.gridContent.rows.indices.contains(row) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header(row: row)
                    ForEach(result.columns) { column in
                        let position = GridCellPosition(row: row, column: column.index)
                        InspectorField(
                            name: column.name,
                            typeName: model.structure?.column(named: column.name)?.typeName ?? column.typeName,
                            value: model.value(at: position),
                            kind: column.kind,
                            isEditable: model.isEditable && (model.structure?.column(named: column.name)?.isWritable ?? false)
                                && model.gridContent.rows[row].state != .deleted,
                            isModified: model.gridContent.rows[row].cells[column.index].isModified,
                            onCommit: { model.setValue($0, at: position) },
                            onOpenEditor: { editingCell = position }
                        )
                        Divider()
                    }
                }
            }
            .sheet(item: $editingCell) { position in
                ValueEditorSheet(model: model, position: position)
            }
        } else {
            EmptyStateView(systemImage: "rectangle.and.text.magnifyingglass", title: "No row selected", message: "Click a cell to inspect the whole row here.")
        }
    }

    private func header(row: Int) -> some View {
        HStack {
            Text("Row \(row + 1)")
                .font(.headline)
            Spacer()
            if model.gridContent.rows[row].state == .deleted {
                Label("Deleted", systemImage: "trash").font(.caption).foregroundStyle(.red)
            } else if model.gridContent.rows[row].state == .inserted {
                Label("New", systemImage: "plus").font(.caption).foregroundStyle(.green)
            }
            Button {
                copyToPasteboard(rowJSON(row))
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.plain)
            .help("Copy row as JSON")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func rowJSON(_ row: Int) -> String {
        guard let result else { return "" }
        let values = result.columns.map { model.value(at: GridCellPosition(row: row, column: $0.index)) ?? .null }
        return ResultExporter.json(columns: result.columns, rows: [values])
    }

    private var result: QueryResult? { model.result }
}

/// Inspector for read-only query results.
struct QueryRowInspectorView: View {
    @Bindable var model: QueryTabModel

    var body: some View {
        if let row = model.focusedCell?.row ?? model.selectedRows.first, let result = model.selectedResult, result.rows.indices.contains(row) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Row \(row + 1)")
                        .font(.headline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                    ForEach(result.columns) { column in
                        InspectorField(
                            name: column.name,
                            typeName: column.typeName,
                            value: result.rows[row][column.index],
                            kind: column.kind,
                            isEditable: false,
                            isModified: false,
                            onCommit: { _ in },
                            onOpenEditor: {}
                        )
                        Divider()
                    }
                }
            }
        } else {
            EmptyStateView(systemImage: "rectangle.and.text.magnifyingglass", title: "No row selected", message: "Click a cell to inspect the whole row here.")
        }
    }
}

/// One column in the inspector. Short values edit inline; long ones open the value editor.
private struct InspectorField: View {
    let name: String
    let typeName: String
    let value: CellValue?
    let kind: ValueKind
    let isEditable: Bool
    let isModified: Bool
    var onCommit: (EditValue) -> Void
    var onOpenEditor: () -> Void

    @State private var draft = ""
    @State private var isEditing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(isModified ? Color.orange : .secondary)
                Text(typeName)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.tertiary)
                Spacer()
                if isEditable {
                    Menu {
                        Button("Set NULL") { onCommit(.null) }
                        Button("Set DEFAULT") { onCommit(.serverDefault) }
                        Button("Edit in Window…", action: onOpenEditor)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .controlSize(.small)
                }
            }
            if isEditable, kind != .json, !(value?.stringValue?.contains("\n") ?? false) {
                TextField("NULL", text: $draft, onEditingChanged: { editing in
                    if editing {
                        isEditing = true
                    } else if isEditing {
                        isEditing = false
                        commitDraft()
                    }
                })
                .textFieldStyle(.roundedBorder)
                .font(.callout.monospaced())
                .onSubmit(commitDraft)
                .task(id: value) { if !isEditing { draft = value.map(ValueFormatting.editorText) ?? "" } }
            } else {
                Text(value.map { ValueFormatting.detailText(for: $0, kind: kind) } ?? ValueFormatting.nullPlaceholder)
                    .font(.callout.monospaced())
                    .foregroundStyle(value?.isNull ?? true ? .tertiary : .primary)
                    .textSelection(.enabled)
                    .lineLimit(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onTapGesture(count: 2) { if isEditable { onOpenEditor() } }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func commitDraft() {
        let current = value.map(ValueFormatting.editorText) ?? ""
        guard draft != current || (value?.isNull ?? true && !draft.isEmpty) else { return }
        onCommit(.text(draft))
    }
}
