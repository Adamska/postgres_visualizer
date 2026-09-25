import SwiftUI
import TableCore

/// Recent queries for the current connection.
struct QueryHistoryPopover: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.dismiss) private var dismiss
    let connection: ConnectionModel
    var onInsert: (String) -> Void
    @State private var entries: [QueryHistoryEntry] = []
    @State private var search = ""
    @State private var showAllConnections = false

    private var filtered: [QueryHistoryEntry] {
        entries.filter { entry in
            (showAllConnections || entry.profileID == connection.id)
                && (search.isEmpty || entry.sql.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Search history", text: $search).textFieldStyle(.roundedBorder)
                Toggle("All connections", isOn: $showAllConnections).toggleStyle(.checkbox).font(.caption)
                Button("Clear") {
                    Task {
                        try? await appModel.environment.historyStore.clear()
                        entries = []
                    }
                }
                .disabled(entries.isEmpty)
            }
            .controlSize(.small)
            .padding(10)
            Divider()
            if filtered.isEmpty {
                Text("No queries yet").foregroundStyle(.secondary).padding(30)
            } else {
                List(filtered) { entry in
                    Button {
                        onInsert(entry.sql)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(entry.sql.trimmingCharacters(in: .whitespacesAndNewlines))
                                .font(.callout.monospaced())
                                .lineLimit(3)
                            HStack(spacing: 6) {
                                Image(systemName: entry.succeeded ? "checkmark.circle" : "xmark.circle")
                                    .foregroundStyle(entry.succeeded ? .green : .red)
                                Text(entry.executedAt, format: .relative(presentation: .named))
                                Text(ValueFormatting.duration(entry.duration))
                                if let count = entry.rowCount { Text(ValueFormatting.rowCount(count)) }
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Copy") { copyToPasteboard(entry.sql) }
                        Button("Delete") {
                            Task {
                                try? await appModel.environment.historyStore.delete(id: entry.id)
                                entries.removeAll { $0.id == entry.id }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .frame(width: 480, height: 400)
        .task { entries = (try? await appModel.environment.historyStore.entries()) ?? [] }
    }
}

/// Queries saved by the user, across connections.
struct SavedQueriesPopover: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.dismiss) private var dismiss
    var onInsert: (String) -> Void
    @State private var queries: [SavedQuery] = []

    var body: some View {
        VStack(spacing: 0) {
            if queries.isEmpty {
                Text("No saved queries. Use the Save button in a query tab.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(30)
            } else {
                List(queries) { query in
                    Button {
                        onInsert(query.sql)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(query.name).font(.callout.weight(.medium))
                            Text(query.sql.trimmingCharacters(in: .whitespacesAndNewlines))
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Copy") { copyToPasteboard(query.sql) }
                        Button("Delete", role: .destructive) {
                            Task {
                                try? await appModel.environment.savedQueryStore.delete(id: query.id)
                                queries.removeAll { $0.id == query.id }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .frame(width: 420, height: 320)
        .task { queries = (try? await appModel.environment.savedQueryStore.all()) ?? [] }
    }
}
