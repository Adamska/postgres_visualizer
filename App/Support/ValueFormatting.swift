import Foundation
import TableCore

/// Turns raw cell values into strings for the grid, inspector and clipboard.
enum ValueFormatting {
    /// Placeholder rendered for SQL NULL.
    static let nullPlaceholder = "NULL"
    /// Cells longer than this are truncated in the grid; the inspector shows the full value.
    static let gridDisplayLimit = 300

    /// Single-line, truncated text for grid cells. NULL and binary values get placeholders.
    static func gridText(for value: CellValue, kind: ValueKind) -> String {
        switch value {
        case .null:
            return nullPlaceholder
        case .binary(let data):
            return "<binary \(data.count) bytes>"
        case .text(let text):
            var line = text
            if line.count > gridDisplayLimit {
                line = String(line.prefix(gridDisplayLimit)) + "…"
            }
            if kind == .json || kind == .text || kind == .array || kind == .composite {
                line = line.replacingOccurrences(of: "\n", with: "⏎ ")
            }
            return line
        }
    }

    /// Full text for the inspector, pretty-printing JSON when possible.
    static func detailText(for value: CellValue, kind: ValueKind) -> String {
        switch value {
        case .null: return nullPlaceholder
        case .binary(let data): return value.exportString ?? "<binary \(data.count) bytes>"
        case .text(let text):
            if kind == .json, let pretty = prettyJSON(text) { return pretty }
            return text
        }
    }

    /// Text placed in a cell editor: never the NULL placeholder.
    static func editorText(for value: CellValue) -> String {
        value.exportString ?? ""
    }

    static func prettyJSON(_ text: String) -> String? {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]),
              let pretty = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed]) else {
            return nil
        }
        return String(decoding: pretty, as: UTF8.self)
    }

    /// Formats an estimated count such as `12.4k rows`.
    static func rowCount(_ count: Int, estimated: Bool = false) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        let number = formatter.string(from: NSNumber(value: count)) ?? "\(count)"
        return (estimated ? "~" : "") + number + (count == 1 ? " row" : " rows")
    }

    static func duration(_ duration: Duration) -> String {
        let millis = Double(duration.components.seconds) * 1_000 + Double(duration.components.attoseconds) / 1e15
        if millis < 1 { return String(format: "%.2f ms", millis) }
        if millis < 1_000 { return String(format: "%.0f ms", millis) }
        return String(format: "%.2f s", millis / 1_000)
    }
}
