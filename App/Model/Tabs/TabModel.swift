import Foundation
import Observation
import TableCore
import TableStorage

/// A tab in the workspace. Each tab belongs to one connection.
@Observable
@MainActor
final class TabModel: Identifiable {
    enum Content {
        case table(TableTabModel)
        case structure(StructureTabModel)
        case query(QueryTabModel)
    }

    let id = UUID()
    let connection: ConnectionModel
    let content: Content

    init(connection: ConnectionModel, content: Content) {
        self.connection = connection
        self.content = content
    }

    var title: String {
        switch content {
        case .table(let model): model.query.table.description
        case .structure(let model): model.table.description
        case .query(let model): model.title
        }
    }

    var systemImage: String {
        switch content {
        case .table: "tablecells"
        case .structure: "list.bullet.rectangle"
        case .query: "terminal"
        }
    }

    /// Whether closing needs a confirmation (unsaved edits).
    var hasUnsavedChanges: Bool {
        switch content {
        case .table(let model): !model.changes.isEmpty
        case .structure: false
        case .query(let model): model.isInTransaction
        }
    }

    var snapshot: TabSnapshot {
        switch content {
        case .table(let model): .table(model.query)
        case .structure(let model): .structure(model.table)
        case .query(let model): .query(sql: model.text, title: model.customTitle)
        }
    }

    var tableModel: TableTabModel? {
        if case .table(let model) = content { return model }
        return nil
    }

    var queryModel: QueryTabModel? {
        if case .query(let model) = content { return model }
        return nil
    }

    func willClose() async {
        if case .query(let model) = content { await model.closeSession() }
    }
}
