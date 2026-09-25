/// Coarse classification of a column type, used for alignment, formatting and editing affordances.
public enum ValueKind: String, Codable, Sendable, CaseIterable {
    case boolean
    case integer
    case decimal
    case text
    case uuid
    case date
    case time
    case timestamp
    case interval
    case json
    case binary
    case array
    case enumeration
    case network
    case geometric
    case bitString
    case range
    case composite
    case other

    public var isNumeric: Bool { self == .integer || self == .decimal }

    /// Whether values are displayed right-aligned in the grid.
    public var isRightAligned: Bool { isNumeric }

    /// Whether the value editor should offer a multi-line text area.
    public var prefersMultilineEditor: Bool {
        switch self {
        case .json, .text, .array, .composite: true
        default: false
        }
    }

    /// Derives the kind from a Postgres `pg_type` row.
    public static func from(typeName: String, category: Character, isArray: Bool) -> ValueKind {
        if isArray { return .array }
        switch typeName {
        case "bool": return .boolean
        case "int2", "int4", "int8", "oid", "xid", "cid", "xid8", "regproc", "regclass", "regtype", "regnamespace", "regrole": return .integer
        case "float4", "float8", "numeric", "money": return .decimal
        case "uuid": return .uuid
        case "date": return .date
        case "time", "timetz": return .time
        case "timestamp", "timestamptz": return .timestamp
        case "interval": return .interval
        case "json", "jsonb": return .json
        case "bytea": return .binary
        case "inet", "cidr", "macaddr", "macaddr8": return .network
        case "bit", "varbit": return .bitString
        default: break
        }
        switch category {
        case "B": return .boolean
        case "N": return .decimal
        case "S": return .text
        case "D": return .timestamp
        case "T": return .interval
        case "E": return .enumeration
        case "G": return .geometric
        case "I": return .network
        case "V": return .bitString
        case "R": return .range
        case "C": return .composite
        case "A": return .array
        default: return .other
        }
    }
}
