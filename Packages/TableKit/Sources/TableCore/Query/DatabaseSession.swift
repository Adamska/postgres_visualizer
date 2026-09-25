public import Foundation

/// Errors surfaced to the UI. Server errors carry the detail Postgres provides.
public struct DatabaseError: Error, Hashable, Sendable, LocalizedError {
    public enum Category: String, Sendable {
        case connection
        case authentication
        case server
        case decoding
        case cancelled
        case unsupported
    }

    public var category: Category
    public var message: String
    public var detail: String?
    public var hint: String?
    public var sqlState: String?
    /// 1-based character offset into the failing statement, when the server reports one.
    public var position: Int?

    public init(
        category: Category,
        message: String,
        detail: String? = nil,
        hint: String? = nil,
        sqlState: String? = nil,
        position: Int? = nil
    ) {
        self.category = category
        self.message = message
        self.detail = detail
        self.hint = hint
        self.sqlState = sqlState
        self.position = position
    }

    public var errorDescription: String? { message }

    public var failureReason: String? { detail }

    public var recoverySuggestion: String? { hint }
}

/// Creates sessions for a profile. Implemented by the Postgres driver and by test doubles.
public protocol DatabaseDriver: Sendable {
    func connect(to profile: ConnectionProfile, password: String?) async throws -> any DatabaseSession
}

/// A live connection to one database. All calls are serialised by the implementation.
public protocol DatabaseSession: AnyObject, Sendable {
    var profileID: UUID { get }
    var isClosed: Bool { get async }

    /// Executes one statement. Callers split multi-statement scripts beforehand.
    func execute(_ sql: String, options: ExecutionOptions) async throws -> QueryResult

    func serverVersion() async throws -> String
    func typeCatalog() async throws -> TypeCatalog
    func listSchemas() async throws -> [SchemaInfo]
    func listRelations(in schema: String) async throws -> [RelationInfo]
    func listFunctions(in schema: String) async throws -> [FunctionInfo]
    func structure(of table: TableRef) async throws -> TableStructure

    func close() async
}

extension DatabaseSession {
    public func execute(_ sql: String) async throws -> QueryResult {
        try await execute(sql, options: ExecutionOptions())
    }

    /// Runs a series of statements inside one transaction, rolling back on the first failure.
    public func executeTransaction(_ statements: [String]) async throws -> [QueryResult] {
        _ = try await execute("BEGIN", options: ExecutionOptions(rowLimit: nil))
        var results: [QueryResult] = []
        do {
            for statement in statements {
                results.append(try await execute(statement, options: ExecutionOptions(rowLimit: nil)))
            }
            _ = try await execute("COMMIT", options: ExecutionOptions(rowLimit: nil))
        } catch {
            _ = try? await execute("ROLLBACK", options: ExecutionOptions(rowLimit: nil))
            throw error
        }
        return results
    }
}
