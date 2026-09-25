import Foundation
import TableCore

/// Builds the grid snapshot from a result set, the table structure and staged changes.
enum GridContentBuilder {
    /// Columns for a result, using structure metadata when the result comes from a table.
    static func columns(for result: QueryResult, structure: TableStructure?) -> [GridColumn] {
        let isEditable = structure?.isEditable ?? false
        return result.columns.map { column in
            let info = structure?.column(named: column.name)
            return GridColumn(
                id: column.index,
                name: column.name,
                typeName: info?.typeName ?? column.typeName,
                kind: info?.kind ?? column.kind,
                isPrimaryKey: info?.isPrimaryKey ?? false,
                isForeignKey: structure?.foreignKey(for: column.name) != nil,
                isNullable: info?.isNullable ?? true,
                isEditable: isEditable && (info?.isWritable ?? false)
            )
        }
    }

    /// Rows for a read-only result.
    static func rows(for result: QueryResult) -> [GridRow] {
        result.rows.map { row in
            GridRow(cells: zip(row, result.columns).map { value, column in
                GridCell(text: ValueFormatting.gridText(for: value, kind: column.kind), isNull: value.isNull)
            })
        }
    }

    /// Rows for an editable table page: existing rows with staged edits, then inserted rows.
    static func rows(for result: QueryResult, structure: TableStructure, changes: ChangeSet) -> [GridRow] {
        var rows = result.rows.map { row -> GridRow in
            let identity = RowIdentity(structure: structure, row: row, columns: result.columns)
            let isDeleted = identity.map(changes.isDeleted) ?? false
            let staged = identity.flatMap { changes.updates[$0] } ?? [:]
            let cells = zip(row, result.columns).map { value, column -> GridCell in
                if let edit = staged[column.name] {
                    return cell(for: edit, kind: column.kind)
                }
                return GridCell(text: ValueFormatting.gridText(for: value, kind: column.kind), isNull: value.isNull)
            }
            let state: GridRowState = isDeleted ? .deleted : (staged.isEmpty ? .normal : .modified)
            return GridRow(cells: cells, state: state)
        }
        for insert in changes.inserts {
            let cells = result.columns.map { column -> GridCell in
                if let edit = insert.values[column.name] {
                    return cell(for: edit, kind: column.kind)
                }
                let info = structure.column(named: column.name)
                if info?.hasServerDefault == true || info?.isGenerated == true {
                    return GridCell(text: "DEFAULT", isDefault: true)
                }
                return GridCell(text: ValueFormatting.nullPlaceholder, isNull: true)
            }
            rows.append(GridRow(cells: cells, state: .inserted))
        }
        return rows
    }

    private static func cell(for edit: EditValue, kind: ValueKind) -> GridCell {
        switch edit {
        case .null: GridCell(text: ValueFormatting.nullPlaceholder, isNull: true, isModified: true)
        case .serverDefault: GridCell(text: "DEFAULT", isModified: true, isDefault: true)
        case .text(let text): GridCell(text: ValueFormatting.gridText(for: .text(text), kind: kind), isModified: true)
        }
    }
}
