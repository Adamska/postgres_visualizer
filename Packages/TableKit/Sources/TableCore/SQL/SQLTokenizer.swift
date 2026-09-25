/// A lexical token of a SQL script.
public struct SQLToken: Hashable, Sendable {
    public enum Kind: Sendable {
        case keyword
        case identifier
        case quotedIdentifier
        case string
        case number
        case comment
        case whitespace
        case punctuation
        case op
        case parameter
    }

    public var kind: Kind
    public var text: String
    public var range: Range<String.Index>

    public init(kind: Kind, text: String, range: Range<String.Index>) {
        self.kind = kind
        self.text = text
        self.range = range
    }
}

/// Byte-oriented tokenizer for PostgreSQL SQL. It never fails: unknown input becomes `op` tokens.
public enum SQLTokenizer {
    public static func tokenize(_ sql: String) -> [SQLToken] {
        var tokens: [SQLToken] = []
        let utf8 = sql.utf8
        var index = utf8.startIndex

        func byte(at position: String.UTF8View.Index, offset: Int = 0) -> UInt8? {
            guard let shifted = utf8.index(position, offsetBy: offset, limitedBy: utf8.endIndex), shifted < utf8.endIndex else {
                return nil
            }
            return utf8[shifted]
        }

        func emit(_ kind: SQLToken.Kind, from start: String.UTF8View.Index, to end: String.UTF8View.Index) {
            let range = start..<end
            tokens.append(SQLToken(kind: kind, text: String(sql[range]), range: range))
        }

        while index < utf8.endIndex {
            let start = index
            let current = utf8[index]

            if isWhitespace(current) {
                while let next = byte(at: index), isWhitespace(next) { index = utf8.index(after: index) }
                emit(.whitespace, from: start, to: index)
            } else if current == UInt8(ascii: "-"), byte(at: index, offset: 1) == UInt8(ascii: "-") {
                while let next = byte(at: index), next != UInt8(ascii: "\n") { index = utf8.index(after: index) }
                emit(.comment, from: start, to: index)
            } else if current == UInt8(ascii: "/"), byte(at: index, offset: 1) == UInt8(ascii: "*") {
                index = utf8.index(index, offsetBy: 2)
                var depth = 1
                while depth > 0, let next = byte(at: index) {
                    if next == UInt8(ascii: "/"), byte(at: index, offset: 1) == UInt8(ascii: "*") {
                        depth += 1
                        index = utf8.index(index, offsetBy: 2)
                    } else if next == UInt8(ascii: "*"), byte(at: index, offset: 1) == UInt8(ascii: "/") {
                        depth -= 1
                        index = utf8.index(index, offsetBy: 2)
                    } else {
                        index = utf8.index(after: index)
                    }
                }
                emit(.comment, from: start, to: index)
            } else if current == UInt8(ascii: "'") {
                index = scanQuoted(utf8, from: index, quote: UInt8(ascii: "'"), allowsBackslash: false)
                emit(.string, from: start, to: index)
            } else if (current == UInt8(ascii: "E") || current == UInt8(ascii: "e")), byte(at: index, offset: 1) == UInt8(ascii: "'") {
                index = scanQuoted(utf8, from: utf8.index(after: index), quote: UInt8(ascii: "'"), allowsBackslash: true)
                emit(.string, from: start, to: index)
            } else if current == UInt8(ascii: "\"") {
                index = scanQuoted(utf8, from: index, quote: UInt8(ascii: "\""), allowsBackslash: false)
                emit(.quotedIdentifier, from: start, to: index)
            } else if current == UInt8(ascii: "$"), let end = scanDollarQuote(utf8, from: index) {
                index = end
                emit(.string, from: start, to: index)
            } else if current == UInt8(ascii: "$"), let next = byte(at: index, offset: 1), isDigit(next) {
                index = utf8.index(after: index)
                while let next = byte(at: index), isDigit(next) { index = utf8.index(after: index) }
                emit(.parameter, from: start, to: index)
            } else if isDigit(current) || startsDecimalFraction(current, next: byte(at: index, offset: 1)) {
                index = scanNumber(utf8, from: index)
                emit(.number, from: start, to: index)
            } else if isIdentifierStart(current) {
                while let next = byte(at: index), isIdentifierPart(next) { index = utf8.index(after: index) }
                let text = String(sql[start..<index])
                let kind: SQLToken.Kind = SQLKeywords.isKeyword(text) ? .keyword : .identifier
                tokens.append(SQLToken(kind: kind, text: text, range: start..<index))
            } else if isPunctuation(current) {
                index = utf8.index(after: index)
                emit(.punctuation, from: start, to: index)
            } else if isOperatorChar(current) {
                while let next = byte(at: index), isOperatorChar(next) { index = utf8.index(after: index) }
                emit(.op, from: start, to: index)
            } else {
                // Any other byte (including the start of a multi-byte scalar that is not an identifier).
                index = utf8.index(after: index)
                while let next = byte(at: index), next & 0xC0 == 0x80 { index = utf8.index(after: index) }
                emit(.op, from: start, to: index)
            }
        }
        return tokens
    }

    private static func scanQuoted(
        _ utf8: String.UTF8View,
        from start: String.UTF8View.Index,
        quote: UInt8,
        allowsBackslash: Bool
    ) -> String.UTF8View.Index {
        var index = utf8.index(after: start)
        while index < utf8.endIndex {
            let byte = utf8[index]
            if allowsBackslash, byte == UInt8(ascii: "\\") {
                index = utf8.index(index, offsetBy: 2, limitedBy: utf8.endIndex) ?? utf8.endIndex
                continue
            }
            if byte == quote {
                let after = utf8.index(after: index)
                if after < utf8.endIndex, utf8[after] == quote {
                    index = utf8.index(after: after)
                    continue
                }
                return after
            }
            index = utf8.index(after: index)
        }
        return utf8.endIndex
    }

    /// Scans `$tag$ ... $tag$`; returns nil when the input is not a dollar quote opener.
    private static func scanDollarQuote(_ utf8: String.UTF8View, from start: String.UTF8View.Index) -> String.UTF8View.Index? {
        var index = utf8.index(after: start)
        var tag: [UInt8] = []
        while index < utf8.endIndex, utf8[index] != UInt8(ascii: "$") {
            let byte = utf8[index]
            guard isIdentifierPart(byte), !(tag.isEmpty && isDigit(byte)) else { return nil }
            tag.append(byte)
            index = utf8.index(after: index)
        }
        guard index < utf8.endIndex else { return nil }
        index = utf8.index(after: index)
        let terminator = [UInt8(ascii: "$")] + tag + [UInt8(ascii: "$")]
        var window: [UInt8] = []
        while index < utf8.endIndex {
            window.append(utf8[index])
            if window.count > terminator.count { window.removeFirst() }
            index = utf8.index(after: index)
            if window == terminator { return index }
        }
        return utf8.endIndex
    }

    private static func scanNumber(_ utf8: String.UTF8View, from start: String.UTF8View.Index) -> String.UTF8View.Index {
        var index = start
        var seenExponent = false
        var seenDot = false
        while index < utf8.endIndex {
            let byte = utf8[index]
            if isDigit(byte) || byte == UInt8(ascii: "_") {
                index = utf8.index(after: index)
            } else if byte == UInt8(ascii: "."), !seenDot, !seenExponent {
                seenDot = true
                index = utf8.index(after: index)
            } else if (byte == UInt8(ascii: "e") || byte == UInt8(ascii: "E")), !seenExponent {
                seenExponent = true
                index = utf8.index(after: index)
                if index < utf8.endIndex, utf8[index] == UInt8(ascii: "+") || utf8[index] == UInt8(ascii: "-") {
                    index = utf8.index(after: index)
                }
            } else {
                break
            }
        }
        return index
    }

    private static func startsDecimalFraction(_ byte: UInt8, next: UInt8?) -> Bool {
        guard byte == UInt8(ascii: "."), let next else { return false }
        return isDigit(next)
    }

    private static func isWhitespace(_ byte: UInt8) -> Bool {
        byte == 0x20 || byte == 0x09 || byte == 0x0A || byte == 0x0D || byte == 0x0C
    }

    private static func isDigit(_ byte: UInt8) -> Bool { byte >= 0x30 && byte <= 0x39 }

    private static func isIdentifierStart(_ byte: UInt8) -> Bool {
        (byte >= 0x41 && byte <= 0x5A) || (byte >= 0x61 && byte <= 0x7A) || byte == UInt8(ascii: "_") || byte >= 0x80
    }

    private static func isIdentifierPart(_ byte: UInt8) -> Bool {
        isIdentifierStart(byte) || isDigit(byte) || byte == UInt8(ascii: "$")
    }

    private static func isPunctuation(_ byte: UInt8) -> Bool {
        switch byte {
        case UInt8(ascii: "("), UInt8(ascii: ")"), UInt8(ascii: ","), UInt8(ascii: ";"), UInt8(ascii: "["), UInt8(ascii: "]"), UInt8(ascii: "."):
            true
        default:
            false
        }
    }

    private static func isOperatorChar(_ byte: UInt8) -> Bool {
        switch byte {
        case UInt8(ascii: "+"), UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "/"), UInt8(ascii: "<"), UInt8(ascii: ">"),
             UInt8(ascii: "="), UInt8(ascii: "~"), UInt8(ascii: "!"), UInt8(ascii: "@"), UInt8(ascii: "#"), UInt8(ascii: "%"),
             UInt8(ascii: "^"), UInt8(ascii: "&"), UInt8(ascii: "|"), UInt8(ascii: "`"), UInt8(ascii: "?"), UInt8(ascii: ":"),
             UInt8(ascii: "$"):
            true
        default:
            false
        }
    }
}

/// PostgreSQL reserved and commonly used keywords, lowercased.
public enum SQLKeywords {
    public static let all: Set<String> = [
        "abort", "add", "all", "alter", "analyze", "and", "any", "array", "as", "asc", "begin", "between", "by",
        "cascade", "case", "cast", "check", "column", "commit", "conflict", "constraint", "create", "cross", "current_date",
        "current_time", "current_timestamp", "current_user", "database", "default", "deferrable", "delete", "desc",
        "distinct", "do", "drop", "else", "end", "except", "exclude", "exists", "explain", "false", "fetch", "filter",
        "first", "for", "foreign", "from", "full", "function", "grant", "group", "having", "if", "ilike", "in", "index",
        "inner", "insert", "intersect", "into", "is", "isnull", "join", "key", "last", "lateral", "left", "like", "limit",
        "materialized", "merge", "natural", "not", "notnull", "null", "nulls", "offset", "on", "only", "or", "order",
        "outer", "over", "overlaps", "partition", "primary", "procedure", "references", "refresh", "rename", "replace",
        "returning", "revoke", "right", "rollback", "row", "rows", "schema", "select", "sequence", "session_user",
        "set", "show", "similar", "some", "start", "symmetric", "table", "then", "to", "transaction", "trigger", "true",
        "truncate", "type", "union", "unique", "update", "using", "vacuum", "values", "view", "when", "where", "window",
        "with", "within", "without", "call", "declare", "cursor", "execute", "prepare", "listen", "notify", "lock",
        "savepoint", "release", "copy", "comment", "owner", "collate", "temporary", "temp", "unlogged", "recursive",
        "returns", "language", "immutable", "stable", "volatile", "security", "definer", "invoker", "each", "before",
        "after", "instead", "of", "trim", "leading", "trailing", "both", "extract", "interval", "zone", "localtime",
        "localtimestamp", "asymmetric", "authorization", "binary", "concurrently", "freeze", "verbose", "tablesample",
        "variadic", "grouping", "cube", "rollup", "sets", "ordinality", "unnest", "coalesce", "nullif", "greatest",
        "least", "position", "substring", "overlay", "xmlattributes", "int", "integer", "bigint", "smallint", "boolean",
        "text", "varchar", "char", "numeric", "decimal", "real", "float", "double", "precision", "date", "time",
        "timestamp", "timestamptz", "json", "jsonb", "uuid", "serial", "bigserial", "bytea", "inherits", "increment",
        "restart", "identity", "always", "generated", "stored", "virtual", "enum", "domain", "extension", "role",
        "user", "password", "login", "nologin", "superuser", "inherit", "valid", "validate", "no", "action", "restrict",
    ]

    public static func isKeyword(_ word: String) -> Bool {
        all.contains(word.lowercased())
    }
}
