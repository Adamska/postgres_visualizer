import Foundation
import Observation
import TableCore
import TableStorage

/// Root model: saved profiles, open connections and the global tab strip.
@Observable
@MainActor
final class AppModel {
    struct PresentedError: Identifiable {
        let id = UUID()
        var title: String
        var message: String
    }

    let environment: AppEnvironment
    private(set) var profiles: [ConnectionProfile] = []
    private(set) var connections: [ConnectionModel] = []
    private(set) var tabs: [TabModel] = []
    var selectedTabID: UUID? {
        didSet { if let connectionID = selectedTab?.connection.id { selectedConnectionID = connectionID } }
    }
    var selectedConnectionID: UUID?
    var presentedError: PresentedError?
    var isInspectorVisible = false
    private(set) var isReady = false

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    // MARK: Derived state

    var selectedTab: TabModel? { tabs.first { $0.id == selectedTabID } }

    var selectedConnection: ConnectionModel? {
        connections.first { $0.id == selectedConnectionID } ?? connections.first
    }

    func connection(for profileID: UUID) -> ConnectionModel? {
        connections.first { $0.id == profileID }
    }

    /// Profiles that are not currently open, grouped for the sidebar.
    var closedProfiles: [ConnectionProfile] {
        profiles.filter { profile in !connections.contains { $0.id == profile.id } }
    }

    // MARK: Startup

    func start() async {
        await loadProfiles()
        if UserDefaults.standard.bool(forKey: PreferenceKey.restoreWorkspace) {
            await restoreWorkspace()
        }
        isReady = true
    }

    func loadProfiles() async {
        do {
            profiles = try await environment.profileStore.all()
        } catch {
            present(error, title: "Could not load connections")
        }
    }

    // MARK: Profiles

    func saveProfile(_ profile: ConnectionProfile, password: String?) async {
        do {
            try await environment.profileStore.save(profile)
            try environment.passwordStore.setPassword(password?.isEmpty == true ? nil : password, for: profile.id)
            await loadProfiles()
            connection(for: profile.id)?.updateProfile(profile)
        } catch {
            present(error, title: "Could not save the connection")
        }
    }

    func deleteProfile(id: UUID) async {
        if let connection = connection(for: id) { await disconnect(connection) }
        do {
            try await environment.profileStore.delete(id: id)
            try? environment.passwordStore.setPassword(nil, for: id)
            await loadProfiles()
        } catch {
            present(error, title: "Could not delete the connection")
        }
    }

    func password(for profileID: UUID) -> String? {
        try? environment.passwordStore.password(for: profileID)
    }

    /// Opens a session and returns immediately; the connection reports progress through its status.
    @discardableResult
    func connect(_ profile: ConnectionProfile) async -> ConnectionModel {
        if let existing = connection(for: profile.id) {
            selectedConnectionID = existing.id
            if !existing.isConnected { await existing.connect() }
            return existing
        }
        let connection = ConnectionModel(profile: profile, environment: environment)
        connections.append(connection)
        selectedConnectionID = connection.id
        await connection.connect()
        if case .failed(let message) = connection.status {
            connections.removeAll { $0.id == connection.id }
            presentedError = PresentedError(title: "Could not connect to \(profile.displayName)", message: message)
        }
        persistWorkspace()
        return connection
    }

    func disconnect(_ connection: ConnectionModel) async {
        for tab in tabs where tab.connection.id == connection.id {
            await tab.willClose()
        }
        tabs.removeAll { $0.connection.id == connection.id }
        connections.removeAll { $0.id == connection.id }
        await connection.disconnect()
        if selectedConnectionID == connection.id { selectedConnectionID = connections.first?.id }
        if selectedTab == nil { selectedTabID = tabs.last?.id }
        persistWorkspace()
    }

    // MARK: Tabs

    @discardableResult
    func openTable(_ table: TableRef, on connection: ConnectionModel, filters: [Filter] = [], reuseExisting: Bool = true) -> TabModel {
        if reuseExisting, filters.isEmpty, let existing = tabs.first(where: { tab in
            tab.connection.id == connection.id && tab.tableModel?.query.table == table && tab.tableModel?.query.hasActiveFilters == false
        }) {
            selectedTabID = existing.id
            return existing
        }
        let query = TableQuery(table: table, filters: filters, pageSize: preferredPageSize)
        let model = TableTabModel(query: query, connection: connection)
        return addTab(TabModel(connection: connection, content: .table(model)))
    }

    @discardableResult
    func openStructure(_ table: TableRef, on connection: ConnectionModel) -> TabModel {
        if let existing = tabs.first(where: { tab in
            if case .structure(let model) = tab.content { return tab.connection.id == connection.id && model.table == table }
            return false
        }) {
            selectedTabID = existing.id
            return existing
        }
        let model = StructureTabModel(table: table, connection: connection)
        return addTab(TabModel(connection: connection, content: .structure(model)))
    }

    @discardableResult
    func newQueryTab(on connection: ConnectionModel? = nil, sql: String = "", title: String? = nil) -> TabModel? {
        guard let connection = connection ?? selectedConnection else { return nil }
        let model = QueryTabModel(text: sql, customTitle: title, connection: connection, environment: environment)
        return addTab(TabModel(connection: connection, content: .query(model)))
    }

    private func addTab(_ tab: TabModel) -> TabModel {
        if let selected = selectedTab, let index = tabs.firstIndex(where: { $0.id == selected.id }) {
            tabs.insert(tab, at: index + 1)
        } else {
            tabs.append(tab)
        }
        selectedTabID = tab.id
        persistWorkspace()
        return tab
    }

    func closeTab(id: UUID) async {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let tab = tabs[index]
        await tab.willClose()
        tabs.remove(at: index)
        if selectedTabID == id {
            selectedTabID = tabs.indices.contains(index) ? tabs[index].id : tabs.last?.id
        }
        persistWorkspace()
    }

    func closeOtherTabs(except id: UUID) async {
        for tab in tabs where tab.id != id { await tab.willClose() }
        tabs.removeAll { $0.id != id }
        selectedTabID = id
        persistWorkspace()
    }

    func selectTab(offset: Int) {
        guard !tabs.isEmpty, let current = tabs.firstIndex(where: { $0.id == selectedTabID }) else {
            selectedTabID = tabs.first?.id
            return
        }
        let next = (current + offset + tabs.count) % tabs.count
        selectedTabID = tabs[next].id
    }

    func selectTab(number: Int) {
        guard number >= 1, number <= tabs.count else { return }
        selectedTabID = tabs[number - 1].id
    }

    func moveTab(id: UUID, to destination: Int) {
        guard let source = tabs.firstIndex(where: { $0.id == id }) else { return }
        let tab = tabs.remove(at: source)
        tabs.insert(tab, at: min(max(0, destination), tabs.count))
        persistWorkspace()
    }

    private var preferredPageSize: Int {
        let stored = UserDefaults.standard.integer(forKey: PreferenceKey.pageSize)
        return stored > 0 ? stored : PreferenceDefaults.pageSize
    }

    // MARK: Workspace persistence

    func persistWorkspace() {
        let snapshot = WorkspaceSnapshot(
            connections: connections.map { connection in
                let connectionTabs = tabs.filter { $0.connection.id == connection.id }
                let selectedIndex = connectionTabs.firstIndex { $0.id == selectedTabID }
                return ConnectionSnapshot(profileID: connection.id, tabs: connectionTabs.map(\.snapshot), selectedTabIndex: selectedIndex)
            },
            selectedProfileID: selectedConnectionID
        )
        Task { try? await environment.workspaceStore.save(snapshot) }
    }

    private func restoreWorkspace() async {
        guard let snapshot = try? await environment.workspaceStore.load() else { return }
        for connectionSnapshot in snapshot.connections {
            guard let profile = profiles.first(where: { $0.id == connectionSnapshot.profileID }) else { continue }
            let connection = await connect(profile)
            guard connection.isConnected else { continue }
            var restored: [TabModel] = []
            for tab in connectionSnapshot.tabs {
                switch tab {
                case .table(let query):
                    let model = TableTabModel(query: query, connection: connection)
                    restored.append(TabModel(connection: connection, content: .table(model)))
                case .structure(let table):
                    restored.append(TabModel(connection: connection, content: .structure(StructureTabModel(table: table, connection: connection))))
                case .query(let sql, let title):
                    let model = QueryTabModel(text: sql, customTitle: title, connection: connection, environment: environment)
                    restored.append(TabModel(connection: connection, content: .query(model)))
                }
            }
            tabs += restored
            if let index = connectionSnapshot.selectedTabIndex, restored.indices.contains(index) {
                selectedTabID = restored[index].id
            }
        }
        if selectedTabID == nil { selectedTabID = tabs.first?.id }
        selectedConnectionID = snapshot.selectedProfileID ?? connections.first?.id
    }

    // MARK: Errors

    func present(_ error: any Error, title: String) {
        presentedError = PresentedError(title: title, message: DatabaseError(error).message)
    }
}
