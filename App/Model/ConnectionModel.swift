import Foundation
import Observation
import TableCore

/// One open connection: its session plus a cache of the schema objects shown in the sidebar.
@Observable
@MainActor
final class ConnectionModel: Identifiable {
    enum Status: Equatable {
        case connecting
        case connected
        case failed(String)
    }

    let id: UUID
    private(set) var profile: ConnectionProfile
    private(set) var status: Status = .connecting
    private(set) var serverVersion = ""
    private(set) var schemas: [SchemaInfo] = []
    private(set) var relations: [String: [RelationInfo]] = [:]
    private(set) var functions: [String: [FunctionInfo]] = [:]
    private(set) var loadingSchemas: Set<String> = []
    private(set) var typeCatalog = TypeCatalog()
    var expandedSchemas: Set<String> = ["public"]
    var isSchemaLoading = false

    private(set) var session: (any DatabaseSession)?
    private var structureCache: [TableRef: TableStructure] = [:]
    private let environment: AppEnvironment

    init(profile: ConnectionProfile, environment: AppEnvironment) {
        self.id = profile.id
        self.profile = profile
        self.environment = environment
    }

    var isConnected: Bool { status == .connected }

    var displayName: String { profile.displayName }

    // MARK: Lifecycle

    /// Opens the session and loads the schema list. Errors are reported through `status`.
    func connect() async {
        status = .connecting
        do {
            let password = try environment.passwordStore.password(for: profile.id)
            let session = try await environment.driver.connect(to: profile, password: password)
            self.session = session
            serverVersion = (try? await session.serverVersion()) ?? ""
            typeCatalog = (try? await session.typeCatalog()) ?? TypeCatalog()
            status = .connected
            try? await environment.profileStore.markConnected(id: profile.id)
            await refreshSchemas()
        } catch {
            status = .failed(DatabaseError(error).message)
        }
    }

    /// Opens an additional session on the same server, used by query tabs so that manual
    /// transactions do not interfere with table browsing.
    func openSecondarySession() async throws -> any DatabaseSession {
        let password = try environment.passwordStore.password(for: profile.id)
        return try await environment.driver.connect(to: profile, password: password)
    }

    func disconnect() async {
        await session?.close()
        session = nil
        status = .failed("Disconnected")
    }

    func updateProfile(_ profile: ConnectionProfile) {
        self.profile = profile
    }

    // MARK: Schema cache

    func refreshSchemas() async {
        guard let session else { return }
        isSchemaLoading = true
        defer { isSchemaLoading = false }
        do {
            schemas = try await session.listSchemas()
            relations = [:]
            functions = [:]
            structureCache = [:]
            typeCatalog = (try? await session.typeCatalog()) ?? typeCatalog
            for schema in expandedSchemas {
                await loadObjects(in: schema)
            }
        } catch {
            status = .failed(DatabaseError(error).message)
        }
    }

    /// Loads relations and functions of a schema on first expansion.
    func loadObjects(in schema: String) async {
        guard let session, relations[schema] == nil, !loadingSchemas.contains(schema) else { return }
        loadingSchemas.insert(schema)
        defer { loadingSchemas.remove(schema) }
        do {
            relations[schema] = try await session.listRelations(in: schema)
            functions[schema] = try await session.listFunctions(in: schema)
        } catch {
            relations[schema] = []
            functions[schema] = []
        }
    }

    func relations(in schema: String) -> [RelationInfo] {
        relations[schema] ?? []
    }

    func functions(in schema: String) -> [FunctionInfo] {
        functions[schema] ?? []
    }

    /// All loaded relations across schemas, for completion and quick open.
    var allRelations: [RelationInfo] {
        relations.values.flatMap { $0 }.sorted { $0.ref.description < $1.ref.description }
    }

    func structure(of table: TableRef, forceReload: Bool = false) async throws -> TableStructure {
        if !forceReload, let cached = structureCache[table] { return cached }
        guard let session else { throw DatabaseError(category: .connection, message: "Not connected.") }
        let structure = try await session.structure(of: table)
        structureCache[table] = structure
        return structure
    }

    func cachedStructure(of table: TableRef) -> TableStructure? {
        structureCache[table]
    }

    /// Executes on the shared session, used by table tabs and imports.
    func execute(_ sql: String, rowLimit: Int? = nil) async throws -> QueryResult {
        guard let session else { throw DatabaseError(category: .connection, message: "Not connected.") }
        return try await session.execute(sql, options: ExecutionOptions(rowLimit: rowLimit))
    }

    func executeTransaction(_ statements: [String]) async throws -> [QueryResult] {
        guard let session else { throw DatabaseError(category: .connection, message: "Not connected.") }
        return try await session.executeTransaction(statements)
    }
}
