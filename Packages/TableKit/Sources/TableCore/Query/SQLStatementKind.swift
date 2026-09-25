/// Coarse classification of a statement based on its leading keyword.
public enum SQLStatementKind: Sendable, Hashable {
    case select
    case insert
    case update
    case delete
    case merge
    case explain
    case transactionBegin
    case transactionCommit
    case transactionRollback
    case other(String)

    /// Statements that produce a result set (or may, in the case of RETURNING).
    public var mayReturnRows: Bool {
        switch self {
        case .select, .explain, .insert, .update, .delete, .merge: true
        case .other(let keyword): ["show", "table", "values", "with", "fetch", "call"].contains(keyword)
        default: false
        }
    }

    /// Statements whose command tag carries an affected row count.
    public var isDataModification: Bool {
        switch self {
        case .insert, .update, .delete, .merge: true
        default: false
        }
    }

    public static func classify(_ sql: String) -> SQLStatementKind {
        let keywords = SQLStatementKind.leadingKeywords(of: sql, limit: 2)
        guard let first = keywords.first else { return .other("") }
        switch first {
        case "select", "with", "table", "values": return .select
        case "insert": return .insert
        case "update": return .update
        case "delete": return .delete
        case "merge": return .merge
        case "explain": return .explain
        case "begin", "start": return .transactionBegin
        case "commit", "end": return .transactionCommit
        case "rollback", "abort": return .transactionRollback
        default: return .other(first)
        }
    }

    /// Lowercased leading keywords of a statement, skipping comments and parentheses.
    static func leadingKeywords(of sql: String, limit: Int) -> [String] {
        var words: [String] = []
        for token in SQLTokenizer.tokenize(sql) {
            guard token.kind != .whitespace, token.kind != .comment else { continue }
            if token.kind == .punctuation, token.text == "(" { continue }
            guard token.kind == .keyword || token.kind == .identifier else { break }
            words.append(token.text.lowercased())
            if words.count == limit { break }
        }
        return words
    }
}
