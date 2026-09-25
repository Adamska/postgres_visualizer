import AppKit
import TableCore

// Mouse, keyboard and context menu handling for the data grid.

extension DataGridController {
    // MARK: Mouse

    /// Called before AppKit processes a click so the selection change can focus the clicked column.
    func willClick(row: Int, tableColumn: Int) {
        focusColumnHint = clickedContentColumn(tableColumn)
    }

    /// Called after AppKit processed the click (including drag selection).
    func didClick(row: Int, tableColumn: Int) {
        defer { focusColumnHint = nil }
        guard row >= 0, row < content.rows.count, let column = clickedContentColumn(tableColumn) else { return }
        if tableView.selectedRowIndexes.contains(row) {
            setFocusedCell(GridCellPosition(row: row, column: column))
        }
    }

    func didDoubleClick(row: Int, tableColumn: Int) {
        guard row >= 0, let column = contentColumnIndex(forTableColumn: tableColumn) else { return }
        beginEditing(at: GridCellPosition(row: row, column: column))
    }

    /// Content column for a clicked table column; clicks in the gutter keep the current column.
    private func clickedContentColumn(_ tableColumn: Int) -> Int? {
        contentColumnIndex(forTableColumn: tableColumn) ?? focusedCell?.column ?? visibleColumnIndices.first
    }

    // MARK: Keyboard

    /// Returns true when the event was consumed.
    func handleKeyDown(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask).subtracting([.numericPad, .function])
        let characters = event.charactersIgnoringModifiers?.lowercased() ?? ""

        if flags == [.command, .shift], characters == "n" {
            setFocusedCellToNull()
            return true
        }
        if flags == .command, characters == "c" {
            copySelection()
            return true
        }

        guard let key = event.specialKey else { return false }
        let hasCommand = flags.contains(.command)
        let hasShift = flags.contains(.shift)

        switch key {
        case .upArrow where !hasCommand:
            moveFocus(rowDelta: -1, extendSelection: hasShift)
        case .downArrow where !hasCommand:
            moveFocus(rowDelta: 1, extendSelection: hasShift)
        case .leftArrow where !hasCommand:
            moveFocus(slotDelta: -1)
        case .rightArrow where !hasCommand:
            moveFocus(slotDelta: 1)
        case .home:
            moveFocus(toSlot: 0)
        case .leftArrow where hasCommand:
            moveFocus(toSlot: 0)
        case .end:
            moveFocus(toSlot: visibleColumnIndices.count - 1)
        case .rightArrow where hasCommand:
            moveFocus(toSlot: visibleColumnIndices.count - 1)
        case .carriageReturn, .enter:
            guard let focusedCell else { return false }
            if hasCommand {
                openEditor(at: focusedCell)
            } else {
                beginEditing(at: focusedCell)
            }
        case .tab:
            moveFocus(slotDelta: hasShift ? -1 : 1)
        case .backTab:
            moveFocus(slotDelta: -1)
        case .delete, .backspace, .deleteForward:
            deleteSelectedRows()
        default:
            return false
        }
        return true
    }

    private func moveFocus(rowDelta: Int, extendSelection: Bool) {
        guard !content.rows.isEmpty, let column = focusedCell?.column ?? visibleColumnIndices.first else { return }
        let currentRow = focusedCell?.row ?? (rowDelta > 0 ? -1 : content.rows.count)
        let row = min(max(currentRow + rowDelta, 0), content.rows.count - 1)
        moveFocus(to: GridCellPosition(row: row, column: column), extendSelection: extendSelection)
    }

    private func moveFocus(slotDelta: Int) {
        guard let focusedCell, let slot = visibleColumnIndices.firstIndex(of: focusedCell.column) else { return }
        moveFocus(toSlot: slot + slotDelta)
    }

    private func moveFocus(toSlot slot: Int) {
        guard let focusedCell, !visibleColumnIndices.isEmpty else { return }
        let clamped = min(max(slot, 0), visibleColumnIndices.count - 1)
        moveFocus(to: GridCellPosition(row: focusedCell.row, column: visibleColumnIndices[clamped]))
    }

    // MARK: Actions

    /// Copies the focused cell, or the selected rows as TSV when more than one row is selected.
    func copySelection() {
        let rows = tableView.selectedRowIndexes
        let text: String
        if rows.count > 1 || focusedCell == nil {
            guard !rows.isEmpty else { return }
            text = DataGridClipboard.tabSeparatedValues(content: content, rows: rows, columnIndices: visibleColumnIndices)
        } else if let focusedCell, let cell = cell(at: focusedCell) {
            text = DataGridClipboard.rawText(of: cell)
        } else {
            return
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    func deleteSelectedRows() {
        let rows = tableView.selectedRowIndexes
        guard !rows.isEmpty else { return }
        actions.onDeleteRows(rows)
    }

    /// Stages NULL for the focused cell when its column is editable and nullable.
    func setFocusedCellToNull() {
        guard let focusedCell, canEdit(focusedCell), column(atContentIndex: focusedCell.column)?.isNullable == true else { return }
        cancelEditing()
        actions.onCommitEdit(focusedCell, .null)
    }

    func setFocusedCellToDefault() {
        guard let focusedCell, canEdit(focusedCell) else { return }
        cancelEditing()
        actions.onCommitEdit(focusedCell, .serverDefault)
    }

    func openEditor(at position: GridCellPosition) {
        guard canEdit(position) else { return }
        cancelEditing()
        actions.onOpenEditor(position)
    }

    /// True when the column is editable and the row is not staged for deletion.
    func canEdit(_ position: GridCellPosition) -> Bool {
        guard let column = column(atContentIndex: position.column), let state = rowState(at: position.row) else { return false }
        return column.isEditable && state != .deleted
    }

    // MARK: Context menus

    /// Menu for a right-click on a cell. Focuses the cell first, keeping a multi-row selection
    /// when the clicked row is part of it.
    func contextMenu(forRow row: Int, tableColumn: Int) -> NSMenu? {
        guard row >= 0, row < content.rows.count,
              let columnIndex = contentColumnIndex(forTableColumn: tableColumn) ?? focusedCell?.column ?? visibleColumnIndices.first,
              let column = column(atContentIndex: columnIndex) else { return nil }
        let position = GridCellPosition(row: row, column: columnIndex)
        if tableView.selectedRowIndexes.contains(row) {
            setFocusedCell(position)
        } else {
            moveFocus(to: position)
        }

        let editable = canEdit(position)
        let menu = NSMenu()
        menu.addItem(menuItem("Copy", action: #selector(contextCopy(_:))))
        menu.addItem(.separator())
        menu.addItem(menuItem("Set NULL", action: #selector(contextSetNull(_:)), enabled: editable && column.isNullable))
        menu.addItem(menuItem("Set DEFAULT", action: #selector(contextSetDefault(_:)), enabled: editable))
        menu.addItem(menuItem("Edit Value…", action: #selector(contextEditValue(_:)), enabled: editable))
        if column.isForeignKey {
            menu.addItem(.separator())
            menu.addItem(menuItem("Follow Foreign Key…", action: #selector(contextFollowForeignKey(_:))))
        }
        menu.addItem(.separator())
        let selectedCount = tableView.selectedRowIndexes.count
        let deleteTitle = selectedCount > 1 ? "Delete \(selectedCount) Rows" : "Delete Row"
        menu.addItem(menuItem(deleteTitle, action: #selector(contextDeleteRows(_:))))
        return menu
    }

    /// Menu for a right-click on a column header: hide this column, show hidden ones.
    func headerMenu(forTableColumn tableColumn: Int) -> NSMenu? {
        let menu = NSMenu()
        if let contentIndex = contentColumnIndex(forTableColumn: tableColumn), let column = column(atContentIndex: contentIndex) {
            let item = menuItem("Hide \u{201C}\(column.name)\u{201D}", action: #selector(contextToggleColumn(_:)))
            item.representedObject = column.id
            menu.addItem(item)
        }
        let hidden = content.columns.filter { hiddenColumnIDs.contains($0.id) }
        if !hidden.isEmpty {
            if !menu.items.isEmpty { menu.addItem(.separator()) }
            for column in hidden {
                let item = menuItem("Show \u{201C}\(column.name)\u{201D}", action: #selector(contextToggleColumn(_:)))
                item.representedObject = column.id
                menu.addItem(item)
            }
        }
        return menu.items.isEmpty ? nil : menu
    }

    private func menuItem(_ title: String, action: Selector, enabled: Bool = true) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        item.isEnabled = enabled
        return item
    }

    @objc private func contextCopy(_ sender: Any?) {
        copySelection()
    }

    @objc private func contextSetNull(_ sender: Any?) {
        setFocusedCellToNull()
    }

    @objc private func contextSetDefault(_ sender: Any?) {
        setFocusedCellToDefault()
    }

    @objc private func contextEditValue(_ sender: Any?) {
        guard let focusedCell else { return }
        openEditor(at: focusedCell)
    }

    @objc private func contextFollowForeignKey(_ sender: Any?) {
        guard let focusedCell else { return }
        actions.onFollowForeignKey(focusedCell)
    }

    @objc private func contextDeleteRows(_ sender: Any?) {
        deleteSelectedRows()
    }

    @objc private func contextToggleColumn(_ sender: Any?) {
        guard let columnID = (sender as? NSMenuItem)?.representedObject as? Int else { return }
        actions.onToggleColumnVisibility(columnID)
    }
}

// MARK: - NSMenuItemValidation

extension DataGridController: NSMenuItemValidation {
    /// Context menu items carry their enabled state explicitly; validation just keeps it.
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        menuItem.isEnabled
    }
}
