import SwiftUI
import TableCore

/// Menu bar commands. The model is captured directly because there is a single workspace.
struct AppCommands: Commands {
    let model: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Connection…") { NotificationCenter.default.post(name: .newConnectionRequested, object: nil) }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("New Query Tab") { _ = model.newQueryTab() }
                .keyboardShortcut("t", modifiers: .command)
                .disabled(model.selectedConnection == nil)
            Divider()
            Button("Import CSV…") { NotificationCenter.default.post(name: .importCSVRequested, object: nil) }
                .disabled(model.selectedTab?.tableModel == nil)
            Button("Run SQL File…") { NotificationCenter.default.post(name: .runSQLFileRequested, object: nil) }
                .disabled(model.selectedConnection == nil)
            Button("Export…") { NotificationCenter.default.post(name: .exportRequested, object: nil) }
                .keyboardShortcut("e", modifiers: [.command, .shift])
                .disabled(model.selectedTab?.tableModel == nil && model.selectedTab?.queryModel == nil)
            Divider()
            Button("Close Tab") { if let id = model.selectedTabID { Task { await model.closeTab(id: id) } } }
                .keyboardShortcut("w", modifiers: .command)
                .disabled(model.selectedTab == nil)
        }

        CommandMenu("Query") {
            Button("Run Statement") { model.selectedTab?.queryModel?.run(.currentStatement) }
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(model.selectedTab?.queryModel == nil)
            Button("Run All") { model.selectedTab?.queryModel?.run(.all) }
                .keyboardShortcut(.return, modifiers: [.command, .shift])
                .disabled(model.selectedTab?.queryModel == nil)
            Button("Explain") { model.selectedTab?.queryModel?.explain(analyze: false) }
                .keyboardShortcut("e", modifiers: [.command, .option])
                .disabled(model.selectedTab?.queryModel == nil)
            Button("Explain Analyze") { model.selectedTab?.queryModel?.explain(analyze: true) }
                .keyboardShortcut("e", modifiers: [.command, .option, .shift])
                .disabled(model.selectedTab?.queryModel == nil)
            Divider()
            Button("Refresh") { NotificationCenter.default.post(name: .refreshRequested, object: nil) }
                .keyboardShortcut("r", modifiers: .command)
            Button("Commit Changes") { NotificationCenter.default.post(name: .commitRequested, object: nil) }
                .keyboardShortcut("s", modifiers: .command)
                .disabled(model.selectedTab?.tableModel?.changes.isEmpty ?? true)
            Button("Discard Changes") { model.selectedTab?.tableModel?.discardChanges() }
                .keyboardShortcut("z", modifiers: [.command, .option])
                .disabled(model.selectedTab?.tableModel?.changes.isEmpty ?? true)
            Divider()
            Button("Add Row") { model.selectedTab?.tableModel?.addRow() }
                .keyboardShortcut("n", modifiers: [.command, .option])
                .disabled(!(model.selectedTab?.tableModel?.isEditable ?? false))
            Button("Toggle Filters") { model.selectedTab?.tableModel?.isFilterBarVisible.toggle() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
                .disabled(model.selectedTab?.tableModel == nil)
        }

        CommandGroup(after: .sidebar) {
            Button("Toggle Row Inspector") { model.isInspectorVisible.toggle() }
                .keyboardShortcut("i", modifiers: [.command, .option])
            Divider()
            Button("Next Tab") { model.selectTab(offset: 1) }
                .keyboardShortcut("]", modifiers: [.command, .shift])
            Button("Previous Tab") { model.selectTab(offset: -1) }
                .keyboardShortcut("[", modifiers: [.command, .shift])
            ForEach(1..<10) { number in
                Button("Tab \(number)") { model.selectTab(number: number) }
                    .keyboardShortcut(KeyEquivalent(Character("\(number)")), modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let newConnectionRequested = Notification.Name("io.tableplusplus.newConnection")
    static let importCSVRequested = Notification.Name("io.tableplusplus.importCSV")
    static let runSQLFileRequested = Notification.Name("io.tableplusplus.runSQLFile")
    static let exportRequested = Notification.Name("io.tableplusplus.export")
    static let refreshRequested = Notification.Name("io.tableplusplus.refresh")
    static let commitRequested = Notification.Name("io.tableplusplus.commit")
}
