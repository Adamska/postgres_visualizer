import SwiftUI
import TableCore

/// SwiftUI entry point for the data grid. Wraps `DataGridController`, which owns the AppKit
/// table view. Table data is only reloaded when `content.version` changes; column widths,
/// selection and scroll position survive reloads with an unchanged row count.
struct DataGridView: NSViewRepresentable {
    /// Immutable snapshot; bump `version` to reload.
    var content: GridContent
    /// Sort indicator shown in the header (owned by the caller, never toggled by the grid).
    var sort: GridSortState?
    /// Columns not shown.
    var hiddenColumnIDs: Set<Int> = []
    /// Moves focus when it changes to a non-nil value; nil leaves focus alone.
    var focusedCell: GridCellPosition?
    /// Grid font size from Preferences.
    var fontSize: CGFloat = PreferenceDefaults.gridFontSize
    var actions = GridActions()

    func makeCoordinator() -> DataGridController {
        DataGridController()
    }

    func makeNSView(context: Context) -> NSScrollView {
        let controller = context.coordinator
        apply(to: controller)
        return controller.scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        apply(to: context.coordinator)
    }

    private func apply(to controller: DataGridController) {
        controller.apply(
            DataGridController.Input(
                content: content,
                sort: sort,
                hiddenColumnIDs: hiddenColumnIDs,
                focusedCell: focusedCell,
                fontSize: fontSize,
                actions: actions
            )
        )
    }
}

// MARK: - Preview

#if DEBUG
extension GridContent {
    /// Small sample used by the preview and tests: mixed kinds, a NULL, a modified cell, one
    /// deleted and one inserted row.
    static let sample: GridContent = {
        let columns = [
            GridColumn(id: 0, name: "id", typeName: "int4", kind: .integer, isPrimaryKey: true, isNullable: false),
            GridColumn(id: 1, name: "email", typeName: "text", kind: .text),
            GridColumn(id: 2, name: "active", typeName: "bool", kind: .boolean),
            GridColumn(id: 3, name: "balance", typeName: "numeric", kind: .decimal),
            GridColumn(id: 4, name: "team_id", typeName: "uuid", kind: .uuid, isForeignKey: true),
            GridColumn(id: 5, name: "created_at", typeName: "timestamptz", kind: .timestamp),
            GridColumn(id: 6, name: "settings", typeName: "jsonb", kind: .json),
        ]
        let rows = [
            GridRow(cells: [
                GridCell(text: "1"),
                GridCell(text: "ada@example.com"),
                GridCell(text: "true"),
                GridCell(text: "1250.00"),
                GridCell(text: "8f1c2b1e-3c0a-4c8e-9a7d-2f1b4d6e8a90"),
                GridCell(text: "2026-01-04 09:12:33+00"),
                GridCell(text: "{\"theme\": \"dark\"}"),
            ]),
            GridRow(cells: [
                GridCell(text: "2"),
                GridCell(text: "grace@example.com", isModified: true),
                GridCell(text: "false"),
                GridCell(text: "NULL", isNull: true),
                GridCell(text: "NULL", isNull: true),
                GridCell(text: "2026-02-11 17:45:01+00"),
                GridCell(text: "{}"),
            ], state: .modified),
            GridRow(cells: [
                GridCell(text: "3"),
                GridCell(text: "linus@example.com"),
                GridCell(text: "true"),
                GridCell(text: "-42.50"),
                GridCell(text: "0b7c0c2a-6c1d-4a23-9e1e-6d5a0c9f2b11"),
                GridCell(text: "2026-03-20 08:00:00+00"),
                GridCell(text: "{\"theme\": \"light\", \"beta\": true}"),
            ], state: .deleted),
            GridRow(cells: [
                GridCell(text: "", isDefault: true),
                GridCell(text: "new@example.com"),
                GridCell(text: "true"),
                GridCell(text: "0.00"),
                GridCell(text: "NULL", isNull: true),
                GridCell(text: "", isDefault: true),
                GridCell(text: "NULL", isNull: true),
            ], state: .inserted),
        ]
        return GridContent(columns: columns, rows: rows, version: 1)
    }()
}

#Preview("Data grid") {
    DataGridView(content: .sample, sort: GridSortState(columnID: 0, ascending: true))
        .frame(width: 900, height: 320)
}
#endif
