import AppKit

/// Table view subclass that routes mouse, keyboard and menu events to the controller.
/// All grid behaviour lives in `DataGridController`; this class only decides which events to
/// intercept before AppKit's default handling.
final class DataGridTableView: NSTableView {
    weak var controller: DataGridController?

    override var acceptsFirstResponder: Bool { true }

    // MARK: Mouse

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let row = row(at: point)
        let column = column(at: point)
        controller?.willClick(row: row, tableColumn: column)
        super.mouseDown(with: event)
        controller?.didClick(row: row, tableColumn: column)
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        let point = convert(event.locationInWindow, from: nil)
        return controller?.contextMenu(forRow: row(at: point), tableColumn: column(at: point))
    }

    @objc func handleDoubleClick(_ sender: Any?) {
        controller?.didDoubleClick(row: clickedRow, tableColumn: clickedColumn)
    }

    // MARK: Keyboard

    override func keyDown(with event: NSEvent) {
        if let controller, controller.handleKeyDown(event) {
            return
        }
        super.keyDown(with: event)
    }

    // MARK: Responder actions (Edit menu)

    @objc func copy(_ sender: Any?) {
        controller?.copySelection()
    }

    @objc func delete(_ sender: Any?) {
        controller?.deleteSelectedRows()
    }
}
