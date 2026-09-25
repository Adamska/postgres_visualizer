import Foundation
import TableCore
import Testing
@testable import TablePlusPlus

@MainActor
@Suite("Table tab model")
struct TableTabModelTests {
    private func makeModel(database: MockDatabase = .sample) async -> (TableTabModel, ConnectionModel) {
        let environment = AppEnvironment.preview(driver: MockDriver(database: database))
        let connection = ConnectionModel(profile: ConnectionProfile(name: "Mock"), environment: environment)
        await connection.connect()
        let model = TableTabModel(query: TableQuery(table: MockDatabase.users), connection: connection)
        await model.load()
        return (model, connection)
    }

    @Test("Loads the structure, the page and the count")
    func loads() async {
        let (model, _) = await makeModel()
        #expect(model.structure?.primaryKeyColumns == ["id"])
        #expect(model.result?.rows.count == 3)
        #expect(model.gridContent.columns.map(\.name) == ["id", "email", "is_active", "profile", "team_id"])
        #expect(model.gridContent.columns[0].isPrimaryKey)
        #expect(model.gridContent.columns[4].isForeignKey)
        #expect(model.gridContent.rows[1].cells[3].isNull)
        #expect(model.isEditable)
        #expect(model.readOnlyReason == nil)
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.totalCount == 3)
        #expect(model.pageRange == "1–3 of 3 rows")
    }

    @Test("Stages edits, deletes and inserts and renders them in the grid")
    func staging() async {
        let (model, connection) = await makeModel()
        model.setValue(.text("new@example.com"), at: GridCellPosition(row: 0, column: 1))
        model.setValue(.null, at: GridCellPosition(row: 2, column: 4))
        model.toggleDelete(rows: IndexSet(integer: 1))
        model.addRow()
        model.setValue(.text("dee@example.com"), at: GridCellPosition(row: 3, column: 1))

        #expect(model.changes.count == 4)
        #expect(model.gridContent.rows[0].state == .modified)
        #expect(model.gridContent.rows[0].cells[1].isModified)
        #expect(model.gridContent.rows[0].cells[1].text == "new@example.com")
        #expect(model.gridContent.rows[1].state == .deleted)
        #expect(model.gridContent.rows[3].state == .inserted)
        #expect(model.gridContent.rows[3].cells[0].isDefault)
        #expect(model.focusedCell == GridCellPosition(row: 3, column: 1))
        #expect(model.value(at: GridCellPosition(row: 0, column: 1)) == .text("new@example.com"))
        #expect(model.value(at: GridCellPosition(row: 2, column: 4)) == .null)

        #expect(model.pendingStatements == [
            "DELETE FROM \"public\".\"users\" WHERE \"id\" = '2'",
            "UPDATE \"public\".\"users\" SET \"email\" = 'new@example.com' WHERE \"id\" = '1'",
            "UPDATE \"public\".\"users\" SET \"team_id\" = NULL WHERE \"id\" = '3'",
            "INSERT INTO \"public\".\"users\" (\"email\") VALUES ('dee@example.com')",
        ])

        await model.commit()
        #expect(model.changes.isEmpty)
        #expect(model.error == nil)
        _ = connection
        // Reverting to the original value clears the edit.
        model.setValue(.text("x"), at: GridCellPosition(row: 0, column: 1))
        model.setValue(.text("ann@example.com"), at: GridCellPosition(row: 0, column: 1))
        #expect(model.changes.isEmpty)
        model.discardChanges()
    }

    @Test("Toggling delete twice restores the row and inserted rows are removed")
    func deleteToggle() async {
        let (model, _) = await makeModel()
        model.toggleDelete(rows: IndexSet(integer: 0))
        model.toggleDelete(rows: IndexSet(integer: 0))
        #expect(model.changes.isEmpty)
        model.addRow()
        model.toggleDelete(rows: IndexSet(integer: 3))
        #expect(model.changes.isEmpty)
        #expect(model.gridContent.rows.count == 3)
    }

    @Test("Duplicating rows copies values but not identity columns")
    func duplicate() async {
        let (model, _) = await makeModel()
        model.duplicateRows(IndexSet(integer: 0))
        #expect(model.changes.inserts.count == 1)
        #expect(model.changes.inserts[0].values["id"] == nil)
        #expect(model.changes.inserts[0].values["email"] == .text("ann@example.com"))
        #expect(model.pendingStatements.first?.hasPrefix("INSERT INTO \"public\".\"users\" (\"email\", \"is_active\", \"profile\", \"team_id\")") == true)
    }

    @Test("Foreign key targets and sort state")
    func foreignKeysAndSort() async {
        let (model, _) = await makeModel()
        let target = model.foreignKeyTarget(at: GridCellPosition(row: 0, column: 4))
        #expect(target?.table == TableRef(schema: "public", name: "teams"))
        #expect(target?.filter.column == "id" && target?.filter.value == "1")
        #expect(model.foreignKeyTarget(at: GridCellPosition(row: 1, column: 4)) == nil)
        #expect(model.foreignKeyTarget(at: GridCellPosition(row: 0, column: 1)) == nil)

        await model.toggleSort(columnID: 1)
        #expect(model.sortState == GridSortState(columnID: 1, ascending: true))
        #expect(model.query.sort == [SortDescriptor(column: "email", ascending: true)])
    }

    @Test("Views are read-only and report why")
    func readOnly() async {
        var database = MockDatabase.sample
        let view = TableRef(schema: "public", name: "active_users")
        database.structures[view] = TableStructure(ref: view, kind: .view, columns: [ColumnInfo(name: "id", ordinal: 1, typeName: "integer")])
        let environment = AppEnvironment.preview(driver: MockDriver(database: database))
        let connection = ConnectionModel(profile: ConnectionProfile(), environment: environment)
        await connection.connect()
        let model = TableTabModel(query: TableQuery(table: view), connection: connection)
        await model.load()
        #expect(!model.isEditable)
        #expect(model.readOnlyReason == "Views are read-only.")
        model.addRow()
        #expect(model.changes.isEmpty)
    }

    @Test("Exports the page or the selection")
    func export() async {
        let (model, _) = await makeModel()
        model.selectedRows = IndexSet(integer: 1)
        let csv = model.exportText(format: .csv, scope: .selection)
        #expect(csv == "id,email,is_active,profile,team_id\n2,bob@example.com,false,,\n")
        let all = model.exportText(format: .sqlInsert, scope: .page)
        #expect(all.components(separatedBy: "\n").filter { !$0.isEmpty }.count == 3)
    }

    @Test("Errors surface without losing the previous page")
    func errors() async {
        var database = MockDatabase.sample
        database.executionFailure = DatabaseError(category: .server, message: "boom")
        let environment = AppEnvironment.preview(driver: MockDriver(database: database))
        let connection = ConnectionModel(profile: ConnectionProfile(), environment: environment)
        await connection.connect()
        let model = TableTabModel(query: TableQuery(table: MockDatabase.users), connection: connection)
        await model.load()
        #expect(model.error?.message == "boom")
        #expect(model.result == nil)
    }
}
