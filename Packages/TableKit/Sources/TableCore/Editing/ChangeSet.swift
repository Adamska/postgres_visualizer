public import Foundation

/// Identifies a persisted row by its primary key values, as returned by the server.
public struct RowIdentity: Hashable, Sendable {
    public var keys: [(column: String, value: CellValue)]

    public init(keys: [(column: String, value: CellValue)]) {
        self.keys = keys
    }

    public init?(structure: TableStructure, row: [CellValue], columns: [ResultColumn]) {
        let keyColumns = structure.primaryKeyColumns
        guard !keyColumns.isEmpty else { return nil }
        var keys: [(String, CellValue)] = []
        for column in keyColumns {
            guard let index = columns.firstIndex(where: { $0.name == column }), row.indices.contains(index) else { return nil }
            keys.append((column, row[index]))
        }
        self.keys = keys
    }

    public static func == (lhs: RowIdentity, rhs: RowIdentity) -> Bool {
        lhs.keys.count == rhs.keys.count && zip(lhs.keys, rhs.keys).allSatisfy { $0.column == $1.column && $0.value == $1.value }
    }

    public func hash(into hasher: inout Hasher) {
        for key in keys {
            hasher.combine(key.column)
            hasher.combine(key.value)
        }
    }

    /// `"id" = '42' AND "tenant" = 'acme'`
    public var predicate: String {
        keys.map { key in
            switch key.value {
            case .null: "\(SQLIdentifier.quote(key.column)) IS NULL"
            default: "\(SQLIdentifier.quote(key.column)) = \(SQLLiteral.render(key.value))"
            }
        }.joined(separator: " AND ")
    }
}

/// A row added locally that has not been sent to the server yet.
public struct PendingInsert: Hashable, Sendable, Identifiable {
    public var id: UUID
    public var values: [String: EditValue]

    public init(id: UUID = UUID(), values: [String: EditValue] = [:]) {
        self.id = id
        self.values = values
    }
}

/// Local modifications to one table, kept until the user commits or discards them.
public struct ChangeSet: Hashable, Sendable {
    public private(set) var updates: [RowIdentity: [String: EditValue]] = [:]
    public private(set) var inserts: [PendingInsert] = []
    public private(set) var deletes: Set<RowIdentity> = []

    public init() {}

    public var isEmpty: Bool { updates.isEmpty && inserts.isEmpty && deletes.isEmpty }

    public var count: Int {
        updates.values.reduce(0) { $0 + $1.count } + inserts.count + deletes.count
    }

    // MARK: Updates

    /// Stages a new value; passing the original value removes the staged edit.
    public mutating func setValue(_ value: EditValue, original: CellValue, column: String, row: RowIdentity) {
        if value == EditValue(original) {
            revertValue(column: column, row: row)
            return
        }
        updates[row, default: [:]][column] = value
    }

    public mutating func revertValue(column: String, row: RowIdentity) {
        updates[row]?[column] = nil
        if updates[row]?.isEmpty == true { updates[row] = nil }
    }

    public func stagedValue(column: String, row: RowIdentity) -> EditValue? {
        updates[row]?[column]
    }

    public func isModified(row: RowIdentity) -> Bool { updates[row] != nil }

    // MARK: Deletes

    public mutating func markDeleted(_ row: RowIdentity) {
        deletes.insert(row)
        updates[row] = nil
    }

    public mutating func unmarkDeleted(_ row: RowIdentity) {
        deletes.remove(row)
    }

    public func isDeleted(_ row: RowIdentity) -> Bool { deletes.contains(row) }

    // MARK: Inserts

    @discardableResult
    public mutating func addInsert(_ insert: PendingInsert = PendingInsert()) -> PendingInsert {
        inserts.append(insert)
        return insert
    }

    public mutating func setInsertValue(_ value: EditValue, column: String, insertID: UUID) {
        guard let index = inserts.firstIndex(where: { $0.id == insertID }) else { return }
        inserts[index].values[column] = value
    }

    public mutating func removeInsert(_ insertID: UUID) {
        inserts.removeAll { $0.id == insertID }
    }

    public func insert(_ insertID: UUID) -> PendingInsert? {
        inserts.first { $0.id == insertID }
    }

    public mutating func removeAll() {
        self = ChangeSet()
    }

    // MARK: SQL

    /// Statements that apply the change set, in a deterministic order: deletes, updates, inserts.
    public func statements(for structure: TableStructure) -> [String] {
        let table = structure.ref.quoted
        var statements: [String] = []

        for row in deletes.sorted(by: { $0.predicate < $1.predicate }) {
            statements.append("DELETE FROM \(table) WHERE \(row.predicate)")
        }

        for (row, columns) in updates.sorted(by: { $0.key.predicate < $1.key.predicate }) where !columns.isEmpty {
            let assignments = columns.sorted(by: { $0.key < $1.key }).map { column, value in
                "\(SQLIdentifier.quote(column)) = \(SQLLiteral.render(value))"
            }
            statements.append("UPDATE \(table) SET \(assignments.joined(separator: ", ")) WHERE \(row.predicate)")
        }

        for insert in inserts {
            let provided = structure.columns
                .filter { $0.isWritable }
                .compactMap { column -> (String, EditValue)? in
                    guard let value = insert.values[column.name], value != .serverDefault else { return nil }
                    return (column.name, value)
                }
            if provided.isEmpty {
                statements.append("INSERT INTO \(table) DEFAULT VALUES")
            } else {
                let names = provided.map { SQLIdentifier.quote($0.0) }.joined(separator: ", ")
                let values = provided.map { SQLLiteral.render($0.1) }.joined(separator: ", ")
                statements.append("INSERT INTO \(table) (\(names)) VALUES (\(values))")
            }
        }
        return statements
    }

    /// The statements joined into one script, for preview.
    public func script(for structure: TableStructure) -> String {
        statements(for: structure).map { $0 + ";" }.joined(separator: "\n")
    }
}
