import AppKit
import TableCore

/// AppKit side of the data grid: owns the scroll view and table view, keeps the rendered
/// snapshot and translates between `GridContent` and `NSTableView`.
///
/// `GridCellPosition.column` is always an index into `GridContent.columns` (which is also the
/// index into `GridRow.cells`); `GridColumn.id` is only used for sort, width and visibility
/// bookkeeping. The first table column is the row-number gutter and never maps to a
/// `GridColumn`.
///
/// Interaction (keys, clicks, menus) lives in `DataGridController+Interaction.swift`, inline
/// editing in `DataGridController+Editing.swift`.
@MainActor
final class DataGridController: NSObject {
    /// Inline editor state; only one cell is edited at a time.
    struct EditingSession {
        var position: GridCellPosition
        var editor: NSTextField
        var originalText: String
        var isFinishing = false
    }

    let scrollView = NSScrollView()
    let tableView = DataGridTableView()
    let headerView = DataGridHeaderView()

    private(set) var content: GridContent = .empty
    private(set) var hiddenColumnIDs: Set<Int> = []
    private(set) var sort: GridSortState?
    private(set) var style: DataGridStyle
    private(set) var focusedCell: GridCellPosition?
    /// Indices into `content.columns` for each table column after the gutter.
    private(set) var visibleColumnIndices: [Int] = []
    var actions = GridActions()

    /// Column widths keyed by `GridColumn.id`, kept across reloads and column rebuilds.
    var columnWidths: [Int: CGFloat] = [:]
    /// True while table columns are being recreated; resize notifications are ignored.
    var isConfiguringColumns = false
    /// True while the selection is restored after a reload; selection callbacks are suppressed.
    var isRestoringSelection = false
    private var tableColumnIndexByContentIndex: [Int: Int] = [:]
    private var lastRenderedVersion: Int?
    private var lastRequestedFocus: GridCellPosition?
    private var lastReportedRows = IndexSet()
    private var lastReportedFocus: GridCellPosition?

    /// Column to focus when the selection changes because of a mouse click; set by the table view
    /// before AppKit updates the selection.
    var focusColumnHint: Int?
    var editingSession: EditingSession?

    // MARK: Lifecycle

    override init() {
        style = DataGridStyle(fontSize: PreferenceDefaults.gridFontSize)
        super.init()
        configureViews()
    }

    private func configureViews() {
        tableView.controller = self
        tableView.dataSource = self
        tableView.delegate = self
        tableView.style = .plain
        tableView.selectionHighlightStyle = .regular
        tableView.allowsMultipleSelection = true
        tableView.allowsEmptySelection = true
        tableView.allowsColumnSelection = false
        tableView.allowsColumnReordering = false
        tableView.allowsColumnResizing = true
        tableView.columnAutoresizingStyle = .noColumnAutoresizing
        tableView.usesAlternatingRowBackgroundColors = false
        tableView.usesAutomaticRowHeights = false
        tableView.intercellSpacing = NSSize(width: 0, height: 0)
        tableView.gridStyleMask = .solidVerticalGridLineMask
        tableView.gridColor = DataGridStyle.gridLineColor
        tableView.rowHeight = style.rowHeight
        tableView.focusRingType = .none
        tableView.target = tableView
        tableView.doubleAction = #selector(DataGridTableView.handleDoubleClick(_:))
        headerView.controller = self
        tableView.headerView = headerView

        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = true
        scrollView.backgroundColor = .textBackgroundColor
        rebuildColumns()
    }

    // MARK: Applying SwiftUI state

    /// Everything the SwiftUI view passes down on each update.
    struct Input {
        var content: GridContent
        var sort: GridSortState?
        var hiddenColumnIDs: Set<Int> = []
        var focusedCell: GridCellPosition?
        var fontSize: CGFloat = PreferenceDefaults.gridFontSize
        var actions = GridActions()
    }

    /// Entry point used by `DataGridView.updateNSView`. Cheap when nothing changed: table data
    /// is only reloaded when `content.version`, the columns or the font size differ from what
    /// is currently rendered.
    func apply(_ input: Input) {
        actions = input.actions

        var needsReload = false
        if input.fontSize != style.fontSize {
            style = DataGridStyle(fontSize: input.fontSize)
            tableView.rowHeight = style.rowHeight
            needsReload = true
        }

        let columnsChanged = input.content.columns != content.columns || input.hiddenColumnIDs != hiddenColumnIDs
        let versionChanged = input.content.version != lastRenderedVersion
        if columnsChanged || versionChanged {
            content = input.content
            hiddenColumnIDs = input.hiddenColumnIDs
            lastRenderedVersion = input.content.version
        }
        if columnsChanged {
            rebuildColumns()
        }
        if columnsChanged || versionChanged || needsReload {
            reloadPreservingState(columnsChanged: columnsChanged)
        }

        if input.sort != sort || columnsChanged {
            sort = input.sort
            updateSortIndicators()
        }

        if input.focusedCell != lastRequestedFocus {
            lastRequestedFocus = input.focusedCell
            if let requestedFocus = input.focusedCell, isValid(requestedFocus) {
                moveFocus(to: requestedFocus)
            }
        }
    }

    // MARK: Columns

    /// Recreates the table columns from `content.columns` minus the hidden ones.
    func rebuildColumns() {
        isConfiguringColumns = true
        defer { isConfiguringColumns = false }
        cancelEditing()

        for column in tableView.tableColumns.reversed() {
            tableView.removeTableColumn(column)
        }
        tableColumnIndexByContentIndex = [:]

        let gutter = DataGridTableColumn(identifier: DataGridTableColumn.gutterIdentifier, contentIndex: nil)
        gutter.headerCell = DataGridHeaderCell(title: "", isPrimaryKey: false)
        gutter.width = DataGridStyle.gutterWidth
        gutter.minWidth = DataGridStyle.gutterWidth
        gutter.maxWidth = DataGridStyle.gutterWidth
        gutter.resizingMask = []
        gutter.isEditable = false
        tableView.addTableColumn(gutter)

        visibleColumnIndices = content.columns.indices.filter { !hiddenColumnIDs.contains(content.columns[$0].id) }
        for (slot, contentIndex) in visibleColumnIndices.enumerated() {
            let column = content.columns[contentIndex]
            let tableColumn = DataGridTableColumn(
                identifier: NSUserInterfaceItemIdentifier("DataGridColumn-\(column.id)"),
                contentIndex: contentIndex
            )
            tableColumn.title = column.name
            tableColumn.headerCell = DataGridHeaderCell(title: column.name, isPrimaryKey: column.isPrimaryKey)
            tableColumn.headerToolTip = column.typeName
            tableColumn.minWidth = DataGridStyle.minimumColumnWidth
            tableColumn.width = columnWidths[column.id] ?? DataGridStyle.defaultWidth(for: column.kind)
            tableColumn.resizingMask = .userResizingMask
            tableColumn.isEditable = false
            tableView.addTableColumn(tableColumn)
            tableColumnIndexByContentIndex[contentIndex] = slot + 1
        }
    }

    /// Applies the sort indicator from `sort` to the matching header.
    private func updateSortIndicators() {
        for tableColumn in tableView.tableColumns {
            guard let column = gridColumn(for: tableColumn) else {
                tableView.setIndicatorImage(nil, in: tableColumn)
                continue
            }
            if let sort, sort.columnID == column.id {
                let name = sort.ascending ? "NSAscendingSortIndicator" : "NSDescendingSortIndicator"
                tableView.setIndicatorImage(NSImage(named: name), in: tableColumn)
            } else {
                tableView.setIndicatorImage(nil, in: tableColumn)
            }
        }
        headerView.needsDisplay = true
    }

    // MARK: Column mapping

    /// The grid column shown by a table column, or nil for the gutter.
    func gridColumn(for tableColumn: NSTableColumn) -> GridColumn? {
        guard let contentIndex = (tableColumn as? DataGridTableColumn)?.contentIndex else { return nil }
        return column(atContentIndex: contentIndex)
    }

    /// Index into `content.columns` for a table column index, or nil for the gutter and out of range.
    func contentColumnIndex(forTableColumn tableColumnIndex: Int) -> Int? {
        guard tableColumnIndex >= 1, tableColumnIndex - 1 < visibleColumnIndices.count else { return nil }
        return visibleColumnIndices[tableColumnIndex - 1]
    }

    /// Table column index showing the given content column, or nil when hidden.
    func tableColumnIndex(forContentColumn contentIndex: Int) -> Int? {
        tableColumnIndexByContentIndex[contentIndex]
    }

    func column(atContentIndex index: Int) -> GridColumn? {
        content.columns.indices.contains(index) ? content.columns[index] : nil
    }

    func cell(at position: GridCellPosition) -> GridCell? {
        guard content.rows.indices.contains(position.row) else { return nil }
        let cells = content.rows[position.row].cells
        return cells.indices.contains(position.column) ? cells[position.column] : nil
    }

    func rowState(at row: Int) -> GridRowState? {
        content.rows.indices.contains(row) ? content.rows[row].state : nil
    }

    /// True when the position points at an existing, visible cell.
    func isValid(_ position: GridCellPosition) -> Bool {
        content.rows.indices.contains(position.row) && tableColumnIndex(forContentColumn: position.column) != nil
    }

    // MARK: Reloading

    /// Reloads the table, keeping selection, focus and scroll position when the row count is
    /// unchanged. Cells are refreshed in place when possible.
    private func reloadPreservingState(columnsChanged: Bool) {
        let oldCount = tableView.numberOfRows
        let newCount = content.rows.count

        if oldCount == newCount, !columnsChanged {
            if let session = editingSession, cell(at: session.position) == nil {
                cancelEditing()
            }
            tableView.reloadData(
                forRowIndexes: IndexSet(integersIn: 0..<newCount),
                columnIndexes: IndexSet(integersIn: 0..<tableView.numberOfColumns)
            )
            return
        }

        cancelEditing()
        let selection = tableView.selectedRowIndexes
        let scrollOrigin = scrollView.contentView.bounds.origin
        isRestoringSelection = true
        tableView.reloadData()
        if oldCount == newCount {
            tableView.selectRowIndexes(selection, byExtendingSelection: false)
            scrollView.contentView.scroll(to: scrollOrigin)
            scrollView.reflectScrolledClipView(scrollView.contentView)
        } else {
            let clamped = IndexSet(selection.filter { $0 < newCount })
            tableView.selectRowIndexes(clamped, byExtendingSelection: false)
        }
        isRestoringSelection = false

        if let focusedCell, !isValid(focusedCell) {
            let fallbackColumn = visibleColumnIndices.first ?? focusedCell.column
            let fallback = GridCellPosition(row: min(focusedCell.row, newCount - 1), column: fallbackColumn)
            self.focusedCell = newCount > 0 && isValid(fallback) ? fallback : nil
        }
        refreshFocusedCellView()
        notifySelectionIfChanged()
    }

    // MARK: Focus

    /// Changes the focused cell without touching the row selection.
    func setFocusedCell(_ position: GridCellPosition?) {
        guard position != focusedCell else { return }
        if let old = focusedCell {
            cellView(at: old)?.isFocused = false
        }
        focusedCell = position
        refreshFocusedCellView()
        notifySelectionIfChanged()
    }

    /// Focuses a cell, selects its row (or adds it to the selection) and scrolls it into view.
    func moveFocus(to position: GridCellPosition, extendSelection: Bool = false) {
        guard isValid(position) else { return }
        focusColumnHint = position.column
        defer { focusColumnHint = nil }
        if extendSelection {
            tableView.selectRowIndexes(IndexSet(integer: position.row), byExtendingSelection: true)
        } else if tableView.selectedRowIndexes != IndexSet(integer: position.row) {
            tableView.selectRowIndexes(IndexSet(integer: position.row), byExtendingSelection: false)
        }
        setFocusedCell(position)
        tableView.scrollRowToVisible(position.row)
        if let tableColumn = tableColumnIndex(forContentColumn: position.column) {
            tableView.scrollColumnToVisible(tableColumn)
        }
    }

    func cellView(at position: GridCellPosition) -> DataGridCellView? {
        guard let tableColumn = tableColumnIndex(forContentColumn: position.column),
              position.row < tableView.numberOfRows else { return nil }
        return tableView.view(atColumn: tableColumn, row: position.row, makeIfNecessary: false) as? DataGridCellView
    }

    private func refreshFocusedCellView() {
        guard let focusedCell else { return }
        cellView(at: focusedCell)?.isFocused = true
    }

    /// Reports selection and focus to the owner, skipping duplicates.
    func notifySelectionIfChanged() {
        let rows = tableView.selectedRowIndexes
        guard rows != lastReportedRows || focusedCell != lastReportedFocus else { return }
        lastReportedRows = rows
        lastReportedFocus = focusedCell
        actions.onSelectionChange(rows, focusedCell)
    }
}
