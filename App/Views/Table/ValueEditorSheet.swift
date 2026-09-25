import SwiftUI
import TableCore

/// Large editor for multi-line and JSON values, with validation for JSON columns.
struct ValueEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var model: TableTabModel
    let position: GridCellPosition
    @State private var text = ""
    @State private var isNull = false

    private var column: ResultColumn? { model.column(at: position.column) }
    private var kind: ValueKind { column?.kind ?? .text }

    private var jsonError: String? {
        guard kind == .json, !isNull, !text.isEmpty else { return nil }
        return ValueFormatting.prettyJSON(text) == nil ? "Not valid JSON" : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(column?.name ?? "Value").font(.headline)
                    Text(model.structure?.column(named: column?.name ?? "")?.typeName ?? column?.typeName ?? "")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Toggle("NULL", isOn: $isNull).toggleStyle(.checkbox)
                if kind == .json {
                    Button("Format") { if let pretty = ValueFormatting.prettyJSON(text) { text = pretty } }
                        .disabled(jsonError != nil || text.isEmpty)
                }
            }
            TextEditor(text: $text)
                .font(.body.monospaced())
                .disabled(isNull)
                .opacity(isNull ? 0.4 : 1)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
            HStack {
                if let jsonError {
                    Label(jsonError, systemImage: "exclamationmark.triangle").foregroundStyle(.red).font(.callout)
                }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Apply") {
                    model.setValue(isNull ? .null : .text(text), at: position)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.glassProminent)
                .disabled(jsonError != nil)
            }
        }
        .padding(20)
        .frame(width: 640, height: 460)
        .onAppear {
            let value = model.value(at: position)
            isNull = value?.isNull ?? true
            text = value.map { ValueFormatting.detailText(for: $0, kind: kind) } ?? ""
            if isNull { text = "" }
        }
    }
}
