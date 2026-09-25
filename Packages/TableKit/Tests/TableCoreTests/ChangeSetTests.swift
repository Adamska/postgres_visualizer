import Testing
@testable import TableCore

@Suite("Change set")
struct ChangeSetTests {
    private let structure = TableStructure(
        ref: TableRef(schema: "public", name: "users"),
        columns: [
            ColumnInfo(name: "id", ordinal: 1, typeName: "int4", kind: .integer, isNullable: false, isPrimaryKey: true, isIdentity: true),
            ColumnInfo(name: "name", ordinal: 2, typeName: "text", kind: .text),
            ColumnInfo(name: "email", ordinal: 3, typeName: "text", kind: .text),
            ColumnInfo(name: "search", ordinal: 4, typeName: "tsvector", isGenerated: true),
        ]
    )

    private let columns = [
        ResultColumn(name: "id", index: 0), ResultColumn(name: "name", index: 1), ResultColumn(name: "email", index: 2),
    ]

    @Test("Builds identities from primary key values")
    func identity() throws {
        let row: [CellValue] = [.text("7"), .text("Ann"), .null]
        let identity = try #require(RowIdentity(structure: structure, row: row, columns: columns))
        #expect(identity.predicate == "\"id\" = '7'")
        #expect(RowIdentity(structure: TableStructure(ref: structure.ref, columns: []), row: row, columns: columns) == nil)
    }

    @Test("Staging the original value clears the edit")
    func stagingRoundTrip() {
        var changes = ChangeSet()
        let row = RowIdentity(keys: [("id", .text("1"))])
        changes.setValue(.text("Bob"), original: .text("Ann"), column: "name", row: row)
        #expect(changes.count == 1)
        #expect(changes.stagedValue(column: "name", row: row) == .text("Bob"))
        changes.setValue(.text("Ann"), original: .text("Ann"), column: "name", row: row)
        #expect(changes.isEmpty)
    }

    @Test("Generates deletes, updates and inserts in a stable order")
    func statements() {
        var changes = ChangeSet()
        let first = RowIdentity(keys: [("id", .text("1"))])
        let second = RowIdentity(keys: [("id", .text("2"))])
        changes.setValue(.text("O'Brien"), original: .text("Ann"), column: "name", row: second)
        changes.setValue(.null, original: .text("x"), column: "email", row: second)
        changes.markDeleted(first)
        var insert = changes.addInsert()
        changes.setInsertValue(.text("Zed"), column: "name", insertID: insert.id)
        changes.setInsertValue(.serverDefault, column: "id", insertID: insert.id)
        changes.setInsertValue(.text("ignored"), column: "search", insertID: insert.id)
        insert = changes.addInsert()

        #expect(changes.statements(for: structure) == [
            "DELETE FROM \"public\".\"users\" WHERE \"id\" = '1'",
            "UPDATE \"public\".\"users\" SET \"email\" = NULL, \"name\" = 'O''Brien' WHERE \"id\" = '2'",
            "INSERT INTO \"public\".\"users\" (\"name\") VALUES ('Zed')",
            "INSERT INTO \"public\".\"users\" DEFAULT VALUES",
        ])
        #expect(changes.script(for: structure).hasSuffix("DEFAULT VALUES;"))
    }

    @Test("Deleting a row discards its pending updates")
    func deleteClearsUpdates() {
        var changes = ChangeSet()
        let row = RowIdentity(keys: [("id", .text("1"))])
        changes.setValue(.text("x"), original: .null, column: "name", row: row)
        changes.markDeleted(row)
        #expect(!changes.isModified(row: row))
        #expect(changes.isDeleted(row))
        changes.unmarkDeleted(row)
        #expect(changes.isEmpty)
    }

    @Test("Editability requires a primary key and a writable relation")
    func editability() {
        #expect(structure.isEditable)
        var view = structure
        view.kind = .view
        #expect(!view.isEditable)
        #expect(structure.primaryKeyColumns == ["id"])
    }
}
