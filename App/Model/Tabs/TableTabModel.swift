import Foundation
import Observation
import TableCore

/// Browses one table page by page, and stages edits until they are committed.
@Observable
@MainActor
final class TableTabModel {
    /// Where a grid row comes from.
    enum RowSource: Hashable {
        case existing(index: Int)
        case inserted(id: UUID)
    }

    enum ExportScope {
        case page
        case selection
    }

    var query: TableQuery {
        didSet { if query.pageSize != oldValue.pageSize { query.page = 0 } }
    }
    private(set) var structure: TableStructure?
    private(set) var result: QueryResult?
    private(set) var totalCount: Int?
    private(set) var isLoading = false
    private(set) var isCommitting = false
    private(set) var error: DatabaseError?
    private(set) var changes = ChangeSet()
    private(set) var gridContent = GridContent.empty
    private(set) var lastLoadDuration: Duration?
    var hiddenColumnIDs: Set<Int> = []
    var selectedRows = IndexSet()
    var focusedCell: GridCellPosition?
    var isFilterBarVisible = false

    private let connection: ConnectionModel
    private var gridVersion = 0
    private var countTask: Task<Void, Never>?

    init(query: TableQuery, connection: ConnectionModel) {
        self.query = query
        self.connection = connection
        isFilterBarVisible = query.hasActiveFilters
    }

    // MARK: Derived state

    var isEditable: Bool { structure?.isEditable ?? false }

    var readOnlyReason: String? {
        guard let structure else { return nil }
        if !structure.kind.isEditable { return "\(structure.kind.title)s are read-only." }
        if structure.primaryKeyColumns.isEmpty { return "This table has no primary key, so rows cannot be edited safely." }
        return nil
    }

    var pageRange: String {
        guard let result else { return "" }
        if result.rows.isEmpty { return "No rows" }
        let first = query.offset + 1
        let last = query.offset + result.rows.count
        if let totalCount { return "\(first)–\(last) of \(ValueFormatting.rowCount(totalCount))" }
        return "\(first)–\(last)"
    }

    var canGoToNextPage: Bool {
        guard let result else { return false }
        if let totalCount { return query.offset + result.rows.count < totalCount }
        return result.rows.count == query.pageSize
    }

    var canGoToPreviousPage: Bool { query.page > 0 }

    var sortState: GridSortState? {
        guard let sort = query.sort.first, let column = gridContent.columns.first(where: { $0.name == sort.column }) else { return nil }
        return GridSortState(columnID: column.id, ascending: sort.ascending)
    }

    var pendingStatements: [String] {
        guard let structure else { return [] }
        return changes.statements(for: structure)
    }

    func rowSource(at row: Int) -> RowSource? {
        guard let result else { return nil }
        if row < result.rows.count { return .existing(index: row) }
        let insertIndex = row - result.rows.count
        guard changes.inserts.indices.contains(insertIndex) else { return nil }
        return .inserted(id: changes.inserts[insertIndex].id)
    }

    func identity(ofExistingRow index: Int) -> RowIdentity? {
        guard let result, let structure, result.rows.indices.contains(index) else { return nil }
        return RowIdentity(structure: structure, row: result.rows[index], columns: result.columns)
    }

    /// The raw value shown in a cell, taking staged edits into account.
    func value(at position: GridCellPosition) -> CellValue? {
        guard let result, result.columns.indices.contains(position.column) else { return nil }
        let column = result.columns[position.column]
        switch rowSource(at: position.row) {
        case .existing(let index):
            if let identity = identity(ofExistingRow: index), let staged = changes.stagedValue(column: column.name, row: identity) {
                return staged.cellValue
            }
            return result.rows[index][position.column]
        case .inserted(let id):
            return changes.insert(id)?.values[column.name]?.cellValue
        case nil:
            return nil
        }
    }

    func column(at index: Int) -> ResultColumn? {
        guard let result, result.columns.indices.contains(index) else { return nil }
        return result.columns[index]
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let structure = try await connection.structure(of: query.table)
            self.structure = structure
            let sql = query.sql(defaultOrder: structure.primaryKeyColumns)
            let result = try await connection.execute(sql, rowLimit: nil)
            self.result = result
            lastLoadDuration = result.duration
            rebuildGrid()
            loadCount()
        } catch {
            self.error = DatabaseError(error)
        }
    }

    /// Reloads the page, keeping staged changes.
    func reload() async {
        await load()
    }

    private func loadCount() {
        countTask?.cancel()
        let countSQL = query.countSQL
        countTask = Task { [weak self] in
            guard let self else { return }
            let result = try? await connection.execute(countSQL, rowLimit: 1)
            guard !Task.isCancelled else { return }
            totalCount = result?.rows.first?.first?.stringValue.flatMap(Int.init)
        }
    }

    func goToNextPage() async {
        guard canGoToNextPage else { return }
        query.page += 1
        await load()
    }

    func goToPreviousPage() async {
        guard canGoToPreviousPage else { return }
        query.page -= 1
        await load()
    }

    func toggleSort(columnID: Int) async {
        guard let column = column(at: columnID) else { return }
        query.toggleSort(column: column.name)
        await load()
    }

    func applyFilters() async {
        query.page = 0
        await load()
    }

    func addFilter(column: String? = nil) {
        let name = column ?? structure?.columns.first?.name ?? ""
        query.filters.append(Filter(column: name))
        isFilterBarVisible = true
    }

    func removeFilter(id: UUID) async {
        query.filters.removeAll { $0.id == id }
        await applyFilters()
    }

    func clearFilters() async {
        query.filters = []
        query.rawWhere = ""
        await applyFilters()
    }

    // MARK: Editing

    func setValue(_ value: EditValue, at position: GridCellPosition) {
        guard isEditable, let result, let column = column(at: position.column) else { return }
        switch rowSource(at: position.row) {
        case .existing(let index):
            guard let identity = identity(ofExistingRow: index), !changes.isDeleted(identity) else { return }
            changes.setValue(value, original: result.rows[index][position.column], column: column.name, row: identity)
        case .inserted(let id):
            changes.setInsertValue(value, column: column.name, insertID: id)
        case nil:
            return
        }
        rebuildGrid()
    }

    func toggleDelete(rows: IndexSet) {
        guard isEditable else { return }
        for row in rows.reversed() {
            switch rowSource(at: row) {
            case .existing(let index):
                guard let identity = identity(ofExistingRow: index) else { continue }
                if changes.isDeleted(identity) { changes.unmarkDeleted(identity) } else { changes.markDeleted(identity) }
            case .inserted(let id):
                changes.removeInsert(id)
            case nil:
                continue
            }
        }
        rebuildGrid()
    }

    /// Appends an empty row and focuses its first editable cell.
    func addRow() {
        guard isEditable, let result else { return }
        let insert = changes.addInsert()
        rebuildGrid()
        let newRow = result.rows.count + changes.inserts.count - 1
        let firstEditable = gridContent.columns.first { $0.isEditable && !$0.isPrimaryKey } ?? gridContent.columns.first
        focusedCell = GridCellPosition(row: newRow, column: firstEditable?.id ?? 0)
        selectedRows = IndexSet(integer: newRow)
        _ = insert
    }

    /// Copies the selected rows as pending inserts, leaving identity and generated columns to the server.
    func duplicateRows(_ rows: IndexSet) {
        guard isEditable, let result, let structure else { return }
        for row in rows {
            var values: [String: EditValue] = [:]
            for column in structure.columns where column.isWritable && !column.isIdentity {
                guard let value = value(at: GridCellPosition(row: row, column: result.columnIndex(named: column.name) ?? -1)) else { continue }
                if column.isPrimaryKey && column.hasServerDefault { continue }
                values[column.name] = EditValue(value)
            }
            changes.addInsert(PendingInsert(values: values))
        }
        rebuildGrid()
    }

    func discardChanges() {
        changes.removeAll()
        rebuildGrid()
    }

    /// Applies the staged changes in one transaction, then reloads the page.
    func commit() async {
        guard let structure, !changes.isEmpty else { return }
        isCommitting = true
        error = nil
        defer { isCommitting = false }
        do {
            _ = try await connection.executeTransaction(changes.statements(for: structure))
            changes.removeAll()
            await load()
        } catch {
            self.error = DatabaseError(error)
        }
    }

    /// The table and filter to open when following the foreign key of a cell.
    func foreignKeyTarget(at position: GridCellPosition) -> (table: TableRef, filter: Filter)? {
        guard let structure, let column = column(at: position.column),
              let foreignKey = structure.foreignKey(for: column.name),
              let value = value(at: position), case .text(let text) = value,
              let referenced = foreignKey.referencedColumns.first else { return nil }
        return (foreignKey.referencedTable, Filter(column: referenced, op: .equals, value: text))
    }

    // MARK: Export

    func exportText(format: ExportFormat, scope: ExportScope) -> String {
        guard let result else { return "" }
        let indexes = scope == .selection && !selectedRows.isEmpty ? Array(selectedRows) : Array(result.rows.indices)
        let rows = indexes.compactMap { index -> [CellValue]? in
            guard result.rows.indices.contains(index) else { return nil }
            return result.rows[index]
        }
        return ResultExporter.export(columns: result.columns, rows: rows, format: format, table: query.table)
    }

    // MARK: Grid

    private func rebuildGrid() {
        guard let result else {
            gridContent = .empty
            return
        }
        gridVersion += 1
        let columns = GridContentBuilder.columns(for: result, structure: structure)
        let rows: [GridRow]
        if let structure, structure.isEditable {
            rows = GridContentBuilder.rows(for: result, structure: structure, changes: changes)
        } else {
            rows = GridContentBuilder.rows(for: result)
        }
        gridContent = GridContent(columns: columns, rows: rows, version: gridVersion)
    }
}
