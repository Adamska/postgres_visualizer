import SwiftUI
import TableCore
import UniformTypeIdentifiers

/// Picks a format and scope, then writes the export through a save panel or to the clipboard.
struct ExportSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let hasSelection: Bool
    let defaultName: String
    var render: (ExportFormat, Bool) -> String

    @State private var format = ExportFormat.csv
    @State private var selectionOnly = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.headline)
            Picker("Format", selection: $format) {
                ForEach(ExportFormat.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            if hasSelection {
                Toggle("Only the selected rows", isOn: $selectionOnly)
            }
            Text("Exports the rows currently loaded in this tab.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Button("Copy to Clipboard") {
                    copyToPasteboard(render(format, selectionOnly))
                    dismiss()
                }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Save…") { save() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.glassProminent)
            }
        }
        .padding(20)
        .frame(width: 420)
        .onAppear { selectionOnly = hasSelection }
    }

    private func save() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "\(defaultName).\(format.fileExtension)"
        panel.allowedContentTypes = [UTType(filenameExtension: format.fileExtension) ?? .plainText]
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try render(format, selectionOnly).write(to: url, atomically: true, encoding: .utf8)
            dismiss()
        } catch {
            NSAlert(error: error).runModal()
        }
    }
}
