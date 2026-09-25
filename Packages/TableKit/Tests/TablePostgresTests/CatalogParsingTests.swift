import Testing
@testable import TableCore
@testable import TablePostgres

@Suite("Catalog result parsing")
struct CatalogParsingTests {
    private func result(_ columns: [String], _ rows: [[CellValue]]) -> QueryResult {
        QueryResult(statement: "", columns: columns.enumerated().map { ResultColumn(name: $1, index: $0) }, rows: rows)
    }

    @Test("Parses relations and hides unknown estimates")
    func relations() {
        let parsed = CatalogQueries.parseRelations(result(["name", "kind", "estimated_rows", "comment"], [
            [.text("users"), .text("r"), .text("-1"), .null],
            [.text("v"), .text("v"), .text("12"), .text("A view")],
            [.text("weird"), .text("S"), .null, .null],
        ]), schema: "public")
        #expect(parsed.count == 2)
        #expect(parsed[0].estimatedRowCount == nil)
        #expect(parsed[1].kind == .view)
        #expect(parsed[1].estimatedRowCount == 12)
        #expect(parsed[1].comment == "A view")
    }

    @Test("Parses constraints into foreign keys")
    func constraints() {
        let separator = CatalogQueries.separator
        let parsed = CatalogQueries.parseConstraints(result(["name", "kind", "definition", "columns", "ref_schema", "ref_table", "ref_columns"], [
            [.text("pk"), .text("p"), .text("PRIMARY KEY (a, b)"), .text("a\(separator)b"), .null, .null, .null],
            [.text("fk"), .text("f"), .text("FOREIGN KEY (a) REFERENCES t(id)"), .text("a"), .text("public"), .text("t"), .text("id")],
        ]))
        #expect(parsed.constraints.map(\.kind) == [.primaryKey, .foreignKey])
        #expect(parsed.constraints[0].columns == ["a", "b"])
        let expected = ForeignKeyInfo(name: "fk", columns: ["a"], referencedTable: TableRef(schema: "public", name: "t"), referencedColumns: ["id"])
        #expect(parsed.foreignKeys == [expected])
    }

    @Test("Parses columns using the type catalog")
    func columns() {
        let parsed = CatalogQueries.parseColumns(result(
            ["name", "ordinal", "type_name", "type_oid", "is_nullable", "default_value", "is_identity", "is_generated", "comment", "is_primary_key"],
            [[.text("id"), .text("1"), .text("integer"), .text("23"), .text("false"), .null, .text("true"), .text("false"), .null, .text("true")]]
        ), catalog: BuiltinTypes.catalog)
        #expect(parsed.count == 1)
        #expect(parsed[0].kind == .integer)
        #expect(parsed[0].isPrimaryKey && parsed[0].isIdentity && !parsed[0].isNullable && !parsed[0].isGenerated)
    }

    @Test("Parses types with enum labels")
    func types() {
        let columns = ["oid", "name", "schema", "shape", "category", "element_oid", "base_oid", "subtype_oid", "labels"]
        let row: [CellValue] = [
            .text("16400"), .text("mood"), .text("public"), .text("e"), .text("E"),
            .text("0"), .text("0"), .text("0"), .text("sad\(CatalogQueries.separator)happy"),
        ]
        let parsed = CatalogQueries.parseTypes(result(columns, [row]))
        let expected = TypeInfo(oid: 16_400, name: "mood", schema: "public", shape: .enumeration, category: "E", enumLabels: ["sad", "happy"])
        #expect(parsed == [expected])
    }
}
