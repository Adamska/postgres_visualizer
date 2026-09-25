import Foundation

/// RFC 4180 style CSV reading and writing with configurable delimiter.
public struct CSVOptions: Hashable, Sendable {
    public var delimiter: Character
    public var hasHeader: Bool
    public var nullRepresentation: String

    public init(delimiter: Character = ",", hasHeader: Bool = true, nullRepresentation: String = "") {
        self.delimiter = delimiter
        self.hasHeader = hasHeader
        self.nullRepresentation = nullRepresentation
    }
}

public enum CSVWriter {
    public static func encode(columns: [String], rows: [[CellValue]], options: CSVOptions = CSVOptions()) -> String {
        var lines: [String] = []
        if options.hasHeader {
            lines.append(columns.map { field($0, delimiter: options.delimiter) }.joined(separator: String(options.delimiter)))
        }
        for row in rows {
            let fields = row.map { value -> String in
                guard let text = value.exportString else { return options.nullRepresentation }
                return field(text, delimiter: options.delimiter)
            }
            lines.append(fields.joined(separator: String(options.delimiter)))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    static func field(_ text: String, delimiter: Character) -> String {
        let hasLineBreak = text.unicodeScalars.contains { $0 == "\n" || $0 == "\r" }
        let needsQuotes = text.contains(delimiter) || text.contains("\"") || hasLineBreak
        guard needsQuotes else { return text }
        return "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}

public struct CSVDocument: Hashable, Sendable {
    public var header: [String]
    public var rows: [[String]]

    public init(header: [String], rows: [[String]]) {
        self.header = header
        self.rows = rows
    }
}

public enum CSVReader {
    /// Parses the document. When `hasHeader` is false, columns are named `column1…columnN`.
    public static func parse(_ text: String, options: CSVOptions = CSVOptions()) -> CSVDocument {
        var records = parseRecords(text, delimiter: options.delimiter)
        records.removeAll { $0 == [""] }
        guard !records.isEmpty else { return CSVDocument(header: [], rows: []) }
        if options.hasHeader {
            let header = records.removeFirst()
            return CSVDocument(header: header, rows: records)
        }
        let width = records.map(\.count).max() ?? 0
        let header = (1...max(1, width)).map { "column\($0)" }
        return CSVDocument(header: header, rows: records)
    }

    /// Guesses the delimiter from the first line, preferring the most frequent candidate.
    public static func detectDelimiter(in text: String) -> Character {
        let firstLine = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
        let candidates: [Character] = [",", ";", "\t", "|"]
        let counts = candidates.map { delimiter in (delimiter, firstLine.filter { $0 == delimiter }.count) }
        return counts.max { $0.1 < $1.1 }.flatMap { $0.1 > 0 ? $0.0 : nil } ?? ","
    }

    static func parseRecords(_ text: String, delimiter: Character) -> [[String]] {
        var records: [[String]] = []
        var record: [String] = []
        var field = ""
        var inQuotes = false
        var iterator = text.makeIterator()
        var pending: Character? = iterator.next()

        func advance() { pending = iterator.next() }

        while let character = pending {
            if inQuotes {
                if character == "\"" {
                    advance()
                    if pending == "\"" {
                        field.append("\"")
                        advance()
                    } else {
                        inQuotes = false
                    }
                } else {
                    field.append(character)
                    advance()
                }
                continue
            }
            switch character {
            case "\"" where field.isEmpty:
                inQuotes = true
                advance()
            case delimiter:
                record.append(field)
                field = ""
                advance()
            case "\r", "\r\n", "\n":
                advance()
                record.append(field)
                records.append(record)
                record = []
                field = ""
            default:
                field.append(character)
                advance()
            }
        }
        if !field.isEmpty || !record.isEmpty {
            record.append(field)
            records.append(record)
        }
        return records
    }
}
