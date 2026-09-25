/// A schema-qualified relation name.
public struct TableRef: Hashable, Codable, Sendable, CustomStringConvertible {
    public var schema: String
    public var name: String

    public init(schema: String, name: String) {
        self.schema = schema
        self.name = name
    }

    /// Fully quoted identifier, safe to interpolate into SQL.
    public var quoted: String {
        "\(SQLIdentifier.quote(schema)).\(SQLIdentifier.quote(name))"
    }

    /// Display form, omitting the `public` schema.
    public var description: String {
        schema == "public" ? name : "\(schema).\(name)"
    }
}

public enum RelationKind: String, Codable, Sendable, CaseIterable {
    case table
    case view
    case materializedView
    case foreignTable
    case partitionedTable

    public var title: String {
        switch self {
        case .table: "Table"
        case .view: "View"
        case .materializedView: "Materialized view"
        case .foreignTable: "Foreign table"
        case .partitionedTable: "Partitioned table"
        }
    }

    /// Whether rows can be modified through the standard INSERT/UPDATE/DELETE path.
    public var isEditable: Bool {
        switch self {
        case .table, .partitionedTable, .foreignTable: true
        case .view, .materializedView: false
        }
    }

    /// Maps the `relkind` column of `pg_class`.
    public init?(relkind: String) {
        switch relkind {
        case "r": self = .table
        case "v": self = .view
        case "m": self = .materializedView
        case "f": self = .foreignTable
        case "p": self = .partitionedTable
        default: return nil
        }
    }
}

public struct SchemaInfo: Hashable, Codable, Sendable, Identifiable {
    public var name: String
    public var owner: String

    public var id: String { name }

    public init(name: String, owner: String) {
        self.name = name
        self.owner = owner
    }

    /// Schemas that belong to the server and are rarely browsed.
    public var isSystem: Bool {
        name == "pg_catalog" || name == "information_schema" || name.hasPrefix("pg_toast") || name.hasPrefix("pg_temp")
    }
}

public struct RelationInfo: Hashable, Codable, Sendable, Identifiable {
    public var ref: TableRef
    public var kind: RelationKind
    public var estimatedRowCount: Int?
    public var comment: String?

    public var id: TableRef { ref }

    public init(ref: TableRef, kind: RelationKind, estimatedRowCount: Int? = nil, comment: String? = nil) {
        self.ref = ref
        self.kind = kind
        self.estimatedRowCount = estimatedRowCount
        self.comment = comment
    }
}

public struct FunctionInfo: Hashable, Codable, Sendable, Identifiable {
    public var schema: String
    public var name: String
    public var arguments: String
    public var returnType: String
    public var language: String
    public var isProcedure: Bool

    public var id: String { "\(schema).\(name)(\(arguments))" }

    public init(schema: String, name: String, arguments: String, returnType: String, language: String, isProcedure: Bool) {
        self.schema = schema
        self.name = name
        self.arguments = arguments
        self.returnType = returnType
        self.language = language
        self.isProcedure = isProcedure
    }

    public var signature: String { "\(name)(\(arguments))" }
}
