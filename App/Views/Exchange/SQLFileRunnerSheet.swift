import SwiftUI
import TableCore
import UniformTypeIdentifiers

/// Runs every statement of a `.sql` file on a connection, reporting progress and the first error.
struct SQLFileRunnerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let connection: ConnectionModel
    let fileURL: URL

    @State private var statements: [SQLStatement] = []
    @State private var completed = 0
    @State private var isRunning = false
    @State private var error: DatabaseError?
    @State private var finished = false
    @State private var useTransaction = true
    @State private var loadError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Run \(fileURL.lastPathComponent)").font(.headline)
            if let loadError {
                Text(loadError).foregroundStyle(.red)
            } else {
                Text("\(statements.count) statements will run on \(connection.displayName).")
                    .foregroundStyle(.secondary)
                Toggle("Wrap in a single transaction (roll back everything on error)", isOn: $useTransaction)
                    .disabled(isRunning || finished)
                if isRunning || finished {
                    ProgressView(value: Double(completed), total: Double(max(1, statements.count))) {
                        Text(finished && error == nil ? "Done" : "Statement \(min(completed + 1, statements.count)) of \(statements.count)")
                    }
                }
                if let error {
                    ErrorBanner(error: error)
                }
                if finished, error == nil {
                    Label("All statements executed successfully.", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            HStack {
                Spacer()
                Button(finished ? "Close" : "Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                if !finished {
                    Button("Run") { Task { await run() } }
                        .keyboardShortcut(.defaultAction)
                        .buttonStyle(.glassProminent)
                        .disabled(isRunning || statements.isEmpty)
                }
            }
        }
        .padding(20)
        .frame(width: 520)
        .onAppear(perform: load)
    }

    private func load() {
        do {
            let text = try String(contentsOf: fileURL, encoding: .utf8)
            statements = SQLStatementSplitter.split(text)
        } catch {
            loadError = "Could not read the file: \(error.localizedDescription)"
        }
    }

    private func run() async {
        isRunning = true
        error = nil
        defer {
            isRunning = false
            finished = true
        }
        do {
            if useTransaction {
                _ = try await connection.execute("BEGIN")
            }
            for statement in statements {
                _ = try await connection.execute(statement.text)
                completed += 1
            }
            if useTransaction {
                _ = try await connection.execute("COMMIT")
            }
            await connection.refreshSchemas()
        } catch {
            if useTransaction { _ = try? await connection.execute("ROLLBACK") }
            self.error = DatabaseError(error)
        }
    }
}

/// Presents an open panel and returns the chosen SQL file.
@MainActor
func chooseSQLFile() -> URL? {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [UTType(filenameExtension: "sql") ?? .plainText, .plainText]
    panel.allowsMultipleSelection = false
    return panel.runModal() == .OK ? panel.url : nil
}
