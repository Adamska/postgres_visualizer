/// Maps CSV columns onto table columns and produces batched INSERT statements.
public struct CSVImportPlan: Hashable, Sendable {
    public struct Mapping: Hashable, Sendable, Identifiable {
        public var csvColumn: String
        /// Target table column, or nil to skip the CSV column.
        public var tableColumn: String?

        public var id: String { csvColumn }

        public init(csvColumn: String, tableColumn: String?) {
            self.csvColumn = csvColumn
            self.tableColumn = tableColumn
        }
    }

    public var table: TableRef
    public var mappings: [Mapping]
    /// CSV fields equal to this string are inserted as NULL.
    public var nullRepresentation: String
    public var batchSize: Int

    public init(table: TableRef, mappings: [Mapping], nullRepresentation: String = "", batchSize: Int = 500) {
        self.table = table
        self.mappings = mappings
        self.nullRepresentation = nullRepresentation
        self.batchSize = max(1, batchSize)
    }

    /// Automatically pairs CSV headers with table columns by case-insensitive name.
    public static func automatic(document: CSVDocument, structure: TableStructure) -> CSVImportPlan {
        let mappings = document.header.map { header -> Mapping in
            let match = structure.columns.first { $0.name.caseInsensitiveCompare(header) == .orderedSame }
            return Mapping(csvColumn: header, tableColumn: match?.name)
        }
        return CSVImportPlan(table: structure.ref, mappings: mappings)
    }

    public var activeMappings: [Mapping] { mappings.filter { $0.tableColumn != nil } }

    /// Multi-row INSERT statements, one per batch.
    public func statements(for document: CSVDocument) -> [String] {
        let active = activeMappings
        guard !active.isEmpty else { return [] }
        let columnIndexes = active.map { mapping in document.header.firstIndex(of: mapping.csvColumn) }
        let names = active.compactMap(\.tableColumn).map { SQLIdentifier.quote($0) }.joined(separator: ", ")

        var statements: [String] = []
        var batch: [String] = []
        for row in document.rows {
            let values = columnIndexes.map { index -> String in
                guard let index, row.indices.contains(index) else { return "NULL" }
                let field = row[index]
                return field == nullRepresentation ? "NULL" : SQLLiteral.quote(field)
            }
            batch.append("(" + values.joined(separator: ", ") + ")")
            if batch.count == batchSize {
                statements.append("INSERT INTO \(table.quoted) (\(names)) VALUES\n" + batch.joined(separator: ",\n"))
                batch = []
            }
        }
        if !batch.isEmpty {
            statements.append("INSERT INTO \(table.quoted) (\(names)) VALUES\n" + batch.joined(separator: ",\n"))
        }
        return statements
    }
}
