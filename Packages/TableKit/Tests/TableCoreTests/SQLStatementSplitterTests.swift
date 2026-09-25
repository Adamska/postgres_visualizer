import Testing
@testable import TableCore

@Suite("SQL statement splitting")
struct SQLStatementSplitterTests {
    @Test("Splits on semicolons outside of strings and comments")
    func splitsSimpleScript() {
        let script = "select 1; -- a; comment\nselect ';'; insert into t values ($$x;y$$);\n\n"
        let statements = SQLStatementSplitter.split(script).map(\.text)
        #expect(statements == ["select 1", "select ';'", "insert into t values ($$x;y$$)"])
    }

    @Test("Keeps a trailing statement without semicolon")
    func trailingStatement() {
        let statements = SQLStatementSplitter.split("select 1;\nselect 2").map(\.text)
        #expect(statements == ["select 1", "select 2"])
    }

    @Test("Ignores empty statements and comment-only segments")
    func ignoresEmpty() {
        let statements = SQLStatementSplitter.split(";;  ; /* nothing */ ;").map(\.text)
        #expect(statements.isEmpty)
    }

    @Test("Statement ranges point at the source")
    func ranges() {
        let script = "select a from t;\nselect b from u;"
        let statements = SQLStatementSplitter.split(script)
        #expect(statements.count == 2)
        #expect(String(script[statements[1].range]) == "select b from u")
    }

    @Test("Finds the statement under the cursor")
    func statementAtCursor() throws {
        let script = "select 1;\n\nselect 2;\nselect 3"
        let second = script.range(of: "select 2")!
        let inside = SQLStatementSplitter.statement(at: script.index(second.lowerBound, offsetBy: 3), in: script)
        #expect(inside?.text == "select 2")

        let atEndOfFirst = SQLStatementSplitter.statement(at: script.index(script.startIndex, offsetBy: 8), in: script)
        #expect(atEndOfFirst?.text == "select 1")

        let afterSemicolon = SQLStatementSplitter.statement(at: script.index(script.startIndex, offsetBy: 9), in: script)
        #expect(afterSemicolon?.text == "select 1")

        let onBlankLine = SQLStatementSplitter.statement(at: script.index(script.startIndex, offsetBy: 10), in: script)
        #expect(onBlankLine?.text == "select 1")

        let atEnd = SQLStatementSplitter.statement(at: script.endIndex, in: script)
        #expect(atEnd?.text == "select 3")
    }

    @Test("Classifies statements by their leading keyword", arguments: [
        ("SELECT 1", SQLStatementKind.select), ("  with x as (select 1) select * from x", .select),
        ("/* c */ insert into t values (1)", .insert), ("UPDATE t SET a = 1", .update),
        ("delete from t", .delete), ("explain analyze select 1", .explain),
        ("begin", .transactionBegin), ("START TRANSACTION", .transactionBegin),
        ("commit", .transactionCommit), ("rollback", .transactionRollback),
        ("create table t (id int)", .other("create")), ("(select 1)", .select),
    ])
    func classify(sql: String, expected: SQLStatementKind) {
        #expect(SQLStatementKind.classify(sql) == expected)
    }

    @Test("Data modification statements are flagged")
    func flags() {
        #expect(SQLStatementKind.classify("update t set a=1").isDataModification)
        #expect(!SQLStatementKind.classify("select 1").isDataModification)
        #expect(SQLStatementKind.classify("show all").mayReturnRows)
        #expect(!SQLStatementKind.classify("create index i on t(a)").mayReturnRows)
    }
}
