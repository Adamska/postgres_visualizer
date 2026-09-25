public import Foundation
public import TableCore

/// Recently executed queries, newest first, capped to keep the file small.
public actor QueryHistoryStore {
    public static let defaultLimit = 500

    private let store: JSONFileStore<[QueryHistoryEntry]>
    private let limit: Int

    public init(directory: URL = StorageLocations.applicationSupportDirectory(), limit: Int = QueryHistoryStore.defaultLimit) {
        store = JSONFileStore(url: directory.appendingPathComponent("history.json"), defaultValue: [])
        self.limit = limit
    }

    public func entries() async throws -> [QueryHistoryEntry] {
        try await store.load()
    }

    /// Adds an entry. Re-running the same SQL on the same profile moves it to the top.
    public func record(_ entry: QueryHistoryEntry) async throws {
        try await store.update { entries in
            entries.removeAll { $0.profileID == entry.profileID && $0.sql == entry.sql }
            entries.insert(entry, at: 0)
            if entries.count > limit { entries.removeLast(entries.count - limit) }
        }
    }

    public func delete(id: UUID) async throws {
        try await store.update { entries in entries.removeAll { $0.id == id } }
    }

    public func clear() async throws {
        try await store.save([])
    }
}

/// Queries the user chose to keep.
public actor SavedQueryStore {
    private let store: JSONFileStore<[SavedQuery]>

    public init(directory: URL = StorageLocations.applicationSupportDirectory()) {
        store = JSONFileStore(url: directory.appendingPathComponent("saved-queries.json"), defaultValue: [])
    }

    public func all() async throws -> [SavedQuery] {
        try await store.load()
    }

    public func save(_ query: SavedQuery) async throws {
        try await store.update { queries in
            if let index = queries.firstIndex(where: { $0.id == query.id }) {
                queries[index] = query
            } else {
                queries.append(query)
            }
            queries.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
    }

    public func delete(id: UUID) async throws {
        try await store.update { queries in queries.removeAll { $0.id == id } }
    }
}
