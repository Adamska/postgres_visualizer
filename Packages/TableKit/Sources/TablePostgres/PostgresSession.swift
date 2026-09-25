public import Foundation
import Logging
import NIOCore
import PostgresNIO
public import TableCore

/// A live PostgresNIO connection exposed through the `DatabaseSession` protocol.
///
/// Statements run one at a time. Row-returning statements stream through the new async API
/// and stop at the configured row limit; data-modification statements use the callback API
/// so the command tag (and therefore the affected row count) is available.
public actor PostgresSession: DatabaseSession {
    public nonisolated let profileID: UUID

    private let connection: PostgresConnection
    private let logger: Logger
    private var decoder = PostgresBinaryDecoder()
    private var closed = false

    init(connection: PostgresConnection, profileID: UUID, logger: Logger) {
        self.connection = connection
        self.profileID = profileID
        self.logger = logger
    }

    public var isClosed: Bool { closed }

    // MARK: Lifecycle

    /// Loads the type catalog so arbitrary result columns can be decoded.
    func bootstrap() async throws {
        _ = try await typeCatalog()
    }

    public func close() async {
        guard !closed else { return }
        closed = true
        try? await connection.close()
    }

    // MARK: Execution

    public func execute(_ sql: String, options: ExecutionOptions) async throws -> QueryResult {
        guard !closed else { throw DatabaseError(category: .connection, message: "The connection is closed.") }
        let clock = ContinuousClock()
        let start = clock.now
        do {
            var result = SQLStatementKind.classify(sql).isDataModification
                ? try await executeModification(sql)
                : try await executeStreaming(sql, rowLimit: options.rowLimit)
            result.duration = clock.now - start
            return result
        } catch {
            throw DatabaseError(error)
        }
    }

    private func executeStreaming(_ sql: String, rowLimit: Int?) async throws -> QueryResult {
        let rows = try await connection.query(PostgresQuery(unsafeSQL: sql), logger: logger)
        var columns: [ResultColumn] = []
        var decodedRows: [[CellValue]] = []
        var isTruncated = false

        for try await row in rows {
            if columns.isEmpty {
                columns = try await describeColumns(of: row)
            }
            if let rowLimit, decodedRows.count >= rowLimit {
                isTruncated = true
                break
            }
            decodedRows.append(decode(row))
        }
        return QueryResult(statement: sql, columns: columns, rows: decodedRows, isTruncated: isTruncated)
    }

    private func executeModification(_ sql: String) async throws -> QueryResult {
        let queryResult = try await connection.query(sql).get()
        var columns: [ResultColumn] = []
        var decodedRows: [[CellValue]] = []
        for row in queryResult.rows {
            if columns.isEmpty { columns = try await describeColumns(of: row) }
            decodedRows.append(decode(row))
        }
        let metadata = queryResult.metadata
        let tag = metadata.rows.map { "\(metadata.command) \($0)" } ?? metadata.command
        return QueryResult(statement: sql, columns: columns, rows: decodedRows, commandTag: tag, affectedRows: metadata.rows)
    }

    /// Builds column descriptions from the first row, refreshing the catalog when it references
    /// types created after the session was opened.
    private func describeColumns(of row: PostgresRow) async throws -> [ResultColumn] {
        let cells = Array(row)
        if cells.contains(where: { decoder.catalog[$0.dataType.rawValue] == nil }) {
            _ = try? await typeCatalog()
        }
        return cells.enumerated().map { index, cell in
            let oid = cell.dataType.rawValue
            return ResultColumn(
                name: cell.columnName,
                typeOID: oid,
                typeName: decoder.catalog.name(of: oid),
                kind: decoder.catalog.kind(of: oid),
                index: index
            )
        }
    }

    private func decode(_ row: PostgresRow) -> [CellValue] {
        row.map { cell in
            let bytes = cell.bytes.map { Array($0.readableBytesView) }
            return decoder.decode(bytes, oid: cell.dataType.rawValue, isText: cell.format == .text)
        }
    }

    // MARK: Catalog

    public func serverVersion() async throws -> String {
        let result = try await execute("SHOW server_version", options: ExecutionOptions(rowLimit: 1))
        return result.rows.first?.first?.stringValue ?? "unknown"
    }

    public func typeCatalog() async throws -> TypeCatalog {
        let result = try await execute(CatalogQueries.types, options: ExecutionOptions(rowLimit: nil))
        let catalog = TypeCatalog(types: CatalogQueries.parseTypes(result) + BuiltinTypes.all)
        decoder.catalog = catalog
        return catalog
    }

    public func listSchemas() async throws -> [SchemaInfo] {
        CatalogQueries.parseSchemas(try await execute(CatalogQueries.schemas, options: ExecutionOptions(rowLimit: nil)))
    }

    public func listRelations(in schema: String) async throws -> [RelationInfo] {
        let result = try await execute(CatalogQueries.relations(in: schema), options: ExecutionOptions(rowLimit: nil))
        return CatalogQueries.parseRelations(result, schema: schema)
    }

    public func listFunctions(in schema: String) async throws -> [FunctionInfo] {
        let result = try await execute(CatalogQueries.functions(in: schema), options: ExecutionOptions(rowLimit: nil))
        return CatalogQueries.parseFunctions(result, schema: schema)
    }

    public func structure(of table: TableRef) async throws -> TableStructure {
        let unlimited = ExecutionOptions(rowLimit: nil)
        let header = try await execute(CatalogQueries.relationHeader(table), options: unlimited)
        let columns = try await execute(CatalogQueries.columns(of: table), options: unlimited)
        let indexes = try await execute(CatalogQueries.indexes(of: table), options: unlimited)
        let constraints = try await execute(CatalogQueries.constraints(of: table), options: unlimited)
        let parsedConstraints = CatalogQueries.parseConstraints(constraints)
        return TableStructure(
            ref: table,
            kind: RelationKind(relkind: header.value(row: 0, column: "kind")?.stringValue ?? "r") ?? .table,
            columns: CatalogQueries.parseColumns(columns, catalog: decoder.catalog),
            indexes: CatalogQueries.parseIndexes(indexes),
            constraints: parsedConstraints.constraints,
            foreignKeys: parsedConstraints.foreignKeys,
            comment: header.value(row: 0, column: "comment")?.stringValue
        )
    }
}
