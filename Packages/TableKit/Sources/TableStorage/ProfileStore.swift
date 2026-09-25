public import Foundation
public import TableCore

/// Saved connection profiles, ordered by the user.
public actor ProfileStore {
    private let store: JSONFileStore<[ConnectionProfile]>

    public init(directory: URL = StorageLocations.applicationSupportDirectory()) {
        store = JSONFileStore(url: directory.appendingPathComponent("connections.json"), defaultValue: [])
    }

    public func all() async throws -> [ConnectionProfile] {
        try await store.load()
    }

    /// Inserts or replaces the profile with the same identifier.
    public func save(_ profile: ConnectionProfile) async throws {
        try await store.update { profiles in
            if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
                profiles[index] = profile
            } else {
                profiles.append(profile)
            }
        }
    }

    public func delete(id: UUID) async throws {
        try await store.update { profiles in
            profiles.removeAll { $0.id == id }
        }
    }

    public func replaceAll(_ profiles: [ConnectionProfile]) async throws {
        try await store.save(profiles)
    }

    public func markConnected(id: UUID, at date: Date = Date()) async throws {
        try await store.update { profiles in
            guard let index = profiles.firstIndex(where: { $0.id == id }) else { return }
            profiles[index].lastConnectedAt = date
        }
    }
}
