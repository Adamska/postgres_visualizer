import AppKit
import TableCore

// Value types shared between the data grid (AppKit) and the SwiftUI models that feed it.

/// One column of the grid. `id` is the column index in the underlying result set.
struct GridColumn: Identifiable, Hashable, Sendable {
    var id: Int
    var name: String
    var typeName: String
    var kind: ValueKind
    var isPrimaryKey = false
    var isForeignKey = false
    var isNullable = true
    /// False for generated columns, views and results that cannot be edited.
    var isEditable = true
}

enum GridRowState: Hashable, Sendable {
    case normal
    case modified
    case inserted
    case deleted
}

/// What one cell shows. Already formatted for display.
struct GridCell: Hashable, Sendable {
    var text: String
    var isNull = false
    /// The user staged a new value for this cell.
    var isModified = false
    /// The cell will take the server default on commit.
    var isDefault = false
}

struct GridRow: Hashable, Sendable {
    var cells: [GridCell]
    var state: GridRowState = .normal
}

/// Immutable snapshot rendered by the grid. Bump `version` whenever rows or columns change
/// so the AppKit view knows to reload.
struct GridContent: Hashable, Sendable {
    var columns: [GridColumn]
    var rows: [GridRow]
    var version: Int

    static let empty = GridContent(columns: [], rows: [], version: 0)
}

struct GridCellPosition: Hashable, Sendable {
    var row: Int
    var column: Int
}

/// Sort indicator shown in the header.
struct GridSortState: Hashable, Sendable {
    var columnID: Int
    var ascending: Bool
}

/// Callbacks from the grid to its owner. All run on the main actor.
struct GridActions {
    /// Selected rows and the focused cell changed.
    var onSelectionChange: @MainActor (_ rows: IndexSet, _ focused: GridCellPosition?) -> Void = { _, _ in }
    /// Header click on a column.
    var onSortRequest: @MainActor (_ column: GridColumn) -> Void = { _ in }
    /// The user finished editing a cell inline, chose "Set NULL" or "Set DEFAULT".
    var onCommitEdit: @MainActor (_ position: GridCellPosition, _ value: EditValue) -> Void = { _, _ in }
    /// The user asked to open the large editor (multi-line or JSON values).
    var onOpenEditor: @MainActor (_ position: GridCellPosition) -> Void = { _ in }
    /// Delete key / context menu on rows.
    var onDeleteRows: @MainActor (_ rows: IndexSet) -> Void = { _ in }
    /// Context menu on a foreign key cell.
    var onFollowForeignKey: @MainActor (_ position: GridCellPosition) -> Void = { _ in }
    /// Column width persisted by the owner (optional).
    var onColumnResize: @MainActor (_ columnID: Int, _ width: CGFloat) -> Void = { _, _ in }
    /// Column hidden through the header context menu.
    var onToggleColumnVisibility: @MainActor (_ columnID: Int) -> Void = { _ in }
}
