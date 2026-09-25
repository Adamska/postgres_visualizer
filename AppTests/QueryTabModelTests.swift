import Foundation
import TableCore
import Testing
@testable import TablePlusPlus

@MainActor
@Suite("Query tab model")
struct QueryTabModelTests {
    private func makeModel(text: String, database: MockDatabase = .sample) async -> QueryTabModel {
        let environment = AppEnvironment.preview(driver: MockDriver(database: database))
        let connection = ConnectionModel(profile: ConnectionProfile(name: "Mock"), environment: environment)
        await connection.connect()
        await connection.loadObjects(in: "public")
        return QueryTabModel(text: text, connection: connection, environment: environment)
    }

    @Test("Picks the statement under the caret or the selection")
    func statementSelection() async {
        let model = await makeModel(text: "select 1;\nselect 2;\n\nselect 3")
        model.selectedRange = NSRange(location: 12, length: 0)
        #expect(model.statements(for: .currentStatement).map(\.text) == ["select 2"])
        model.selectedRange = NSRange(location: 0, length: 19)
        #expect(model.statements(for: .currentStatement).map(\.text) == ["select 1", "select 2"])
        #expect(model.statements(for: .all).map(\.text) == ["select 1", "select 2", "select 3"])
    }

    @Test("Runs statements, records history and tracks transactions")
    func run() async throws {
        let model = await makeModel(text: "BEGIN;\nSELECT * FROM users;\nUPDATE users SET a = 1;")
        await model.run(.all)?.value
        #expect(model.results.count == 3)
        #expect(model.isInTransaction)
        #expect(model.selectedResultIndex == 2)
        #expect(model.statusMessage?.hasPrefix("3 statements in") == true)
        model.selectedResultIndex = 1
        #expect(model.gridContent.rows.count == 3)
        #expect(model.gridContent.columns.first?.isEditable == false)
        model.text = "COMMIT;"
        await model.run(.all)?.value
        #expect(!model.isInTransaction)
        #expect(model.title == "COMMIT;")
    }

    @Test("Maps server error positions onto the editor text")
    func errorMarker() {
        let script = "select 1;\nselect * from nowhere"
        let statement = SQLStatementSplitter.split(script)[1]
        let error = DatabaseError(category: .server, message: "relation \"nowhere\" does not exist", position: 15)
        let marker = QueryTabModel.marker(for: error, statement: statement, in: script)
        #expect(marker == SQLErrorMarker(location: 24, length: 7, message: "relation \"nowhere\" does not exist"))
        #expect(QueryTabModel.marker(for: DatabaseError(category: .server, message: "x"), statement: statement, in: script) == nil)
    }

    @Test("Failures stop the batch and expose the marker")
    func failure() async {
        var database = MockDatabase.sample
        database.executionFailure = DatabaseError(category: .server, message: "syntax error", position: 1)
        let model = await makeModel(text: "selec 1;\nselect 2", database: database)
        await model.run(.all)?.value
        #expect(model.error?.message == "syntax error")
        #expect(model.errorMarker?.location == 0)
        #expect(model.errorMarker?.length == 5)
        #expect(model.results.isEmpty)
        model.text += " "
        #expect(model.errorMarker == nil)
    }

    @Test("Completes columns of referenced tables, tables and keywords")
    func completions() async {
        let model = await makeModel(text: "select u. from users u")
        _ = try? await model.connection.structure(of: MockDatabase.users)
        let qualified = model.completions(prefix: "", qualifier: "u")
        #expect(qualified.map(\.text) == ["email", "id", "is_active", "profile", "team_id"])
        let tables = model.completions(prefix: "us", qualifier: nil)
        #expect(tables.first?.kind != .keyword)
        #expect(tables.contains { $0.text == "users" && $0.kind == .table })
        #expect(tables.contains { $0.kind == .keyword && $0.text == "USING" })
        let schemaQualified = model.completions(prefix: "", qualifier: "public")
        #expect(schemaQualified.map(\.text).contains("teams"))
        #expect(schemaQualified.contains { $0.kind == .function && $0.text == "user_count()" })
    }
}

@Suite("Completion engine")
struct SQLCompletionEngineTests {
    @Test("Finds referenced tables and aliases")
    func references() {
        let relations = [RelationInfo(ref: TableRef(schema: "audit", name: "log"), kind: .table)]
        let sql = "SELECT * FROM public.users AS u, audit.log JOIN \"Orders\" o ON o.user_id = u.id LEFT JOIN teams t WHERE t.id = 1"
        let references = SQLCompletionEngine.referencedTables(in: sql, relations: relations)
        #expect(references.map(\.alias) == ["u", nil, "o", "t"])
        #expect(references.map(\.table) == [
            TableRef(schema: "public", name: "users"), TableRef(schema: "audit", name: "log"),
            TableRef(schema: "public", name: "Orders"), TableRef(schema: "public", name: "teams"),
        ])
    }

    @Test("Ranks prefix matches first and deduplicates")
    func ranking() {
        let ranked = SQLCompletionEngine.rank([
            SQLCompletion(text: "SELECT", kind: .keyword), SQLCompletion(text: "users", kind: .table),
            SQLCompletion(text: "user_id", kind: .column), SQLCompletion(text: "user_id", kind: .column),
            SQLCompletion(text: "focused_user", kind: .column), SQLCompletion(text: "USER", kind: .keyword),
        ], prefix: "user")
        #expect(ranked.map(\.text) == ["USER", "user_id", "users", "focused_user"])
    }
}
