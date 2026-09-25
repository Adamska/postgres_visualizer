import Foundation
import TableCore

/// A scripted database used by previews and unit tests.
struct MockDriver: DatabaseDriver {
    var database: MockDatabase

    init(database: MockDatabase = .sample) {
        self.database = database
    }

    func connect(to profile: ConnectionProfile, password: String?) async throws -> any DatabaseSession {
        if let failure = database.connectionFailure { throw failure }
        return MockSession(profileID: profile.id, database: database)
    }
}

/// Static content served by `MockSession`.
struct MockDatabase: Sendable {
    var schemas: [SchemaInfo] = [SchemaInfo(name: "public", owner: "postgres")]
    var relations: [String: [RelationInfo]] = [:]
    var functions: [String: [FunctionInfo]] = [:]
    var structures: [TableRef: TableStructure] = [:]
    /// Results keyed by exact SQL; anything else returns `defaultResult`.
    var results: [String: QueryResult] = [:]
    var defaultResult = QueryResult(statement: "")
    var connectionFailure: DatabaseError?
    var executionFailure: DatabaseError?

    static let users = TableRef(schema: "public", name: "users")

    static let sample: MockDatabase = {
        var database = MockDatabase()
        let columns = [
            ColumnInfo(name: "id", ordinal: 1, typeName: "integer", typeOID: 23, kind: .integer, isNullable: false, isPrimaryKey: true, isIdentity: true),
            ColumnInfo(name: "email", ordinal: 2, typeName: "text", typeOID: 25, kind: .text, isNullable: false),
            ColumnInfo(name: "is_active", ordinal: 3, typeName: "boolean", typeOID: 16, kind: .boolean),
            ColumnInfo(name: "profile", ordinal: 4, typeName: "jsonb", typeOID: 3_802, kind: .json),
            ColumnInfo(name: "team_id", ordinal: 5, typeName: "integer", typeOID: 23, kind: .integer),
        ]
        let primaryKey = IndexInfo(
            name: "users_pkey",
            definition: "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)",
            isUnique: true,
            isPrimary: true,
            columns: ["id"]
        )
        let teamKey = ForeignKeyInfo(
            name: "users_team_fk",
            columns: ["team_id"],
            referencedTable: TableRef(schema: "public", name: "teams"),
            referencedColumns: ["id"]
        )
        let structure = TableStructure(
            ref: users,
            columns: columns,
            indexes: [primaryKey],
            constraints: [ConstraintInfo(name: "users_pkey", kind: .primaryKey, definition: "PRIMARY KEY (id)", columns: ["id"])],
            foreignKeys: [teamKey]
        )
        database.structures[users] = structure
        database.relations["public"] = [
            RelationInfo(ref: users, kind: .table, estimatedRowCount: 3),
            RelationInfo(ref: TableRef(schema: "public", name: "teams"), kind: .table, estimatedRowCount: 1),
            RelationInfo(ref: TableRef(schema: "public", name: "active_users"), kind: .view),
        ]
        database.functions["public"] = [
            FunctionInfo(schema: "public", name: "user_count", arguments: "", returnType: "bigint", language: "sql", isProcedure: false),
        ]
        let resultColumns = structure.columns.enumerated().map { index, column in
            ResultColumn(name: column.name, typeOID: column.typeOID, typeName: column.typeName, kind: column.kind, index: index)
        }
        let rows: [[CellValue]] = [
            [.text("1"), .text("ann@example.com"), .text("true"), .text("{\"theme\": \"dark\"}"), .text("1")],
            [.text("2"), .text("bob@example.com"), .text("false"), .null, .null],
            [.text("3"), .text("cy@example.com"), .text("true"), .text("[]"), .text("1")],
        ]
        database.defaultResult = QueryResult(statement: "", columns: resultColumns, rows: rows, duration: .milliseconds(3))
        database.results["SELECT count(*) FROM \"public\".\"users\""] = QueryResult(
            statement: "",
            columns: [ResultColumn(name: "count", kind: .integer, index: 0)],
            rows: [[.text("3")]]
        )
        return database
    }()
}

/// Records executed statements so tests can assert on generated SQL.
final class MockSession: DatabaseSession, @unchecked Sendable {
    let profileID: UUID
    let database: MockDatabase
    private let lock = NSLock()
    private var _executed: [String] = []
    private var _closed = false

    init(profileID: UUID, database: MockDatabase) {
        self.profileID = profileID
        self.database = database
    }

    var executed: [String] { lock.withLock { _executed } }
    var isClosed: Bool { lock.withLock { _closed } }

    func execute(_ sql: String, options: ExecutionOptions) async throws -> QueryResult {
        lock.withLock { _executed.append(sql) }
        if let failure = database.executionFailure { throw failure }
        var result = database.results[sql] ?? database.defaultResult
        result.statement = sql
        if SQLStatementKind.classify(sql).isDataModification {
            result = QueryResult(statement: sql, commandTag: "OK 1", affectedRows: 1)
        } else if !SQLStatementKind.classify(sql).mayReturnRows {
            result = QueryResult(statement: sql)
        }
        return result
    }

    func serverVersion() async throws -> String { "17.0 (mock)" }
    func typeCatalog() async throws -> TypeCatalog { TypeCatalog() }
    func listSchemas() async throws -> [SchemaInfo] { database.schemas }
    func listRelations(in schema: String) async throws -> [RelationInfo] { database.relations[schema] ?? [] }
    func listFunctions(in schema: String) async throws -> [FunctionInfo] { database.functions[schema] ?? [] }

    func structure(of table: TableRef) async throws -> TableStructure {
        guard let structure = database.structures[table] else {
            throw DatabaseError(category: .server, message: "relation \"\(table)\" does not exist", sqlState: "42P01")
        }
        return structure
    }

    func close() async {
        lock.withLock { _closed = true }
    }
}
