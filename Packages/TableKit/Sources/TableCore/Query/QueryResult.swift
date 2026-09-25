import Foundation

/// Description of one column of a result set.
public struct ResultColumn: Hashable, Sendable, Identifiable {
    public var name: String
    public var typeOID: UInt32
    public var typeName: String
    public var kind: ValueKind
    /// Position in the result set, which also serves as identity because names may repeat.
    public var index: Int

    public var id: Int { index }

    public init(name: String, typeOID: UInt32 = 0, typeName: String = "", kind: ValueKind = .other, index: Int) {
        self.name = name
        self.typeOID = typeOID
        self.typeName = typeName
        self.kind = kind
        self.index = index
    }
}

/// The outcome of executing a single SQL statement.
public struct QueryResult: Hashable, Sendable {
    public var statement: String
    public var columns: [ResultColumn]
    public var rows: [[CellValue]]
    /// The server command tag, e.g. `UPDATE 3` or `SELECT 10`.
    public var commandTag: String?
    /// Number of rows affected by a DML statement, when known.
    public var affectedRows: Int?
    public var duration: Duration
    /// True when the row limit was reached and more rows exist server side.
    public var isTruncated: Bool

    public init(
        statement: String,
        columns: [ResultColumn] = [],
        rows: [[CellValue]] = [],
        commandTag: String? = nil,
        affectedRows: Int? = nil,
        duration: Duration = .zero,
        isTruncated: Bool = false
    ) {
        self.statement = statement
        self.columns = columns
        self.rows = rows
        self.commandTag = commandTag
        self.affectedRows = affectedRows
        self.duration = duration
        self.isTruncated = isTruncated
    }

    public var hasRows: Bool { !columns.isEmpty }

    /// Index of a column by name; the first match wins for duplicated names.
    public func columnIndex(named name: String) -> Int? {
        columns.firstIndex { $0.name == name }
    }

    /// Reads a value by row and column name, `nil` when either is missing.
    public func value(row: Int, column name: String) -> CellValue? {
        guard rows.indices.contains(row), let index = columnIndex(named: name) else { return nil }
        return rows[row][index]
    }

    /// One line summary such as `12 rows in 4 ms` or `UPDATE 3`.
    public var summary: String {
        let millis = Double(duration.components.seconds) * 1_000 + Double(duration.components.attoseconds) / 1e15
        let elapsed = millis < 1 ? String(format: "%.2f ms", millis) : String(format: "%.0f ms", millis)
        if hasRows {
            let count = rows.count == 1 ? "1 row" : "\(rows.count) rows"
            return isTruncated ? "\(count) (limited) in \(elapsed)" : "\(count) in \(elapsed)"
        }
        if let affectedRows {
            return "\(commandTag ?? "OK") · \(affectedRows) affected in \(elapsed)"
        }
        return "\(commandTag ?? "OK") in \(elapsed)"
    }
}

/// Options that govern the execution of a single statement.
public struct ExecutionOptions: Sendable, Hashable {
    /// Maximum number of rows to fetch before truncating; `nil` fetches everything.
    public var rowLimit: Int?

    public init(rowLimit: Int? = 1_000) {
        self.rowLimit = rowLimit
    }
}
