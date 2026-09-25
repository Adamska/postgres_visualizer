import Foundation

/// The identifier under the caret, split into the identifier before a dot (`qualifier`) and the
/// partial word ending at the caret (`prefix`).
struct SQLWordContext: Hashable, Sendable {
    var prefix: String
    var qualifier: String?
    /// UTF-16 range of `prefix` in the document. It always ends at the caret.
    var range: NSRange
}

/// A single replacement produced by an editing command, plus the selection to apply afterwards.
struct SQLTextEdit: Hashable, Sendable {
    var range: NSRange
    var replacement: String
    var selection: NSRange
}

/// Pure text transformations behind the editor's keyboard commands. Everything is expressed in
/// UTF-16 offsets so the results can be applied directly to an `NSTextView`.
enum SQLEditing {
    static let indentUnit = "    "
    static let commentMarker = "--"

    private static let newline = unichar(0x0A)
    private static let carriageReturn = unichar(0x0D)
    private static let space = unichar(0x20)
    private static let tab = unichar(0x09)
    private static let dot = unichar(0x2E)
    private static let doubleQuote = unichar(0x22)

    // MARK: - Completion context

    /// ASCII letters, digits, underscore and any non-ASCII unit, matching `SQLTokenizer`'s identifiers.
    static func isIdentifierCharacter(_ unit: unichar) -> Bool {
        (unit >= 0x41 && unit <= 0x5A) || (unit >= 0x61 && unit <= 0x7A) || (unit >= 0x30 && unit <= 0x39)
            || unit == 0x5F || unit >= 0x80
    }

    /// The word ending at `caret` and, when it is preceded by a dot, the identifier before that dot.
    /// `select u.na|` gives prefix "na" and qualifier "u"; `"My Schema".t|` gives qualifier "My Schema".
    static func wordContext(in text: String, caret: Int) -> SQLWordContext {
        let string = text as NSString
        let caret = max(0, min(caret, string.length))
        var start = caret
        while start > 0, isIdentifierCharacter(string.character(at: start - 1)) {
            start -= 1
        }
        let range = NSRange(location: start, length: caret - start)
        var qualifier: String?
        if start > 0, string.character(at: start - 1) == dot {
            qualifier = identifier(endingAt: start - 1, in: string)
        }
        return SQLWordContext(prefix: string.substring(with: range), qualifier: qualifier, range: range)
    }

    /// The plain or double-quoted identifier that ends right before `end`, or nil when there is none.
    private static func identifier(endingAt end: Int, in string: NSString) -> String? {
        guard end > 0 else { return nil }
        if string.character(at: end - 1) == doubleQuote {
            var start = end - 1
            while start > 0, string.character(at: start - 1) != doubleQuote {
                start -= 1
            }
            guard start > 0, end - 1 > start else { return nil }
            return string.substring(with: NSRange(location: start, length: end - 1 - start))
        }
        var start = end
        while start > 0, isIdentifierCharacter(string.character(at: start - 1)) {
            start -= 1
        }
        guard start < end else { return nil }
        return string.substring(with: NSRange(location: start, length: end - start))
    }

    /// Returns `completion` in the case the user is typing: upper case when `prefix` starts with an
    /// upper-case letter, lower case when it starts with a lower-case letter, unchanged otherwise.
    static func matchingCase(of prefix: String, in completion: String) -> String {
        guard let first = prefix.first else { return completion }
        if first.isUppercase { return completion.uppercased() }
        if first.isLowercase { return completion.lowercased() }
        return completion
    }

    // MARK: - Newline and auto-pairing

    /// Text to insert for Return: a newline followed by the indentation of the caret's line.
    static func newlineInsertion(in text: String, caret: Int) -> String {
        let string = text as NSString
        let caret = max(0, min(caret, string.length))
        let lineRange = string.lineRange(for: NSRange(location: caret, length: 0))
        var end = lineRange.location
        while end < caret, string.character(at: end) == space || string.character(at: end) == tab {
            end += 1
        }
        return "\n" + string.substring(with: NSRange(location: lineRange.location, length: end - lineRange.location))
    }

    /// True when typing `(` should insert `()`: the selection is empty and the caret is followed by
    /// nothing, whitespace or a closing delimiter.
    static func shouldAutoPairParenthesis(in text: String, selection: NSRange) -> Bool {
        guard selection.length == 0 else { return false }
        let string = text as NSString
        guard selection.location < string.length else { return true }
        switch string.character(at: selection.location) {
        case space, tab, newline, carriageReturn, unichar(0x29), unichar(0x2C), unichar(0x3B):
            return true
        default:
            return false
        }
    }

    // MARK: - Line commands

    /// Indents every non-blank line touched by `selection` by one `indentUnit`.
    static func indent(_ text: String, selection: NSRange) -> SQLTextEdit {
        transformLines(of: text, selection: selection) { lines in
            lines.map { line in
                isBlank(line) && lines.count > 1 ? (line, 0) : (indentUnit + line, 0)
            }
        }
    }

    /// Removes up to one `indentUnit` (or a leading tab) from every line touched by `selection`.
    static func outdent(_ text: String, selection: NSRange) -> SQLTextEdit {
        transformLines(of: text, selection: selection) { lines in
            lines.map { line in
                if line.hasPrefix("\t") { return (String(line.dropFirst()), 0) }
                let spaces = line.prefix(indentUnit.count).prefix { $0 == " " }.count
                return (String(line.dropFirst(spaces)), 0)
            }
        }
    }

    /// Comments the lines touched by `selection` with `-- `, or uncomments them when every
    /// non-blank line is already commented. Blank lines are left alone.
    static func toggleLineComment(_ text: String, selection: NSRange) -> SQLTextEdit {
        transformLines(of: text, selection: selection) { lines in
            let content = lines.filter { !isBlank($0) }
            let allCommented = !content.isEmpty && content.allSatisfy { isCommented($0) }
            if allCommented {
                return lines.map { uncomment($0) }
            }
            let column = content.map { leadingWhitespaceCount($0) }.min() ?? 0
            return lines.map { line in
                guard !isBlank(line) else { return (line, 0) }
                let index = line.index(line.startIndex, offsetBy: column)
                return (String(line[..<index]) + commentMarker + " " + String(line[index...]), column)
            }
        }
    }

    private static func isCommented(_ line: String) -> Bool {
        line.drop { $0 == " " || $0 == "\t" }.hasPrefix(commentMarker)
    }

    private static func uncomment(_ line: String) -> (String, Int) {
        guard isCommented(line) else { return (line, 0) }
        let column = leadingWhitespaceCount(line)
        var rest = line.dropFirst(column + commentMarker.count)
        if rest.first == " " { rest = rest.dropFirst() }
        return (String(line.prefix(column)) + rest, column)
    }

    private static func leadingWhitespaceCount(_ line: String) -> Int {
        line.prefix { $0 == " " || $0 == "\t" }.count
    }

    private static func isBlank(_ line: String) -> Bool {
        line.allSatisfy { $0 == " " || $0 == "\t" || $0 == "\r" }
    }

    /// Applies `transform` to the whole lines covered by `selection`. Each transformed line comes
    /// with the column at which it was edited, used to keep a collapsed caret in place when the
    /// edit happened after it.
    private static func transformLines(
        of text: String,
        selection: NSRange,
        transform: ([String]) -> [(line: String, column: Int)]
    ) -> SQLTextEdit {
        let string = text as NSString
        let selection = clamp(selection, to: string.length)
        var probe = selection
        // A selection that ends right after a newline should not pull in the following line.
        if probe.length > 0, string.character(at: probe.location + probe.length - 1) == newline {
            probe.length -= 1
        }
        let lineRange = string.lineRange(for: probe)
        let block = string.substring(with: lineRange)
        var lines = block.components(separatedBy: "\n")
        let endsWithNewline = block.hasSuffix("\n")
        if endsWithNewline { lines.removeLast() }

        let transformed = transform(lines)
        var replacement = transformed.map(\.line).joined(separator: "\n")
        if endsWithNewline { replacement += "\n" }

        guard selection.length == 0 else {
            let newSelection = NSRange(location: lineRange.location, length: (replacement as NSString).length)
            return SQLTextEdit(range: lineRange, replacement: replacement, selection: newSelection)
        }

        // Collapsed caret: shift it by the delta of its own line when the edit happened before it.
        var lineStart = lineRange.location
        var caret = selection.location
        for (original, edited) in zip(lines, transformed) {
            let originalLength = (original as NSString).length
            let lineEnd = lineStart + originalLength
            if caret >= lineStart, caret <= lineEnd {
                let column = caret - lineStart
                let delta = (edited.line as NSString).length - originalLength
                if delta > 0, column >= edited.column {
                    caret += delta
                } else if delta < 0, column > edited.column {
                    caret = lineStart + max(edited.column, column + delta)
                }
                break
            }
            lineStart = lineEnd + 1
        }
        return SQLTextEdit(range: lineRange, replacement: replacement, selection: NSRange(location: caret, length: 0))
    }

    // MARK: - Ranges

    /// Clamps `range` so it lies within a document of `length` UTF-16 units.
    static func clamp(_ range: NSRange, to length: Int) -> NSRange {
        let location = max(0, min(range.location, length))
        let end = max(location, min(range.location + range.length, length))
        return NSRange(location: location, length: end - location)
    }
}
