import Foundation
import Observation
import TableCore

/// Read-only view of a table's columns, indexes and constraints.
@Observable
@MainActor
final class StructureTabModel {
    let table: TableRef
    private(set) var structure: TableStructure?
    private(set) var error: DatabaseError?
    private(set) var isLoading = false

    private let connection: ConnectionModel

    init(table: TableRef, connection: ConnectionModel) {
        self.table = table
        self.connection = connection
    }

    func load(forceReload: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        do {
            structure = try await connection.structure(of: table, forceReload: forceReload)
            error = nil
        } catch {
            self.error = DatabaseError(error)
        }
    }
}
