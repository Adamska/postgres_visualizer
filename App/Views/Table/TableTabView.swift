import SwiftUI
import TableCore

/// Browses and edits one table: toolbar, optional filter bar, grid and pagination.
struct TableTabView: View {
    @Environment(AppModel.self) private var appModel
    @AppStorage(PreferenceKey.gridFontSize) private var gridFontSize = PreferenceDefaults.gridFontSize
    @AppStorage(PreferenceKey.confirmBeforeCommit) private var confirmBeforeCommit = PreferenceDefaults.confirmBeforeCommit
    @Bindable var model: TableTabModel
    let connection: ConnectionModel

    @State private var editingCell: GridCellPosition?
    @State private var showCommitPreview = false
    @State private var showExport = false
    @State private var showImport = false

    var body: some View {
        VStack(spacing: 0) {
            TableToolbar(model: model, onCommit: requestCommit, onExport: { showExport = true }, onImport: { showImport = true })
            HairlineDivider()
            if model.isFilterBarVisible, let structure = model.structure {
                FilterBarView(model: model, structure: structure)
                HairlineDivider()
            }
            if let error = model.error {
                ErrorBanner(error: error)
            }
            content
            HairlineDivider()
            TablePaginationBar(model: model)
        }
        .task(id: model.query.table) { if model.result == nil { await model.load() } }
        .sheet(item: $editingCell) { position in
            ValueEditorSheet(model: model, position: position)
        }
        .sheet(isPresented: $showCommitPreview) {
            ChangesPreviewSheet(model: model)
        }
        .sheet(isPresented: $showExport) {
            ExportSheet(
                title: "Export \(model.query.table.description)",
                hasSelection: !model.selectedRows.isEmpty,
                defaultName: model.query.table.name
            ) { format, selectionOnly in
                model.exportText(format: format, scope: selectionOnly ? .selection : .page)
            }
        }
        .sheet(isPresented: $showImport) {
            if let structure = model.structure {
                CSVImportSheet(structure: structure, connection: connection) { await model.reload() }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .refreshRequested)) { _ in
            if isSelected { Task { await model.reload() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: .commitRequested)) { _ in
            if isSelected { requestCommit() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportRequested)) { _ in
            if isSelected { showExport = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: .importCSVRequested)) { _ in
            if isSelected { showImport = true }
        }
    }

    private var isSelected: Bool {
        appModel.selectedTab?.tableModel === model
    }

    @ViewBuilder private var content: some View {
        if model.isLoading && model.result == nil {
            ProgressView("Loading \(model.query.table.description)…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.result == nil {
            EmptyStateView(systemImage: "exclamationmark.triangle", title: "Could not load the table") {
                Button("Retry") { Task { await model.load() } }
            }
        } else if model.gridContent.rows.isEmpty {
            ZStack {
                grid
                EmptyStateView(
                    systemImage: model.query.hasActiveFilters ? "line.3.horizontal.decrease.circle" : "tray",
                    title: model.query.hasActiveFilters ? "No rows match the filters" : "This table is empty"
                ) {
                    if model.query.hasActiveFilters {
                        Button("Clear Filters") { Task { await model.clearFilters() } }
                    } else if model.isEditable {
                        Button("Add Row") { model.addRow() }
                    }
                }
                .allowsHitTesting(true)
            }
        } else {
            grid
        }
    }

    private var grid: some View {
        DataGridView(
            content: model.gridContent,
            sort: model.sortState,
            hiddenColumnIDs: model.hiddenColumnIDs,
            focusedCell: model.focusedCell,
            fontSize: gridFontSize,
            actions: gridActions
        )
    }

    private var gridActions: GridActions {
        var actions = GridActions()
        actions.onSelectionChange = { rows, focused in
            model.selectedRows = rows
            model.focusedCell = focused
        }
        actions.onSortRequest = { column in Task { await model.toggleSort(columnID: column.id) } }
        actions.onCommitEdit = { position, value in model.setValue(value, at: position) }
        actions.onOpenEditor = { position in editingCell = position }
        actions.onDeleteRows = { rows in model.toggleDelete(rows: rows) }
        actions.onFollowForeignKey = { position in
            if let target = model.foreignKeyTarget(at: position) {
                appModel.openTable(target.table, on: connection, filters: [target.filter])
            }
        }
        actions.onToggleColumnVisibility = { columnID in
            if model.hiddenColumnIDs.contains(columnID) { model.hiddenColumnIDs.remove(columnID) } else { model.hiddenColumnIDs.insert(columnID) }
        }
        return actions
    }

    private func requestCommit() {
        guard !model.changes.isEmpty else { return }
        if confirmBeforeCommit {
            showCommitPreview = true
        } else {
            Task { await model.commit() }
        }
    }
}

extension GridCellPosition: Identifiable {
    var id: String { "\(row):\(column)" }
}

/// Actions above the grid: filters, refresh, row editing and the commit bar.
private struct TableToolbar: View {
    @Bindable var model: TableTabModel
    var onCommit: () -> Void
    var onExport: () -> Void
    var onImport: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button {
                model.isFilterBarVisible.toggle()
            } label: {
                Label("Filter", systemImage: model.query.hasActiveFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    .foregroundStyle(model.query.hasActiveFilters ? Color.accentColor : .primary)
            }
            .help("Show filters (⇧⌘F)")

            Button {
                Task { await model.reload() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .help("Reload the current page (⌘R)")

            Divider().frame(height: 16)

            Button { model.addRow() } label: { Label("Add Row", systemImage: "plus") }
                .help("Add a row (⌥⌘N)")
                .disabled(!model.isEditable)
            Button { model.toggleDelete(rows: model.selectedRows) } label: { Label("Delete Row", systemImage: "minus") }
                .help("Mark the selected rows for deletion")
                .disabled(!model.isEditable || model.selectedRows.isEmpty)
            Button { model.duplicateRows(model.selectedRows) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
                .help("Duplicate the selected rows")
                .disabled(!model.isEditable || model.selectedRows.isEmpty)

            Divider().frame(height: 16)

            Menu {
                Button("Export…", action: onExport)
                Button("Import CSV…", action: onImport).disabled(!model.isEditable)
                Divider()
                Button("Copy SELECT") { copyToPasteboard(model.query.sql(defaultOrder: model.structure?.primaryKeyColumns ?? [])) }
            } label: {
                Label("More", systemImage: "ellipsis.circle")
            }
            .menuIndicator(.hidden)
            .fixedSize()

            if let reason = model.readOnlyReason {
                Label(reason, systemImage: "lock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if !model.changes.isEmpty {
                HStack(spacing: 6) {
                    Text("\(model.changes.count) pending \(model.changes.count == 1 ? "change" : "changes")")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Button("Discard") { model.discardChanges() }
                        .help("Discard all staged changes (⌥⌘Z)")
                    Button(action: onCommit) {
                        Label("Commit", systemImage: "checkmark")
                            .labelStyle(.titleAndIcon)
                    }
                    .buttonStyle(.glassProminent)
                    .help("Write the staged changes in one transaction (⌘S)")
                    .disabled(model.isCommitting)
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .controlSize(.regular)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .animation(.snappy, value: model.changes.isEmpty)
    }
}
