import Foundation

/// Pure helpers that turn grid content into clipboard text.
enum DataGridClipboard {
    /// Raw text of a cell for the clipboard: NULL and DEFAULT copy as empty strings.
    static func rawText(of cell: GridCell) -> String {
        cell.isNull || cell.isDefault ? "" : cell.text
    }

    /// Tab-separated values for the given rows, restricted to `columnIndices` (indices into
    /// `content.columns`), with a header line of column names.
    static func tabSeparatedValues(content: GridContent, rows: IndexSet, columnIndices: [Int]) -> String {
        let columns = columnIndices.compactMap { content.columns.indices.contains($0) ? content.columns[$0] : nil }
        var lines = [columns.map(\.name).joined(separator: "\t")]
        for row in rows where content.rows.indices.contains(row) {
            let cells = content.rows[row].cells
            let values = columnIndices.map { cells.indices.contains($0) ? rawText(of: cells[$0]) : "" }
            lines.append(values.joined(separator: "\t"))
        }
        return lines.joined(separator: "\n")
    }
}
