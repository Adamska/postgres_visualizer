import AppKit
import TableCore

// Inline cell editing. The editor is a plain NSTextField placed over the cell inside the table
// view so it scrolls with the content; it exists only while a cell is being edited.

extension DataGridController {
    // MARK: Session lifecycle

    /// Starts editing the cell, or asks the owner for the large editor when the column prefers it.
    func beginEditing(at position: GridCellPosition) {
        guard canEdit(position), let column = column(atContentIndex: position.column), let cell = cell(at: position) else { return }
        if column.kind.prefersMultilineEditor {
            openEditor(at: position)
            return
        }
        cancelEditing()
        moveFocus(to: position)
        guard let tableColumn = tableColumnIndex(forContentColumn: position.column) else { return }

        let originalText = cell.isNull || cell.isDefault ? "" : cell.text
        let editor = NSTextField(string: originalText)
        editor.delegate = self
        editor.font = style.font
        editor.alignment = column.kind.isRightAligned ? .right : .left
        editor.isBordered = false
        editor.isBezeled = false
        editor.drawsBackground = true
        editor.backgroundColor = .textBackgroundColor
        editor.focusRingType = .none
        editor.usesSingleLineMode = true
        editor.lineBreakMode = .byClipping
        editor.cell?.isScrollable = true
        editor.wantsLayer = true
        editor.layer?.borderWidth = DataGridStyle.focusBorderWidth
        editor.layer?.borderColor = DataGridStyle.focusBorderColor.cgColor
        editor.layer?.cornerRadius = DataGridStyle.focusCornerRadius
        editor.frame = tableView.frameOfCell(atColumn: tableColumn, row: position.row).insetBy(dx: 0.5, dy: 0.5)
        tableView.addSubview(editor)

        editingSession = EditingSession(position: position, editor: editor, originalText: originalText)
        tableView.window?.makeFirstResponder(editor)
        if let fieldEditor = editor.currentEditor() as? NSTextView {
            fieldEditor.textContainerInset = NSSize(width: DataGridStyle.cellPadding - 2, height: 0)
        }
    }

    /// Commits the pending edit (if the text changed) and optionally moves to the next editable
    /// cell in the row, starting a new edit there.
    func commitEditing(moveBy slotDelta: Int = 0) {
        guard var session = editingSession, !session.isFinishing else { return }
        session.isFinishing = true
        editingSession = session
        let newText = session.editor.stringValue
        tearDown(session.editor)
        editingSession = nil

        if newText != session.originalText {
            actions.onCommitEdit(session.position, .text(newText))
        }
        guard slotDelta != 0, let next = nextEditablePosition(from: session.position, direction: slotDelta) else { return }
        moveFocus(to: next)
        beginEditing(at: next)
    }

    /// Discards the pending edit, if any.
    func cancelEditing() {
        guard var session = editingSession, !session.isFinishing else { return }
        session.isFinishing = true
        editingSession = session
        tearDown(session.editor)
        editingSession = nil
    }

    private func tearDown(_ editor: NSTextField) {
        let window = tableView.window
        if window?.firstResponder === editor.currentEditor() {
            window?.makeFirstResponder(tableView)
        }
        editor.delegate = nil
        editor.removeFromSuperview()
    }

    /// The nearest editable, visible cell to the left or right of `position` in the same row.
    private func nextEditablePosition(from position: GridCellPosition, direction: Int) -> GridCellPosition? {
        guard let slot = visibleColumnIndices.firstIndex(of: position.column) else { return nil }
        var candidate = slot + direction
        while visibleColumnIndices.indices.contains(candidate) {
            let next = GridCellPosition(row: position.row, column: visibleColumnIndices[candidate])
            if canEdit(next) { return next }
            candidate += direction
        }
        return nil
    }
}

// MARK: - NSTextFieldDelegate

extension DataGridController: NSTextFieldDelegate {
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        guard editingSession?.editor === control else { return false }
        switch commandSelector {
        case #selector(NSResponder.cancelOperation(_:)):
            cancelEditing()
        case #selector(NSResponder.insertNewline(_:)):
            commitEditing()
        case #selector(NSResponder.insertTab(_:)):
            commitEditing(moveBy: 1)
        case #selector(NSResponder.insertBacktab(_:)):
            commitEditing(moveBy: -1)
        default:
            return false
        }
        return true
    }

    /// Focus moved elsewhere (click outside the editor): commit what was typed.
    func controlTextDidEndEditing(_ notification: Notification) {
        guard let session = editingSession, !session.isFinishing, (notification.object as? NSTextField) === session.editor else { return }
        commitEditing()
    }
}
