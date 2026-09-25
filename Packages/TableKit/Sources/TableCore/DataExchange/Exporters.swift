import Foundation

public enum ExportFormat: String, CaseIterable, Sendable, Identifiable {
    case csv
    case json
    case sqlInsert

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .csv: "CSV"
        case .json: "JSON"
        case .sqlInsert: "SQL INSERT"
        }
    }

    public var fileExtension: String {
        switch self {
        case .csv: "csv"
        case .json: "json"
        case .sqlInsert: "sql"
        }
    }
}

/// Serialises result rows into the supported export formats.
public enum ResultExporter {
    public static func export(
        columns: [ResultColumn],
        rows: [[CellValue]],
        format: ExportFormat,
        table: TableRef? = nil
    ) -> String {
        switch format {
        case .csv:
            return CSVWriter.encode(columns: columns.map(\.name), rows: rows)
        case .json:
            return json(columns: columns, rows: rows)
        case .sqlInsert:
            return sqlInserts(columns: columns, rows: rows, table: table ?? TableRef(schema: "public", name: "table"))
        }
    }

    /// JSON array of objects. Numbers, booleans and JSON columns are emitted as native JSON.
    public static func json(columns: [ResultColumn], rows: [[CellValue]]) -> String {
        let lines = rows.map { row -> String in
            let pairs = zip(columns, row).map { column, value in
                "\(jsonString(column.name)): \(jsonValue(value, kind: column.kind))"
            }
            return "  {" + pairs.joined(separator: ", ") + "}"
        }
        return "[\n" + lines.joined(separator: ",\n") + "\n]\n"
    }

    public static func sqlInserts(columns: [ResultColumn], rows: [[CellValue]], table: TableRef) -> String {
        let names = columns.map { SQLIdentifier.quote($0.name) }.joined(separator: ", ")
        return rows.map { row in
            let values = row.map { SQLLiteral.render($0) }.joined(separator: ", ")
            return "INSERT INTO \(table.quoted) (\(names)) VALUES (\(values));"
        }.joined(separator: "\n") + (rows.isEmpty ? "" : "\n")
    }

    static func jsonValue(_ value: CellValue, kind: ValueKind) -> String {
        guard let text = value.exportString, !value.isNull else { return "null" }
        switch kind {
        case .integer, .decimal:
            let isPlainNumber = Double(text) != nil && !text.lowercased().contains("n") // excludes NaN/Infinity
            return isPlainNumber ? text : jsonString(text)
        case .boolean:
            if text == "t" || text == "true" { return "true" }
            if text == "f" || text == "false" { return "false" }
            return jsonString(text)
        case .json:
            return isValidJSON(text) ? text : jsonString(text)
        default:
            return jsonString(text)
        }
    }

    static func isValidJSON(_ text: String) -> Bool {
        guard let data = text.data(using: .utf8) else { return false }
        return (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) != nil
    }

    static func jsonString(_ text: String) -> String {
        var escaped = "\""
        for scalar in text.unicodeScalars {
            switch scalar {
            case "\"": escaped += "\\\""
            case "\\": escaped += "\\\\"
            case "\n": escaped += "\\n"
            case "\r": escaped += "\\r"
            case "\t": escaped += "\\t"
            case let scalar where scalar.value < 0x20: escaped += String(format: "\\u%04x", scalar.value)
            default: escaped.unicodeScalars.append(scalar)
            }
        }
        return escaped + "\""
    }
}
