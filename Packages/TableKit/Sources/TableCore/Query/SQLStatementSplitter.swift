/// One statement extracted from a script, with its location in the original text.
public struct SQLStatement: Hashable, Sendable {
    public var text: String
    /// Range of the statement in the source script (excluding the terminating semicolon).
    public var range: Range<String.Index>

    public init(text: String, range: Range<String.Index>) {
        self.text = text
        self.range = range
    }
}

/// Splits SQL scripts on semicolons while respecting strings, quoted identifiers,
/// dollar-quoted blocks and comments.
public enum SQLStatementSplitter {
    public static func split(_ script: String) -> [SQLStatement] {
        var statements: [SQLStatement] = []
        var statementStart: String.Index?

        for token in SQLTokenizer.tokenize(script) {
            let isTerminator = token.kind == .punctuation && token.text == ";"
            if isTerminator {
                if let start = statementStart {
                    append(from: start, to: token.range.lowerBound, in: script, into: &statements)
                }
                statementStart = nil
                continue
            }
            if statementStart == nil, token.kind != .whitespace, token.kind != .comment {
                statementStart = token.range.lowerBound
            }
        }
        if let start = statementStart {
            append(from: start, to: script.endIndex, in: script, into: &statements)
        }
        return statements
    }

    /// The statement that contains the given cursor position. Between statements, the
    /// preceding one wins unless it is separated from the cursor by a blank line.
    public static func statement(at cursor: String.Index, in script: String) -> SQLStatement? {
        let statements = split(script)
        if let containing = statements.first(where: { $0.range.lowerBound <= cursor && cursor <= $0.range.upperBound }) {
            return containing
        }
        if let previous = statements.last(where: { $0.range.upperBound < cursor }) {
            let gap = script[previous.range.upperBound..<cursor]
            let newlines = gap.filter { $0 == "\n" }.count
            if newlines <= 1 { return previous }
        }
        return statements.first { $0.range.lowerBound > cursor } ?? statements.last
    }

    private static func append(
        from start: String.Index,
        to end: String.Index,
        in script: String,
        into statements: inout [SQLStatement]
    ) {
        var trimmedEnd = end
        while trimmedEnd > start, script[script.index(before: trimmedEnd)].isWhitespace {
            trimmedEnd = script.index(before: trimmedEnd)
        }
        guard trimmedEnd > start else { return }
        let text = String(script[start..<trimmedEnd])
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        statements.append(SQLStatement(text: text, range: start..<trimmedEnd))
    }
}
