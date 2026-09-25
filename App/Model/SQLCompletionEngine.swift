import Foundation
import TableCore

/// Pure completion logic: given what is known about the schema and the query text, proposes
/// identifiers and keywords for the word under the caret.
struct SQLCompletionEngine {
    var schemas: [String]
    var relations: [RelationInfo]
    var functions: [FunctionInfo]
    /// Columns of the tables whose structure has been loaded.
    var columns: [TableRef: [ColumnInfo]]

    init(schemas: [String] = [], relations: [RelationInfo] = [], functions: [FunctionInfo] = [], columns: [TableRef: [ColumnInfo]] = [:]) {
        self.schemas = schemas
        self.relations = relations
        self.functions = functions
        self.columns = columns
    }

    static let maximumResults = 60

    /// Tables referenced by the SQL text along with their aliases (`FROM users u` → u: users).
    /// Handles schema qualification, quoted names, `AS`, and comma-separated lists.
    static func referencedTables(in sql: String, relations: [RelationInfo]) -> [(alias: String?, table: TableRef)] {
        let tokens = SQLTokenizer.tokenize(sql).filter { $0.kind != .whitespace && $0.kind != .comment }
        var references: [(alias: String?, table: TableRef)] = []
        var index = 0
        while index < tokens.count {
            let token = tokens[index]
            guard token.kind == .keyword, ["from", "join", "update", "into"].contains(token.text.lowercased()) else {
                index += 1
                continue
            }
            var cursor = index + 1
            while let reference = parseTableReference(tokens, at: &cursor, relations: relations) {
                references.append(reference)
                guard cursor < tokens.count, tokens[cursor].kind == .punctuation, tokens[cursor].text == "," else { break }
                cursor += 1
            }
            index = max(cursor, index + 1)
        }
        return references
    }

    /// Parses `[ONLY] [schema.]name [AS] [alias]` starting at `cursor`, advancing past it.
    private static func parseTableReference(
        _ tokens: [SQLToken],
        at cursor: inout Int,
        relations: [RelationInfo]
    ) -> (alias: String?, table: TableRef)? {
        if cursor < tokens.count, tokens[cursor].kind == .keyword, ["only", "lateral"].contains(tokens[cursor].text.lowercased()) {
            cursor += 1
        }
        guard cursor < tokens.count, let name = identifierName(tokens[cursor]) else { return nil }
        var table = TableRef(schema: "public", name: name)
        cursor += 1
        if cursor + 1 < tokens.count, tokens[cursor].text == ".", let second = identifierName(tokens[cursor + 1]) {
            table = TableRef(schema: name, name: second)
            cursor += 2
        }
        if let known = relations.first(where: { $0.ref.name == table.name && (table.schema == "public" || $0.ref.schema == table.schema) }) {
            table = known.ref
        }
        var alias: String?
        if cursor < tokens.count, tokens[cursor].kind == .keyword, tokens[cursor].text.lowercased() == "as" { cursor += 1 }
        if cursor < tokens.count, tokens[cursor].kind == .identifier {
            alias = tokens[cursor].text
            cursor += 1
        }
        return (alias, table)
    }

    /// Completions for `prefix`, optionally qualified (`schema.` or `table.`/`alias.`).
    func completions(prefix: String, qualifier: String?, sql: String) -> [SQLCompletion] {
        let references = Self.referencedTables(in: sql, relations: relations)
        var candidates: [SQLCompletion] = []

        if let qualifier {
            let lowered = qualifier.lowercased()
            if let reference = references.first(where: { $0.alias?.lowercased() == lowered || $0.table.name.lowercased() == lowered }) {
                candidates += columnCompletions(of: reference.table)
            } else if let relation = relations.first(where: { $0.ref.name.lowercased() == lowered }) {
                candidates += columnCompletions(of: relation.ref)
            }
            if schemas.contains(where: { $0.lowercased() == lowered }) {
                candidates += relations.filter { $0.ref.schema.lowercased() == lowered }.map(relationCompletion)
                candidates += functions.filter { $0.schema.lowercased() == lowered }.map(functionCompletion)
            }
        } else {
            for reference in references { candidates += columnCompletions(of: reference.table) }
            candidates += relations.map(relationCompletion)
            candidates += schemas.map { SQLCompletion(text: $0, kind: .schema) }
            candidates += functions.filter { $0.schema == "public" }.map(functionCompletion)
            candidates += SQLKeywords.all.sorted().map { SQLCompletion(text: $0.uppercased(), kind: .keyword) }
        }

        return Self.rank(candidates, prefix: prefix)
    }

    /// Filters by prefix (case-insensitive) and ranks prefix matches before substring matches.
    static func rank(_ candidates: [SQLCompletion], prefix: String) -> [SQLCompletion] {
        let lowered = prefix.lowercased()
        var seen: Set<String> = []
        var scored: [(SQLCompletion, Int)] = []
        for candidate in candidates {
            let text = candidate.text.lowercased()
            let quality: Int
            if lowered.isEmpty || text.hasPrefix(lowered) {
                quality = text == lowered && !lowered.isEmpty ? -1 : 0
            } else if text.contains(lowered) {
                quality = 1
            } else {
                continue
            }
            // Schema objects outrank keywords of the same match quality.
            let score = quality * 2 + (candidate.kind == .keyword ? 1 : 0)
            let key = "\(candidate.kind)\(text)\(candidate.detail ?? "")"
            guard seen.insert(key).inserted else { continue }
            scored.append((candidate, score))
        }
        return scored
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 < rhs.1 }
                return lhs.0.text.lowercased() < rhs.0.text.lowercased()
            }
            .prefix(maximumResults)
            .map(\.0)
    }

    private func columnCompletions(of table: TableRef) -> [SQLCompletion] {
        (columns[table] ?? []).map { SQLCompletion(text: $0.name, kind: .column, detail: "\($0.typeName) · \(table.name)") }
    }

    private func relationCompletion(_ relation: RelationInfo) -> SQLCompletion {
        SQLCompletion(
            text: relation.ref.schema == "public" ? relation.ref.name : "\(relation.ref.schema).\(relation.ref.name)",
            kind: relation.kind == .table || relation.kind == .partitionedTable || relation.kind == .foreignTable ? .table : .view,
            detail: relation.kind.title
        )
    }

    private func functionCompletion(_ function: FunctionInfo) -> SQLCompletion {
        SQLCompletion(text: function.name + "()", kind: .function, detail: function.returnType)
    }

    private static func identifierName(_ token: SQLToken) -> String? {
        switch token.kind {
        case .identifier: token.text
        case .quotedIdentifier: String(token.text.dropFirst().dropLast()).replacingOccurrences(of: "\"\"", with: "\"")
        default: nil
        }
    }
}
