import Foundation
import Testing
@testable import TableCore
@testable import TableStorage

@Suite("Storage")
struct StorageTests {
    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("tablepp-tests-\(UUID().uuidString)", isDirectory: true)
    }

    @Test("Profiles persist, update in place and delete")
    func profiles() async throws {
        let directory = temporaryDirectory()
        let store = ProfileStore(directory: directory)
        #expect(try await store.all().isEmpty)

        var profile = ConnectionProfile(name: "Local", host: "localhost")
        try await store.save(profile)
        profile.name = "Renamed"
        try await store.save(profile)
        try await store.save(ConnectionProfile(name: "Other"))

        let reloaded = ProfileStore(directory: directory)
        let profiles = try await reloaded.all()
        #expect(profiles.map(\.name) == ["Renamed", "Other"])

        try await reloaded.markConnected(id: profile.id, at: Date(timeIntervalSince1970: 1_000))
        #expect(try await reloaded.all().first?.lastConnectedAt == Date(timeIntervalSince1970: 1_000))

        try await reloaded.delete(id: profile.id)
        #expect(try await reloaded.all().map(\.name) == ["Other"])
        try? FileManager.default.removeItem(at: directory)
    }

    @Test("History deduplicates, caps and clears")
    func history() async throws {
        let directory = temporaryDirectory()
        let store = QueryHistoryStore(directory: directory, limit: 3)
        let profileID = UUID()
        for index in 1...4 {
            try await store.record(QueryHistoryEntry(profileID: profileID, sql: "select \(index)", duration: .milliseconds(1), succeeded: true))
        }
        try await store.record(QueryHistoryEntry(profileID: profileID, sql: "select 3", duration: .milliseconds(1), succeeded: false))
        let entries = try await store.entries()
        #expect(entries.map(\.sql) == ["select 3", "select 4", "select 2"])
        #expect(entries.first?.succeeded == false)
        try await store.clear()
        #expect(try await store.entries().isEmpty)
        try? FileManager.default.removeItem(at: directory)
    }

    @Test("Saved queries stay sorted by name")
    func savedQueries() async throws {
        let directory = temporaryDirectory()
        let store = SavedQueryStore(directory: directory)
        try await store.save(SavedQuery(name: "zeta", sql: "select 1"))
        try await store.save(SavedQuery(name: "Alpha", sql: "select 2"))
        #expect(try await store.all().map(\.name) == ["Alpha", "zeta"])
        try? FileManager.default.removeItem(at: directory)
    }

    @Test("Workspace snapshots round trip")
    func workspace() async throws {
        let directory = temporaryDirectory()
        let store = WorkspaceStateStore(directory: directory)
        let profileID = UUID()
        let snapshot = WorkspaceSnapshot(connections: [
            ConnectionSnapshot(profileID: profileID, tabs: [
                .table(TableQuery(table: TableRef(schema: "public", name: "users"), filters: [Filter(column: "id", op: .greaterThan, value: "1")])),
                .structure(TableRef(schema: "public", name: "users")),
                .query(sql: "select 1", title: "Scratch"),
            ], selectedTabIndex: 2),
        ], selectedProfileID: profileID)
        try await store.save(snapshot)
        #expect(try await WorkspaceStateStore(directory: directory).load() == snapshot)
        try? FileManager.default.removeItem(at: directory)
    }

    @Test("In-memory password store")
    func passwords() throws {
        let store = InMemoryPasswordStore()
        let id = UUID()
        #expect(try store.password(for: id) == nil)
        try store.setPassword("secret", for: id)
        #expect(try store.password(for: id) == "secret")
        try store.setPassword(nil, for: id)
        #expect(try store.password(for: id) == nil)
    }

    @Test("Keychain store round trips a password", .enabled(if: ProcessInfo.processInfo.environment["TABLEPP_TEST_KEYCHAIN"] != nil))
    func keychain() throws {
        let store = KeychainPasswordStore(service: "io.tableplusplus.tests")
        let id = UUID()
        try store.setPassword("p@ss", for: id)
        #expect(try store.password(for: id) == "p@ss")
        try store.setPassword("changed", for: id)
        #expect(try store.password(for: id) == "changed")
        try store.setPassword(nil, for: id)
        #expect(try store.password(for: id) == nil)
    }
}
