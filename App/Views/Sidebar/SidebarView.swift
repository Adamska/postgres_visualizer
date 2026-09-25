import SwiftUI
import TableCore

/// Left column: open connections with their object trees, then saved connections.
struct SidebarView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(PreferenceKey.showSystemSchemas) private var showSystemSchemas = PreferenceDefaults.showSystemSchemas
    @State private var searchText = ""
    var onNewConnection: () -> Void
    var onEditConnection: (ConnectionProfile) -> Void

    var body: some View {
        List {
            ForEach(model.connections) { connection in
                ConnectionSection(
                    connection: connection,
                    searchText: searchText,
                    showSystemSchemas: showSystemSchemas,
                    onEdit: { onEditConnection(connection.profile) }
                )
            }
            if !model.closedProfiles.isEmpty {
                savedConnections
            }
        }
        .listStyle(.sidebar)
        .searchable(text: $searchText, placement: .sidebar, prompt: "Filter tables")
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button(action: onNewConnection) {
                    Label("New Connection", systemImage: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                Spacer()
            }
            .background(.bar)
        }
    }

    private var savedConnections: some View {
        Section("Saved Connections") {
            ForEach(groupedProfiles, id: \.group) { group in
                if let name = group.group {
                    Text(name)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 2, trailing: 8))
                }
                ForEach(group.profiles) { profile in
                    SavedProfileRow(profile: profile, onEdit: { onEditConnection(profile) })
                }
            }
        }
    }

    private var groupedProfiles: [(group: String?, profiles: [ConnectionProfile])] {
        let filtered = model.closedProfiles.filter { searchText.isEmpty || $0.displayName.localizedCaseInsensitiveContains(searchText) }
        let groups = Dictionary(grouping: filtered) { $0.group?.trimmingCharacters(in: .whitespaces).nilIfEmpty }
        return groups.keys.sorted { lhs, rhs in
            switch (lhs, rhs) {
            case (nil, _): true
            case (_, nil): false
            case (let left?, let right?): left.localizedCaseInsensitiveCompare(right) == .orderedAscending
            }
        }
        .map { key in (key, (groups[key] ?? []).sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }) }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// A saved, not yet opened profile.
private struct SavedProfileRow: View {
    @Environment(AppModel.self) private var model
    let profile: ConnectionProfile
    var onEdit: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            ProfileColorDot(color: profile.color)
            VStack(alignment: .leading, spacing: 1) {
                Text(profile.displayName).lineLimit(1)
                Text(profile.endpointDescription).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .onTapGesture { Task { await model.connect(profile) } }
        .contextMenu {
            Button("Connect") { Task { await model.connect(profile) } }
            Button("Edit…", action: onEdit)
            Button("Copy URL") { copyToPasteboard(ConnectionURLParser.url(for: profile)) }
            Divider()
            Button("Delete", role: .destructive) { Task { await model.deleteProfile(id: profile.id) } }
        }
    }
}

/// One open connection and its schemas.
private struct ConnectionSection: View {
    @Environment(AppModel.self) private var model
    let connection: ConnectionModel
    let searchText: String
    let showSystemSchemas: Bool
    var onEdit: () -> Void

    var body: some View {
        Section {
            switch connection.status {
            case .connecting:
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Connecting…").foregroundStyle(.secondary)
                }
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red).lineLimit(2)
            case .connected:
                ForEach(visibleSchemas) { schema in
                    SchemaGroup(connection: connection, schema: schema, searchText: searchText)
                }
            }
        } header: {
            header
        }
    }

    private var visibleSchemas: [SchemaInfo] {
        connection.schemas.filter { showSystemSchemas || !$0.isSystem }
    }

    private var header: some View {
        HStack(spacing: 6) {
            ProfileColorDot(color: connection.profile.color)
            Text(connection.displayName)
                .lineLimit(1)
                .foregroundStyle(model.selectedConnectionID == connection.id ? .primary : .secondary)
            Spacer()
            if connection.isSchemaLoading {
                ProgressView().controlSize(.mini)
            }
            Menu {
                Button("New Query Tab") { _ = model.newQueryTab(on: connection) }
                Button("Refresh Schema") { Task { await connection.refreshSchemas() } }
                Button("Edit Connection…", action: onEdit)
                Button("Copy URL") { copyToPasteboard(ConnectionURLParser.url(for: connection.profile)) }
                Divider()
                Text("PostgreSQL \(connection.serverVersion)")
                Divider()
                Button("Disconnect") { Task { await model.disconnect(connection) } }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
        }
        .contentShape(Rectangle())
        .onTapGesture { model.selectedConnectionID = connection.id }
    }
}

/// A schema with its relations and functions, loaded lazily on expansion.
private struct SchemaGroup: View {
    @Environment(AppModel.self) private var model
    let connection: ConnectionModel
    let schema: SchemaInfo
    let searchText: String

    private var isExpanded: Binding<Bool> {
        Binding(
            get: { connection.expandedSchemas.contains(schema.name) || !searchText.isEmpty },
            set: { expanded in
                if expanded {
                    connection.expandedSchemas.insert(schema.name)
                    Task { await connection.loadObjects(in: schema.name) }
                } else {
                    connection.expandedSchemas.remove(schema.name)
                }
            }
        )
    }

    var body: some View {
        DisclosureGroup(isExpanded: isExpanded) {
            let relations = filteredRelations
            if connection.loadingSchemas.contains(schema.name) {
                ProgressView().controlSize(.small)
            } else if relations.isEmpty && filteredFunctions.isEmpty {
                Text(searchText.isEmpty ? "Empty schema" : "No matches").foregroundStyle(.tertiary).font(.callout)
            }
            ForEach(relations) { relation in
                RelationRow(connection: connection, relation: relation)
            }
            if !filteredFunctions.isEmpty {
                DisclosureGroup("Functions") {
                    ForEach(filteredFunctions) { function in
                        FunctionRow(connection: connection, function: function)
                    }
                }
            }
        } label: {
            Label(schema.name, systemImage: "folder")
                .foregroundStyle(schema.isSystem ? .secondary : .primary)
        }
        .task(id: searchText.isEmpty) {
            if !searchText.isEmpty { await connection.loadObjects(in: schema.name) }
        }
    }

    private var filteredRelations: [RelationInfo] {
        let relations = connection.relations(in: schema.name)
        guard !searchText.isEmpty else { return relations }
        return relations.filter { $0.ref.name.localizedCaseInsensitiveContains(searchText) }
    }

    private var filteredFunctions: [FunctionInfo] {
        let functions = connection.functions(in: schema.name)
        guard !searchText.isEmpty else { return functions }
        return functions.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }
}

private struct RelationRow: View {
    @Environment(AppModel.self) private var model
    let connection: ConnectionModel
    let relation: RelationInfo

    private var isOpen: Bool {
        model.selectedTab?.connection.id == connection.id && model.selectedTab?.tableModel?.query.table == relation.ref
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(relation.kind == .table || relation.kind == .partitionedTable ? Color.accentColor : Color.teal)
                .frame(width: 16)
            Text(relation.ref.name).lineLimit(1)
            Spacer(minLength: 4)
            if let count = relation.estimatedRowCount {
                Text(Self.compact(count))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(Rectangle())
        .fontWeight(isOpen ? .semibold : .regular)
        .onTapGesture { model.openTable(relation.ref, on: connection) }
        .help(relation.comment ?? relation.kind.title)
        .contextMenu {
            Button("Open") { model.openTable(relation.ref, on: connection) }
            Button("Open in New Tab") { model.openTable(relation.ref, on: connection, reuseExisting: false) }
            Button("Structure") { model.openStructure(relation.ref, on: connection) }
            Button("Query") { _ = model.newQueryTab(on: connection, sql: "SELECT * FROM \(relation.ref.quoted)\nLIMIT 100;") }
            Divider()
            Button("Copy Name") { copyToPasteboard(relation.ref.quoted) }
        }
    }

    private var icon: String {
        switch relation.kind {
        case .table: "tablecells"
        case .partitionedTable: "tablecells.badge.ellipsis"
        case .view: "eye"
        case .materializedView: "eye.square"
        case .foreignTable: "tablecells.fill.badge.ellipsis"
        }
    }

    static func compact(_ count: Int) -> String {
        switch count {
        case ..<1_000: "\(count)"
        case ..<1_000_000: String(format: "%.1fk", Double(count) / 1_000)
        default: String(format: "%.1fM", Double(count) / 1_000_000)
        }
    }
}

private struct FunctionRow: View {
    @Environment(AppModel.self) private var model
    let connection: ConnectionModel
    let function: FunctionInfo

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "function").foregroundStyle(Color.purple).frame(width: 16)
            Text(function.signature).lineLimit(1)
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            let call = function.isProcedure ? "CALL \(function.name)();" : "SELECT * FROM \(function.name)();"
            _ = model.newQueryTab(on: connection, sql: call)
        }
        .help("\(function.language) → \(function.returnType)")
    }
}

@MainActor
func copyToPasteboard(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
}
