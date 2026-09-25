import SwiftUI
import TableCore

/// The single workspace window: sidebar, tab strip, tab content and the row inspector.
struct MainWindowView: View {
    @Environment(AppModel.self) private var model
    @State private var editingProfile: ConnectionProfile?
    @State private var isCreatingProfile = false
    @State private var columnVisibility = NavigationSplitViewVisibility.all
    @State private var sqlFileToRun: SelectedFile?

    var body: some View {
        @Bindable var model = model
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView(
                onNewConnection: { isCreatingProfile = true },
                onEditConnection: { editingProfile = $0 }
            )
            .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 420)
        } detail: {
            WorkspaceView()
        }
        .inspector(isPresented: $model.isInspectorVisible) {
            InspectorContainerView()
                .inspectorColumnWidth(min: 260, ideal: 320, max: 520)
        }
        .toolbar { WorkspaceToolbar() }
        .navigationTitle(model.selectedTab?.title ?? "Table++")
        .navigationSubtitle(model.selectedTab?.connection.displayName ?? "")
        .sheet(isPresented: $isCreatingProfile) {
            ConnectionFormView(profile: ConnectionProfile(), password: "", isNew: true)
        }
        .sheet(item: $editingProfile) { profile in
            ConnectionFormView(profile: profile, password: model.password(for: profile.id) ?? "", isNew: false)
        }
        .alert(item: $model.presentedError) { error in
            Alert(title: Text(error.title), message: Text(error.message))
        }
        .task { await model.start() }
        .onReceive(NotificationCenter.default.publisher(for: .newConnectionRequested)) { _ in isCreatingProfile = true }
        .onReceive(NotificationCenter.default.publisher(for: .runSQLFileRequested)) { _ in
            if model.selectedConnection != nil, let url = chooseSQLFile() { sqlFileToRun = SelectedFile(url: url) }
        }
        .sheet(item: $sqlFileToRun) { file in
            if let connection = model.selectedConnection {
                SQLFileRunnerSheet(connection: connection, fileURL: file.url)
            }
        }
    }
}

/// Wraps a file URL so it can drive `.sheet(item:)`.
struct SelectedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Toolbar shared by every tab kind. Items adapt to the selected tab.
struct WorkspaceToolbar: ToolbarContent {
    @Environment(AppModel.self) private var model

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                _ = model.newQueryTab()
            } label: {
                Label("New Query", systemImage: "plus.rectangle.on.rectangle")
            }
            .help("New query tab (⌘T)")
            .disabled(model.selectedConnection == nil)

            Button {
                model.isInspectorVisible.toggle()
            } label: {
                Label("Inspector", systemImage: "sidebar.trailing")
            }
            .help("Toggle the row inspector (⌥⌘I)")
        }
    }
}

/// Picks the inspector content for the selected tab.
struct InspectorContainerView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let table = model.selectedTab?.tableModel {
            RowInspectorView(model: table)
        } else if let query = model.selectedTab?.queryModel {
            QueryRowInspectorView(model: query)
        } else {
            EmptyStateView(systemImage: "info.circle", title: "No selection", message: "Select a row to inspect its values.")
        }
    }
}

/// Tab strip plus the selected tab's content.
struct WorkspaceView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            if !model.tabs.isEmpty {
                TabBarView()
                HairlineDivider()
            }
            if let tab = model.selectedTab {
                TabContentView(tab: tab)
                    .id(tab.id)
            } else if model.connections.isEmpty {
                WelcomeView()
            } else {
                EmptyStateView(systemImage: "tablecells", title: "Pick a table", message: "Choose a table in the sidebar, or open a new query tab.") {
                    Button("New Query Tab") { _ = model.newQueryTab() }
                        .buttonStyle(.glassProminent)
                }
            }
        }
    }
}

/// Dispatches to the view for a tab's content.
struct TabContentView: View {
    let tab: TabModel

    var body: some View {
        switch tab.content {
        case .table(let model): TableTabView(model: model, connection: tab.connection)
        case .structure(let model): StructureTabView(model: model)
        case .query(let model): QueryTabView(model: model)
        }
    }
}
