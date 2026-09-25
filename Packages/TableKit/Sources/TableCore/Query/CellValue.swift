public import Foundation

/// A single value returned by the server, in its canonical textual representation.
public enum CellValue: Hashable, Sendable {
    case null
    /// Postgres text representation of the value (what `::text` would give).
    case text(String)
    /// Raw bytes for values that could not be decoded into text.
    case binary(Data)

    public var isNull: Bool {
        if case .null = self { return true }
        return false
    }

    /// The textual representation, or `nil` for NULL and undecodable values.
    public var stringValue: String? {
        if case .text(let string) = self { return string }
        return nil
    }

    /// The textual representation suitable for exports; binary values are hex encoded.
    public var exportString: String? {
        switch self {
        case .null: nil
        case .text(let string): string
        case .binary(let data): "\\x" + data.map { String(format: "%02x", $0) }.joined()
        }
    }
}

/// A value staged by the user for a cell. Distinguishes NULL, DEFAULT and literal text.
public enum EditValue: Hashable, Sendable {
    case null
    case serverDefault
    case text(String)

    public init(_ cell: CellValue) {
        switch cell {
        case .null: self = .null
        case .text(let string): self = .text(string)
        case .binary(let data): self = .text(CellValue.binary(data).exportString ?? "")
        }
    }

    public var cellValue: CellValue? {
        switch self {
        case .null: .null
        case .serverDefault: nil
        case .text(let string): .text(string)
        }
    }
}
