import SwiftUI
import TableCore

/// Shows the SQL that a commit will run and asks for confirmation.
struct ChangesPreviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var model: TableTabModel

    private var script: String {
        model.pendingStatements.map { $0 + ";" }.joined(separator: "\n\n")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Commit \(model.changes.count) \(model.changes.count == 1 ? "change" : "changes") to \(model.query.table.description)")
                .font(.headline)
            Text("The statements below run in a single transaction. Nothing is written if one of them fails.")
                .font(.callout)
                .foregroundStyle(.secondary)
            ScrollView {
                Text(script)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
            }
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
            HStack {
                Button("Copy SQL") { copyToPasteboard(script) }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Commit") {
                    dismiss()
                    Task { await model.commit() }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.glassProminent)
            }
        }
        .padding(20)
        .frame(width: 640, height: 420)
    }
}
