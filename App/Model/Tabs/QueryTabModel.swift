import Foundation
import Observation
import TableCore

/// A SQL editor with its own session, so manual transactions stay isolated per tab.
@Observable
@MainActor
final class QueryTabModel: SQLCompletionProviding {
    var text: String {
        didSet { if text != oldValue { errorMarker = nil } }
    }
    var selectedRange = NSRange(location: 0, length: 0)
    var customTitle: String?
    private(set) var results: [QueryResult] = []
    var selectedResultIndex = 0 {
        didSet { rebuildGrid() }
    }
    private(set) var error: DatabaseError?
    private(set) var errorMarker: SQLErrorMarker?
    private(set) var isRunning = false
    private(set) var statusMessage: String?
    private(set) var isInTransaction = false
    private(set) var gridContent = GridContent.empty
    var hiddenColumnIDs: Set<Int> = []
    var selectedRows = IndexSet()
    var focusedCell: GridCellPosition?

    let connection: ConnectionModel
    private let environment: AppEnvironment
    private var session: (any DatabaseSession)?
    private var runTask: Task<Void, Never>?
    private var gridVersion = 0

    init(text: String = "", customTitle: String? = nil, connection: ConnectionModel, environment: AppEnvironment) {
        self.text = text
        self.customTitle = customTitle
        self.connection = connection
        self.environment = environment
    }

    // MARK: Derived state

    var title: String {
        if let customTitle, !customTitle.isEmpty { return customTitle }
        let firstLine = text.split(whereSeparator: \.isNewline).first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
        if firstLine.isEmpty { return "Query" }
        return firstLine.count > 28 ? String(firstLine.prefix(28)) + "…" : firstLine
    }

    var selectedResult: QueryResult? {
        results.indices.contains(selectedResultIndex) ? results[selectedResultIndex] : nil
    }

    var rowLimit: Int {
        let stored = UserDefaults.standard.integer(forKey: PreferenceKey.queryRowLimit)
        return stored > 0 ? stored : PreferenceDefaults.queryRowLimit
    }

    // MARK: Statement selection

    /// Statements to run for a scope, with their location in the editor text.
    func statements(for scope: SQLRunScope) -> [SQLStatement] {
        switch scope {
        case .all:
            return SQLStatementSplitter.split(text)
        case .currentStatement:
            if selectedRange.length > 0, let range = Range(selectedRange, in: text) {
                let selection = String(text[range])
                return SQLStatementSplitter.split(selection).map { statement in
                    let start = text.index(range.lowerBound, offsetBy: selection.distance(from: selection.startIndex, to: statement.range.lowerBound))
                    let end = text.index(range.lowerBound, offsetBy: selection.distance(from: selection.startIndex, to: statement.range.upperBound))
                    return SQLStatement(text: statement.text, range: start..<end)
                }
            }
            let caret = Range(NSRange(location: selectedRange.location, length: 0), in: text)?.lowerBound ?? text.endIndex
            return SQLStatementSplitter.statement(at: caret, in: text).map { [$0] } ?? []
        }
    }

    // MARK: Execution

    /// Starts executing the statements for the scope. The returned task completes when the
    /// results (or the error) are in place.
    @discardableResult
    func run(_ scope: SQLRunScope) -> Task<Void, Never>? {
        let statements = statements(for: scope)
        guard !statements.isEmpty, !isRunning else { return nil }
        isRunning = true
        let task = Task { await execute(statements) }
        runTask = task
        return task
    }

    /// Runs EXPLAIN on the current statement and shows the plan as a result.
    @discardableResult
    func explain(analyze: Bool) -> Task<Void, Never>? {
        guard let statement = statements(for: .currentStatement).first, !isRunning else { return nil }
        let options = analyze ? "(ANALYZE, BUFFERS, FORMAT TEXT)" : "(FORMAT TEXT)"
        let explain = SQLStatement(text: "EXPLAIN \(options) \(statement.text)", range: statement.range)
        isRunning = true
        let task = Task { await execute([explain]) }
        runTask = task
        return task
    }

    /// Runs a statement that is not part of the editor text, such as COMMIT from the toolbar.
    @discardableResult
    func runDetached(_ sql: String) -> Task<Void, Never>? {
        guard !isRunning else { return nil }
        isRunning = true
        let task = Task { await execute([SQLStatement(text: sql, range: text.startIndex..<text.startIndex)]) }
        runTask = task
        return task
    }

    func cancel() {
        runTask?.cancel()
    }

    private func execute(_ statements: [SQLStatement]) async {
        error = nil
        errorMarker = nil
        statusMessage = nil
        defer { isRunning = false }
        do {
            let session = try await activeSession()
            var collected: [QueryResult] = []
            let clock = ContinuousClock()
            let start = clock.now
            for statement in statements {
                try Task.checkCancellation()
                do {
                    let result = try await session.execute(statement.text, options: ExecutionOptions(rowLimit: rowLimit))
                    collected.append(result)
                    trackTransaction(statement.text)
                    await record(statement.text, result: result)
                } catch {
                    let databaseError = DatabaseError(error)
                    await record(statement.text, duration: clock.now - start, failure: true)
                    if databaseError.category == .cancelled { await resetSession() }
                    self.error = databaseError
                    errorMarker = Self.marker(for: databaseError, statement: statement, in: text)
                    if isInTransaction, databaseError.category == .server { statusMessage = "Transaction aborted. Run ROLLBACK to continue." }
                    break
                }
            }
            results = collected
            selectedResultIndex = max(0, collected.count - 1)
            if error == nil {
                let total = clock.now - start
                statusMessage = collected.count == 1
                    ? collected[0].summary
                    : "\(collected.count) statements in \(ValueFormatting.duration(total))"
            }
            rebuildGrid()
        } catch {
            self.error = DatabaseError(error)
        }
    }

    private func activeSession() async throws -> any DatabaseSession {
        if let session, await !session.isClosed { return session }
        let session = try await connection.openSecondarySession()
        self.session = session
        return session
    }

    private func resetSession() async {
        await session?.close()
        session = nil
        isInTransaction = false
    }

    func closeSession() async {
        await resetSession()
    }

    private func trackTransaction(_ sql: String) {
        switch SQLStatementKind.classify(sql) {
        case .transactionBegin: isInTransaction = true
        case .transactionCommit, .transactionRollback: isInTransaction = false
        default: break
        }
    }

    private func record(_ sql: String, result: QueryResult) async {
        await record(sql, duration: result.duration, failure: false, rowCount: result.hasRows ? result.rows.count : result.affectedRows)
    }

    private func record(_ sql: String, duration: Duration, failure: Bool, rowCount: Int? = nil) async {
        let entry = QueryHistoryEntry(profileID: connection.id, sql: sql, duration: duration, succeeded: !failure, rowCount: rowCount)
        try? await environment.historyStore.record(entry)
    }

    /// Converts a server error position (1-based character offset in the statement) into an
    /// editor range covering the token at that position.
    static func marker(for error: DatabaseError, statement: SQLStatement, in script: String) -> SQLErrorMarker? {
        guard let position = error.position, position > 0, !statement.range.isEmpty else { return nil }
        let offset = min(position - 1, statement.text.count)
        let tokenIndex = statement.text.index(statement.text.startIndex, offsetBy: offset)
        let token = SQLTokenizer.tokenize(statement.text).first { $0.range.contains(tokenIndex) }
        let length = max(1, token?.text.utf16.count ?? 1)
        let scriptIndex = script.index(statement.range.lowerBound, offsetBy: offset, limitedBy: script.endIndex) ?? script.endIndex
        let location = script.utf16.distance(from: script.startIndex, to: scriptIndex)
        return SQLErrorMarker(location: location, length: length, message: error.message)
    }

    // MARK: Completion

    func completions(prefix: String, qualifier: String?) -> [SQLCompletion] {
        var columns: [TableRef: [ColumnInfo]] = [:]
        for reference in SQLCompletionEngine.referencedTables(in: text, relations: connection.allRelations) {
            if let structure = connection.cachedStructure(of: reference.table) {
                columns[reference.table] = structure.columns
            } else {
                // Warm the cache so the next keystroke can offer the columns.
                Task { _ = try? await connection.structure(of: reference.table) }
            }
        }
        let engine = SQLCompletionEngine(
            schemas: connection.schemas.map(\.name),
            relations: connection.allRelations,
            functions: connection.functions.values.flatMap { $0 },
            columns: columns
        )
        return engine.completions(prefix: prefix, qualifier: qualifier, sql: text)
    }

    // MARK: Saved queries and export

    func save(as name: String) async throws {
        let query = SavedQuery(name: name, sql: text, profileID: connection.id)
        try await environment.savedQueryStore.save(query)
        customTitle = name
    }

    func exportText(format: ExportFormat, selectionOnly: Bool) -> String {
        guard let result = selectedResult else { return "" }
        let indexes = selectionOnly && !selectedRows.isEmpty ? Array(selectedRows) : Array(result.rows.indices)
        let rows = indexes.filter { result.rows.indices.contains($0) }.map { result.rows[$0] }
        return ResultExporter.export(columns: result.columns, rows: rows, format: format)
    }

    // MARK: Grid

    private func rebuildGrid() {
        guard let result = selectedResult, result.hasRows else {
            gridContent = .empty
            return
        }
        gridVersion += 1
        gridContent = GridContent(
            columns: GridContentBuilder.columns(for: result, structure: nil),
            rows: GridContentBuilder.rows(for: result),
            version: gridVersion
        )
    }
}
