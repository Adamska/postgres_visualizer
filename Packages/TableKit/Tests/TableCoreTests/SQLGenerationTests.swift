import Foundation
import Testing
@testable import TableCore

@Suite("SQL generation")
struct SQLGenerationTests {
    private let users = TableRef(schema: "public", name: "users")

    @Test("Quotes identifiers and literals safely")
    func quoting() {
        #expect(SQLIdentifier.quote("we\"ird") == "\"we\"\"ird\"")
        #expect(SQLIdentifier.quoteIfNeeded("simple_name") == "simple_name")
        #expect(SQLIdentifier.quoteIfNeeded("MixedCase") == "\"MixedCase\"")
        #expect(SQLIdentifier.quoteIfNeeded("select") == "\"select\"")
        #expect(SQLLiteral.quote("it's") == "'it''s'")
        #expect(SQLLiteral.render(CellValue.null) == "NULL")
        #expect(SQLLiteral.render(EditValue.serverDefault) == "DEFAULT")
        #expect(SQLLiteral.render(.binary(Data([0xDE, 0xAD]))) == "'\\xdead'::bytea")
    }

    @Test("Builds a paginated select with filters and sort")
    func tableQuerySQL() {
        var query = TableQuery(table: users, pageSize: 100)
        query.filters = [
            Filter(column: "name", op: .contains, value: "o'b_%"),
            Filter(column: "age", op: .greaterThan, value: "18"),
            Filter(column: "deleted_at", op: .isNull),
            Filter(column: "disabled", op: .equals, value: ""),
            Filter(column: "id", op: .isIn, value: "1, 2 ,3"),
        ]
        query.rawWhere = "created_at > now() - interval '1 day'"
        query.sort = [SortDescriptor(column: "name", ascending: false)]
        query.page = 2

        let predicates = [
            "\"name\"::text ILIKE '%o''b\\_\\%%'", "\"age\" > '18'", "\"deleted_at\" IS NULL",
            "\"id\" IN ('1', '2', '3')", "(created_at > now() - interval '1 day')",
        ]
        let expected = """
        SELECT * FROM "public"."users"
        WHERE \(predicates.joined(separator: " AND "))
        ORDER BY "name" DESC
        LIMIT 100 OFFSET 200
        """
        #expect(query.sql(defaultOrder: ["id"]) == expected)
        #expect(query.countSQL.hasPrefix("SELECT count(*) FROM \"public\".\"users\" WHERE"))
    }

    @Test("Falls back to the primary key for ordering")
    func defaultOrdering() {
        let query = TableQuery(table: users)
        let expected = "SELECT * FROM \"public\".\"users\"\nORDER BY \"tenant\" ASC, \"id\" ASC\nLIMIT 200 OFFSET 0"
        #expect(query.sql(defaultOrder: ["tenant", "id"]) == expected)
        #expect(query.whereClause == nil)
        #expect(!query.hasActiveFilters)
    }

    @Test("Toggling sort cycles ascending, descending, none and resets the page")
    func toggleSort() {
        var query = TableQuery(table: users, page: 3)
        query.toggleSort(column: "name")
        #expect(query.sort == [SortDescriptor(column: "name", ascending: true)])
        #expect(query.page == 0)
        query.toggleSort(column: "name")
        #expect(query.sort == [SortDescriptor(column: "name", ascending: false)])
        query.toggleSort(column: "name")
        #expect(query.sort.isEmpty)
        query.toggleSort(column: "age")
        #expect(query.sort == [SortDescriptor(column: "age", ascending: true)])
    }

    @Test("Table refs render qualified and display names")
    func tableRef() {
        #expect(users.quoted == "\"public\".\"users\"")
        #expect(users.description == "users")
        #expect(TableRef(schema: "audit", name: "Log").description == "audit.Log")
    }
}
