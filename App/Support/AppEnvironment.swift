import Foundation
import TableCore
import TablePostgres
import TableStorage

/// Dependency container handed to the models. `live` talks to real servers and the keychain;
/// `preview` uses in-memory doubles so views can be previewed and tested without a database.
@MainActor
final class AppEnvironment {
    let driver: any DatabaseDriver
    let profileStore: ProfileStore
    let passwordStore: any PasswordStore
    let historyStore: QueryHistoryStore
    let savedQueryStore: SavedQueryStore
    let workspaceStore: WorkspaceStateStore

    init(
        driver: any DatabaseDriver,
        profileStore: ProfileStore,
        passwordStore: any PasswordStore,
        historyStore: QueryHistoryStore,
        savedQueryStore: SavedQueryStore,
        workspaceStore: WorkspaceStateStore
    ) {
        self.driver = driver
        self.profileStore = profileStore
        self.passwordStore = passwordStore
        self.historyStore = historyStore
        self.savedQueryStore = savedQueryStore
        self.workspaceStore = workspaceStore
    }

    static func live() -> AppEnvironment {
        let directory = StorageLocations.applicationSupportDirectory()
        return AppEnvironment(
            driver: PostgresDriver(),
            profileStore: ProfileStore(directory: directory),
            passwordStore: KeychainPasswordStore(),
            historyStore: QueryHistoryStore(directory: directory),
            savedQueryStore: SavedQueryStore(directory: directory),
            workspaceStore: WorkspaceStateStore(directory: directory)
        )
    }

    /// In-memory environment for previews and tests. Files go to a throwaway directory.
    static func preview(driver: any DatabaseDriver = MockDriver()) -> AppEnvironment {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("tablepp-preview-\(UUID().uuidString)")
        return AppEnvironment(
            driver: driver,
            profileStore: ProfileStore(directory: directory),
            passwordStore: InMemoryPasswordStore(),
            historyStore: QueryHistoryStore(directory: directory),
            savedQueryStore: SavedQueryStore(directory: directory),
            workspaceStore: WorkspaceStateStore(directory: directory)
        )
    }
}
