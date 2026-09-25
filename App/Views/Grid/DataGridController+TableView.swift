import AppKit
import TableCore

// NSTableView data source and delegate: cell/row views, selection, header clicks and resizes.

// MARK: - NSTableViewDataSource

extension DataGridController: NSTableViewDataSource {
    func numberOfRows(in tableView: NSTableView) -> Int {
        content.rows.count
    }
}

// MARK: - NSTableViewDelegate

extension DataGridController: NSTableViewDelegate {
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard let tableColumn = tableColumn as? DataGridTableColumn else { return nil }
        guard let contentIndex = tableColumn.contentIndex else {
            let view = dequeueCellView(identifier: DataGridCellView.gutterIdentifier)
            view.configureGutter(rowNumber: row + 1, style: style)
            return view
        }
        guard let column = column(atContentIndex: contentIndex) else { return nil }
        let position = GridCellPosition(row: row, column: contentIndex)
        let view = dequeueCellView(identifier: DataGridCellView.identifier)
        view.configure(
            cell: cell(at: position) ?? GridCell(text: ""),
            column: column,
            rowState: rowState(at: row) ?? .normal,
            isFocused: position == focusedCell,
            style: style
        )
        return view
    }

    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
        let rowView = tableView.makeView(withIdentifier: DataGridRowView.identifier, owner: nil) as? DataGridRowView
            ?? DataGridRowView(frame: .zero)
        rowView.identifier = DataGridRowView.identifier
        rowView.tint = switch rowState(at: row) {
        case .deleted: DataGridStyle.deletedRowTint
        case .inserted: DataGridStyle.insertedRowTint
        default: nil
        }
        return rowView
    }

    /// Keeps the focused cell inside the selection: a click uses the clicked column (via
    /// `focusColumnHint`), keyboard and programmatic changes keep the current column.
    func tableViewSelectionDidChange(_ notification: Notification) {
        guard !isRestoringSelection else { return }
        let rows = tableView.selectedRowIndexes
        if let focusedCell, rows.contains(focusedCell.row), focusColumnHint == nil {
            notifySelectionIfChanged()
            return
        }
        let column = focusColumnHint ?? focusedCell?.column ?? visibleColumnIndices.first
        if rows.isEmpty {
            setFocusedCell(nil)
        } else if let column {
            let row = rows.contains(tableView.selectedRow) ? tableView.selectedRow : (rows.first ?? 0)
            setFocusedCell(GridCellPosition(row: row, column: column))
        }
        notifySelectionIfChanged()
    }

    func tableView(_ tableView: NSTableView, didClick tableColumn: NSTableColumn) {
        guard let column = gridColumn(for: tableColumn) else { return }
        actions.onSortRequest(column)
    }

    func tableViewColumnDidResize(_ notification: Notification) {
        guard !isConfiguringColumns,
              let tableColumn = notification.userInfo?["NSTableColumn"] as? DataGridTableColumn,
              let column = gridColumn(for: tableColumn) else { return }
        columnWidths[column.id] = tableColumn.width
        actions.onColumnResize(column.id, tableColumn.width)
    }

    private func dequeueCellView(identifier: NSUserInterfaceItemIdentifier) -> DataGridCellView {
        if let view = tableView.makeView(withIdentifier: identifier, owner: nil) as? DataGridCellView {
            return view
        }
        let view = DataGridCellView(frame: .zero)
        view.identifier = identifier
        return view
    }
}
