public import Foundation
public import TableCore

/// What a tab was showing, enough to reopen it after a relaunch.
public enum TabSnapshot: Codable, Hashable, Sendable {
    case table(TableQuery)
    case structure(TableRef)
    case query(sql: String, title: String?)
}

/// Open tabs for one connection.
public struct ConnectionSnapshot: Codable, Hashable, Sendable, Identifiable {
    public var profileID: UUID
    public var tabs: [TabSnapshot]
    public var selectedTabIndex: Int?

    public var id: UUID { profileID }

    public init(profileID: UUID, tabs: [TabSnapshot], selectedTabIndex: Int?) {
        self.profileID = profileID
        self.tabs = tabs
        self.selectedTabIndex = selectedTabIndex
    }
}

public struct WorkspaceSnapshot: Codable, Hashable, Sendable {
    public var connections: [ConnectionSnapshot]
    public var selectedProfileID: UUID?

    public init(connections: [ConnectionSnapshot] = [], selectedProfileID: UUID? = nil) {
        self.connections = connections
        self.selectedProfileID = selectedProfileID
    }
}

/// Persists the open connections and tabs so they can be restored on launch.
public actor WorkspaceStateStore {
    private let store: JSONFileStore<WorkspaceSnapshot>

    public init(directory: URL = StorageLocations.applicationSupportDirectory()) {
        store = JSONFileStore(url: directory.appendingPathComponent("workspace.json"), defaultValue: WorkspaceSnapshot())
    }

    public func load() async throws -> WorkspaceSnapshot {
        try await store.load()
    }

    public func save(_ snapshot: WorkspaceSnapshot) async throws {
        try await store.save(snapshot)
    }
}
