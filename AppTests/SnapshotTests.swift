import AppKit
import SwiftUI
import TableCore
import Testing
@testable import TablePlusPlus

/// Renders the main views offscreen into PNG files for visual review.
/// Enabled by setting `TABLEPP_SNAPSHOT_DIR` (with `TEST_RUNNER_` prefix under xcodebuild).
@MainActor
@Suite("Snapshots", .enabled(if: ProcessInfo.processInfo.environment["TABLEPP_SNAPSHOT_DIR"] != nil), .serialized)
struct SnapshotTests {
    private var directory: URL {
        URL(fileURLWithPath: ProcessInfo.processInfo.environment["TABLEPP_SNAPSHOT_DIR"] ?? NSTemporaryDirectory())
    }

    private func connectedModel() async -> (AppModel, ConnectionModel) {
        let model = AppModel(environment: .preview())
        let profile = ConnectionProfile(name: "Docker test DB", host: "localhost", port: 54_329, database: "tablepp", username: "tablepp", color: .blue)
        let production = ConnectionProfile(name: "Supabase prod", host: "db.supabase.co", database: "postgres", color: .red, group: "Production")
        await model.saveProfile(profile, password: nil)
        await model.saveProfile(production, password: nil)
        let connection = await model.connect(profile)
        await connection.loadObjects(in: "public")
        return (model, connection)
    }

    @Test("Welcome screen")
    func welcome() async throws {
        let model = AppModel(environment: .preview())
        await model.saveProfile(ConnectionProfile(name: "Local", color: .blue), password: nil)
        await model.saveProfile(ConnectionProfile(name: "Supabase", host: "db.supabase.co", color: .red), password: nil)
        try render(MainWindowView().environment(model), name: "welcome", size: CGSize(width: 1_280, height: 800), settle: 1)
    }

    @Test("Table tab with staged changes")
    func tableTab() async throws {
        let (model, connection) = await connectedModel()
        let tab = model.openTable(MockDatabase.users, on: connection)
        _ = model.newQueryTab(sql: "SELECT * FROM users;")
        model.selectedTabID = tab.id
        guard let table = tab.tableModel else { return }
        await table.load()
        table.setValue(.text("changed@example.com"), at: GridCellPosition(row: 0, column: 1))
        table.toggleDelete(rows: IndexSet(integer: 2))
        table.addRow()
        table.focusedCell = GridCellPosition(row: 0, column: 1)
        table.selectedRows = IndexSet(integer: 0)
        table.isFilterBarVisible = true
        table.addFilter(column: "email")
        model.isInspectorVisible = true
        try render(MainWindowView().environment(model), name: "table-tab", size: CGSize(width: 1_400, height: 860), settle: 1.5)
    }

    @Test("Query tab with results")
    func queryTab() async throws {
        let (model, _) = await connectedModel()
        let sql = """
        -- Customers with their order totals
        SELECT c.full_name, count(o.id) AS orders, sum(o.total) AS revenue
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        WHERE c.is_active = true AND c.email LIKE '%@example.com'
        GROUP BY c.id
        ORDER BY revenue DESC
        LIMIT $1;
        """
        let tab = model.newQueryTab(sql: sql)
        await tab?.queryModel?.run(.all)?.value
        try render(MainWindowView().environment(model), name: "query-tab", size: CGSize(width: 1_400, height: 860), settle: 1.5)
    }

    @Test("Structure tab and connection form")
    func structureAndForm() async throws {
        let (model, connection) = await connectedModel()
        let tab = model.openStructure(MockDatabase.users, on: connection)
        if case .structure(let structure) = tab.content { await structure.load() }
        try render(MainWindowView().environment(model), name: "structure-tab", size: CGSize(width: 1_280, height: 760), settle: 1)
        let profile = ConnectionProfile(name: "Supabase", host: "db.abc.supabase.co", database: "postgres", username: "postgres", sslMode: .require, color: .green)
        let form = ConnectionFormView(profile: profile, password: "secret", isNew: true)
            .environment(model)
        try render(form, name: "connection-form", size: CGSize(width: 520, height: 590), settle: 0.5)
    }

    private func render(_ view: some View, name: String, size: CGSize, settle: TimeInterval) throws {
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.contentView = NSHostingView(rootView: view.frame(width: size.width, height: size.height))
        window.appearance = NSAppearance(named: .aqua)
        window.orderFront(nil)
        RunLoop.main.run(until: Date().addingTimeInterval(settle))
        guard let contentView = window.contentView, let bitmap = contentView.bitmapImageRepForCachingDisplay(in: contentView.bounds) else { return }
        contentView.cacheDisplay(in: contentView.bounds, to: bitmap)
        guard let data = bitmap.representation(using: .png, properties: [:]) else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: directory.appendingPathComponent("\(name).png"))
        window.orderOut(nil)
    }
}
