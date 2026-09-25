public struct ColumnInfo: Hashable, Codable, Sendable, Identifiable {
    public var name: String
    public var ordinal: Int
    public var typeName: String
    public var typeOID: UInt32
    public var kind: ValueKind
    public var isNullable: Bool
    public var defaultValue: String?
    public var isPrimaryKey: Bool
    public var isIdentity: Bool
    public var isGenerated: Bool
    public var comment: String?

    public var id: String { name }

    public init(
        name: String,
        ordinal: Int,
        typeName: String,
        typeOID: UInt32 = 0,
        kind: ValueKind = .other,
        isNullable: Bool = true,
        defaultValue: String? = nil,
        isPrimaryKey: Bool = false,
        isIdentity: Bool = false,
        isGenerated: Bool = false,
        comment: String? = nil
    ) {
        self.name = name
        self.ordinal = ordinal
        self.typeName = typeName
        self.typeOID = typeOID
        self.kind = kind
        self.isNullable = isNullable
        self.defaultValue = defaultValue
        self.isPrimaryKey = isPrimaryKey
        self.isIdentity = isIdentity
        self.isGenerated = isGenerated
        self.comment = comment
    }

    /// Generated columns cannot be written; identity/default columns can be left to the server.
    public var isWritable: Bool { !isGenerated }
    public var hasServerDefault: Bool { defaultValue != nil || isIdentity }
}

public struct IndexInfo: Hashable, Codable, Sendable, Identifiable {
    public var name: String
    public var definition: String
    public var isUnique: Bool
    public var isPrimary: Bool
    public var columns: [String]

    public var id: String { name }

    public init(name: String, definition: String, isUnique: Bool, isPrimary: Bool, columns: [String]) {
        self.name = name
        self.definition = definition
        self.isUnique = isUnique
        self.isPrimary = isPrimary
        self.columns = columns
    }
}

public enum ConstraintKind: String, Codable, Sendable {
    case primaryKey
    case foreignKey
    case unique
    case check
    case exclusion
    case other

    public init(contype: String) {
        switch contype {
        case "p": self = .primaryKey
        case "f": self = .foreignKey
        case "u": self = .unique
        case "c": self = .check
        case "x": self = .exclusion
        default: self = .other
        }
    }

    public var title: String {
        switch self {
        case .primaryKey: "Primary key"
        case .foreignKey: "Foreign key"
        case .unique: "Unique"
        case .check: "Check"
        case .exclusion: "Exclusion"
        case .other: "Constraint"
        }
    }
}

public struct ConstraintInfo: Hashable, Codable, Sendable, Identifiable {
    public var name: String
    public var kind: ConstraintKind
    public var definition: String
    public var columns: [String]

    public var id: String { name }

    public init(name: String, kind: ConstraintKind, definition: String, columns: [String]) {
        self.name = name
        self.kind = kind
        self.definition = definition
        self.columns = columns
    }
}

public struct ForeignKeyInfo: Hashable, Codable, Sendable, Identifiable {
    public var name: String
    public var columns: [String]
    public var referencedTable: TableRef
    public var referencedColumns: [String]

    public var id: String { name }

    public init(name: String, columns: [String], referencedTable: TableRef, referencedColumns: [String]) {
        self.name = name
        self.columns = columns
        self.referencedTable = referencedTable
        self.referencedColumns = referencedColumns
    }

    /// The foreign key that covers a given column, if it is a single-column key.
    public func covers(column: String) -> Bool { columns == [column] }
}

/// Everything the UI needs to know about a relation to display and edit it.
public struct TableStructure: Hashable, Codable, Sendable {
    public var ref: TableRef
    public var kind: RelationKind
    public var columns: [ColumnInfo]
    public var indexes: [IndexInfo]
    public var constraints: [ConstraintInfo]
    public var foreignKeys: [ForeignKeyInfo]
    public var comment: String?

    public init(
        ref: TableRef,
        kind: RelationKind = .table,
        columns: [ColumnInfo],
        indexes: [IndexInfo] = [],
        constraints: [ConstraintInfo] = [],
        foreignKeys: [ForeignKeyInfo] = [],
        comment: String? = nil
    ) {
        self.ref = ref
        self.kind = kind
        self.columns = columns
        self.indexes = indexes
        self.constraints = constraints
        self.foreignKeys = foreignKeys
        self.comment = comment
    }

    public var primaryKeyColumns: [String] {
        columns.filter(\.isPrimaryKey).map(\.name)
    }

    /// Rows can only be updated or deleted safely when they can be identified by a primary key.
    public var isEditable: Bool {
        kind.isEditable && !primaryKeyColumns.isEmpty
    }

    public func column(named name: String) -> ColumnInfo? {
        columns.first { $0.name == name }
    }

    public func foreignKey(for column: String) -> ForeignKeyInfo? {
        foreignKeys.first { $0.covers(column: column) }
    }
}
