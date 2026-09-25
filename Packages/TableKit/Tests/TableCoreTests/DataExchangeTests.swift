import Testing
@testable import TableCore

@Suite("CSV, JSON and SQL exchange")
struct DataExchangeTests {
    private let columns = [
        ResultColumn(name: "id", kind: .integer, index: 0),
        ResultColumn(name: "name", kind: .text, index: 1),
        ResultColumn(name: "active", kind: .boolean, index: 2),
        ResultColumn(name: "meta", kind: .json, index: 3),
    ]
    private let rows: [[CellValue]] = [
        [.text("1"), .text("Ann, \"the\" first\nline"), .text("t"), .text("{\"a\":1}")],
        [.text("2"), .null, .text("f"), .text("not json")],
    ]

    @Test("Writes RFC 4180 CSV and reads it back")
    func csvRoundTrip() {
        let csv = CSVWriter.encode(columns: columns.map(\.name), rows: rows)
        #expect(csv == "id,name,active,meta\n1,\"Ann, \"\"the\"\" first\nline\",t,\"{\"\"a\"\":1}\"\n2,,f,not json\n")
        let document = CSVReader.parse(csv)
        #expect(document.header == ["id", "name", "active", "meta"])
        #expect(document.rows == [["1", "Ann, \"the\" first\nline", "t", "{\"a\":1}"], ["2", "", "f", "not json"]])
    }

    @Test("Reads CRLF files, semicolons and headerless documents")
    func csvVariants() {
        let document = CSVReader.parse("a;b\r\n1;2\r\n", options: CSVOptions(delimiter: ";"))
        #expect(document.rows == [["1", "2"]])
        #expect(CSVReader.detectDelimiter(in: "a;b;c\n1;2;3") == ";")
        #expect(CSVReader.detectDelimiter(in: "a\tb\n") == "\t")
        let headerless = CSVReader.parse("x,y\n", options: CSVOptions(hasHeader: false))
        #expect(headerless.header == ["column1", "column2"])
        #expect(headerless.rows == [["x", "y"]])
    }

    @Test("Exports JSON with native numbers, booleans and JSON values")
    func json() {
        let json = ResultExporter.export(columns: columns, rows: rows, format: .json)
        #expect(json == """
        [
          {"id": 1, "name": "Ann, \\"the\\" first\\nline", "active": true, "meta": {"a":1}},
          {"id": 2, "name": null, "active": false, "meta": "not json"}
        ]

        """)
    }

    @Test("Exports SQL inserts")
    func sqlInserts() {
        let sql = ResultExporter.export(columns: columns, rows: [rows[1]], format: .sqlInsert, table: TableRef(schema: "s", name: "t"))
        #expect(sql == "INSERT INTO \"s\".\"t\" (\"id\", \"name\", \"active\", \"meta\") VALUES ('2', NULL, 'f', 'not json');\n")
    }

    @Test("Plans CSV imports with automatic mapping and batching")
    func importPlan() {
        let structure = TableStructure(ref: TableRef(schema: "public", name: "people"), columns: [
            ColumnInfo(name: "id", ordinal: 1, typeName: "int4", isPrimaryKey: true),
            ColumnInfo(name: "full_name", ordinal: 2, typeName: "text"),
        ])
        let document = CSVDocument(header: ["ID", "Full_Name", "extra"], rows: [["1", "Ann", "x"], ["2", "", "y"], ["3", "Cy"]])
        var plan = CSVImportPlan.automatic(document: document, structure: structure)
        #expect(plan.mappings.map(\.tableColumn) == ["id", "full_name", nil])
        plan.batchSize = 2
        let statements = plan.statements(for: document)
        #expect(statements == [
            "INSERT INTO \"public\".\"people\" (\"id\", \"full_name\") VALUES\n('1', 'Ann'),\n('2', NULL)",
            "INSERT INTO \"public\".\"people\" (\"id\", \"full_name\") VALUES\n('3', 'Cy')",
        ])
    }
}
