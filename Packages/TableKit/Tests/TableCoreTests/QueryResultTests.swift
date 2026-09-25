import Foundation
import Testing
@testable import TableCore

@Suite("Query results")
struct QueryResultTests {
    @Test("Summaries describe rows, affected counts and timings")
    func summaries() {
        let column = ResultColumn(name: "a", index: 0)
        let select = QueryResult(statement: "select", columns: [column], rows: [[.text("1")]], duration: .milliseconds(12))
        #expect(select.summary == "1 row in 12 ms")
        let limited = QueryResult(statement: "select", columns: [column], rows: [[.null], [.null]], duration: .microseconds(300), isTruncated: true)
        #expect(limited.summary == "2 rows (limited) in 0.30 ms")
        let update = QueryResult(statement: "update", commandTag: "UPDATE 3", affectedRows: 3, duration: .milliseconds(2))
        #expect(update.summary == "UPDATE 3 · 3 affected in 2 ms")
        let ddl = QueryResult(statement: "create", duration: .seconds(1))
        #expect(ddl.summary == "OK in 1000 ms")
    }

    @Test("Looks values up by column name")
    func lookup() {
        let columns = [ResultColumn(name: "a", index: 0), ResultColumn(name: "a", index: 1)]
        let result = QueryResult(statement: "", columns: columns, rows: [[.text("x"), .text("y")]])
        #expect(result.columnIndex(named: "a") == 0)
        #expect(result.value(row: 0, column: "a") == .text("x"))
        #expect(result.value(row: 1, column: "a") == nil)
        #expect(result.value(row: 0, column: "zzz") == nil)
    }

    @Test("Cell and edit values convert consistently")
    func values() {
        #expect(CellValue.binary(Data([1, 255])).exportString == "\\x01ff")
        #expect(CellValue.null.exportString == nil)
        #expect(EditValue(.binary(Data([1]))) == .text("\\x01"))
        #expect(EditValue.serverDefault.cellValue == nil)
        #expect(EditValue.text("a").cellValue == .text("a"))
    }
}
