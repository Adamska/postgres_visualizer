/// Quoting helpers that make generated SQL safe regardless of identifier or value content.
public enum SQLIdentifier {
    /// Always double-quotes, doubling embedded quotes. Simple and unambiguous.
    public static func quote(_ identifier: String) -> String {
        "\"" + identifier.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    /// Quotes only when needed, for display in generated SQL that users read.
    public static func quoteIfNeeded(_ identifier: String) -> String {
        let isSimple = !identifier.isEmpty
            && identifier.allSatisfy { $0.isLowercase || $0.isNumber || $0 == "_" }
            && !(identifier.first?.isNumber ?? true)
            && !SQLKeywords.isKeyword(identifier)
        return isSimple ? identifier : quote(identifier)
    }
}

public enum SQLLiteral {
    /// Renders a value as a SQL literal. Text uses standard single-quote doubling, which is
    /// safe because the driver always runs with `standard_conforming_strings = on`.
    public static func render(_ value: CellValue) -> String {
        switch value {
        case .null: "NULL"
        case .text(let string): quote(string)
        case .binary(let data): quote("\\x" + data.map { String(format: "%02x", $0) }.joined()) + "::bytea"
        }
    }

    public static func render(_ value: EditValue) -> String {
        switch value {
        case .null: "NULL"
        case .serverDefault: "DEFAULT"
        case .text(let string): quote(string)
        }
    }

    /// Quotes text. Backslashes are left alone because `standard_conforming_strings` is on.
    public static func quote(_ string: String) -> String {
        "'" + string.replacingOccurrences(of: "'", with: "''") + "'"
    }
}
