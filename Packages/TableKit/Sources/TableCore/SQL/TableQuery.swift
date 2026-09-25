public import Foundation

public enum FilterOperator: String, Codable, CaseIterable, Sendable, Identifiable {
    case equals = "="
    case notEquals = "<>"
    case lessThan = "<"
    case lessOrEqual = "<="
    case greaterThan = ">"
    case greaterOrEqual = ">="
    case like = "LIKE"
    case notLike = "NOT LIKE"
    case iLike = "ILIKE"
    case contains = "contains"
    case startsWith = "starts with"
    case endsWith = "ends with"
    case isIn = "IN"
    case isNotIn = "NOT IN"
    case isNull = "IS NULL"
    case isNotNull = "IS NOT NULL"
    case isTrue = "IS TRUE"
    case isFalse = "IS FALSE"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .equals: "equals"
        case .notEquals: "not equals"
        case .lessThan: "less than"
        case .lessOrEqual: "less or equal"
        case .greaterThan: "greater than"
        case .greaterOrEqual: "greater or equal"
        case .like: "LIKE"
        case .notLike: "NOT LIKE"
        case .iLike: "ILIKE"
        case .contains: "contains"
        case .startsWith: "starts with"
        case .endsWith: "ends with"
        case .isIn: "in list"
        case .isNotIn: "not in list"
        case .isNull: "is null"
        case .isNotNull: "is not null"
        case .isTrue: "is true"
        case .isFalse: "is false"
        }
    }

    public var requiresValue: Bool {
        switch self {
        case .isNull, .isNotNull, .isTrue, .isFalse: false
        default: true
        }
    }
}

public struct Filter: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var column: String
    public var op: FilterOperator
    public var value: String
    public var isEnabled: Bool

    public init(id: UUID = UUID(), column: String, op: FilterOperator = .equals, value: String = "", isEnabled: Bool = true) {
        self.id = id
        self.column = column
        self.op = op
        self.value = value
        self.isEnabled = isEnabled
    }

    /// SQL predicate for this filter. Text comparisons cast the column to text so that
    /// any column type can be searched.
    public var predicate: String {
        let column = SQLIdentifier.quote(self.column)
        switch op {
        case .isNull: return "\(column) IS NULL"
        case .isNotNull: return "\(column) IS NOT NULL"
        case .isTrue: return "\(column) IS TRUE"
        case .isFalse: return "\(column) IS FALSE"
        case .equals, .notEquals, .lessThan, .lessOrEqual, .greaterThan, .greaterOrEqual:
            return "\(column) \(op.rawValue) \(SQLLiteral.quote(value))"
        case .like, .notLike, .iLike:
            return "\(column)::text \(op.rawValue) \(SQLLiteral.quote(value))"
        case .contains:
            return "\(column)::text ILIKE \(SQLLiteral.quote("%" + Filter.escapeLike(value) + "%"))"
        case .startsWith:
            return "\(column)::text ILIKE \(SQLLiteral.quote(Filter.escapeLike(value) + "%"))"
        case .endsWith:
            return "\(column)::text ILIKE \(SQLLiteral.quote("%" + Filter.escapeLike(value)))"
        case .isIn, .isNotIn:
            let items = value.split(separator: ",").map { SQLLiteral.quote($0.trimmingCharacters(in: .whitespaces)) }
            let list = items.isEmpty ? "NULL" : items.joined(separator: ", ")
            return "\(column) \(op.rawValue) (\(list))"
        }
    }

    static func escapeLike(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }
}

public struct SortDescriptor: Codable, Hashable, Sendable {
    public var column: String
    public var ascending: Bool

    public init(column: String, ascending: Bool = true) {
        self.column = column
        self.ascending = ascending
    }

    public var sql: String {
        "\(SQLIdentifier.quote(column)) \(ascending ? "ASC" : "DESC")"
    }
}

/// Describes what a table tab displays. Rendered to SQL by `sql()`.
public struct TableQuery: Codable, Hashable, Sendable {
    public var table: TableRef
    public var filters: [Filter]
    public var rawWhere: String
    public var sort: [SortDescriptor]
    public var page: Int
    public var pageSize: Int

    public static let pageSizes = [50, 100, 200, 500, 1_000]

    public init(
        table: TableRef,
        filters: [Filter] = [],
        rawWhere: String = "",
        sort: [SortDescriptor] = [],
        page: Int = 0,
        pageSize: Int = 200
    ) {
        self.table = table
        self.filters = filters
        self.rawWhere = rawWhere
        self.sort = sort
        self.page = max(0, page)
        self.pageSize = max(1, pageSize)
    }

    public var offset: Int { page * pageSize }

    /// The WHERE clause body (without the keyword), or nil when unfiltered.
    public var whereClause: String? {
        var predicates = filters.filter { $0.isEnabled && ($0.op.requiresValue ? !$0.value.isEmpty : true) }.map(\.predicate)
        let raw = rawWhere.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.isEmpty { predicates.append("(\(raw))") }
        return predicates.isEmpty ? nil : predicates.joined(separator: " AND ")
    }

    public var hasActiveFilters: Bool { whereClause != nil }

    /// Query for the current page. Rows are ordered by the primary key when no sort is set so
    /// paging is stable.
    public func sql(defaultOrder: [String]) -> String {
        var sql = "SELECT * FROM \(table.quoted)"
        if let whereClause { sql += "\nWHERE \(whereClause)" }
        let order = sort.isEmpty ? defaultOrder.map { SQLIdentifier.quote($0) + " ASC" } : sort.map(\.sql)
        if !order.isEmpty { sql += "\nORDER BY \(order.joined(separator: ", "))" }
        sql += "\nLIMIT \(pageSize) OFFSET \(offset)"
        return sql
    }

    public var countSQL: String {
        var sql = "SELECT count(*) FROM \(table.quoted)"
        if let whereClause { sql += " WHERE \(whereClause)" }
        return sql
    }

    public mutating func toggleSort(column: String) {
        if let existing = sort.first, existing.column == column {
            sort = existing.ascending ? [SortDescriptor(column: column, ascending: false)] : []
        } else {
            sort = [SortDescriptor(column: column, ascending: true)]
        }
        page = 0
    }
}
