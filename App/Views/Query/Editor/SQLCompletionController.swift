import AppKit

/// Owns the completion panel: shows it under the caret, moves the selection with the keyboard and
/// reports the accepted item. The text view stays first responder throughout; it forwards key
/// events through `handleKeyDown(_:)`.
@MainActor
final class SQLCompletionController: NSObject {
    private static let caretGap: CGFloat = 4
    /// Shifts the panel left so the completion text lines up with the word being completed.
    private static let leadingOffset: CGFloat = 30
    private static let escapeKeyCode: UInt16 = 53

    /// Called with the chosen completion on Return, Tab or click.
    var onAccept: ((SQLCompletion) -> Void)?

    private(set) var items: [SQLCompletion] = []
    private let panel = SQLCompletionPanel()
    private let listView = SQLCompletionListView(frame: .zero)
    private var mouseMonitor: Any?

    var isVisible: Bool { panel.isVisible }

    override init() {
        super.init()
        panel.contentView = listView
        listView.onClickRow = { [weak self] row in
            self?.accept(row)
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(parentWindowChanged(_:)),
            name: NSWindow.didResignKeyNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(parentWindowChanged(_:)),
            name: NSWindow.didMoveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(parentWindowChanged(_:)),
            name: NSWindow.didResizeNotification,
            object: nil
        )
    }

    // MARK: - Presentation

    /// Shows `items` below `anchor` (screen coordinates of the word start), or above it when there is
    /// no room. Calling this while visible just refreshes the list and position.
    func present(_ items: [SQLCompletion], anchor: NSRect, in parent: NSWindow) {
        guard !items.isEmpty else {
            dismiss()
            return
        }
        self.items = items
        listView.items = items

        let size = NSSize(width: SQLCompletionListView.width, height: listView.preferredHeight)
        var origin = NSPoint(x: anchor.minX - Self.leadingOffset, y: anchor.minY - Self.caretGap - size.height)
        if let screen = parent.screen ?? NSScreen.main {
            let visible = screen.visibleFrame
            if origin.y < visible.minY {
                origin.y = anchor.maxY + Self.caretGap
            }
            origin.x = max(visible.minX, min(origin.x, visible.maxX - size.width))
        }
        panel.setFrame(NSRect(origin: origin, size: size), display: false)
        listView.frame = NSRect(origin: .zero, size: size)
        listView.needsLayout = true

        if panel.parent !== parent {
            panel.parent?.removeChildWindow(panel)
            parent.addChildWindow(panel, ordered: .above)
        }
        if !panel.isVisible {
            panel.orderFront(nil)
        }
        installMouseMonitor()
    }

    func dismiss() {
        removeMouseMonitor()
        guard panel.isVisible || panel.parent != nil else { return }
        panel.parent?.removeChildWindow(panel)
        panel.orderOut(nil)
        items = []
        listView.items = []
    }

    // MARK: - Keyboard

    /// Consumes navigation and acceptance keys while the panel is visible. Returns false for every
    /// other key so the text view handles it and re-filters afterwards.
    func handleKeyDown(_ event: NSEvent) -> Bool {
        guard isVisible else { return false }
        if event.keyCode == Self.escapeKeyCode {
            dismiss()
            return true
        }
        guard event.modifierFlags.isDisjoint(with: [.command, .control, .option]) else { return false }
        switch event.specialKey {
        case .upArrow?:
            listView.moveSelection(by: -1)
        case .downArrow?:
            listView.moveSelection(by: 1)
        case .pageUp?:
            listView.moveSelection(by: -SQLCompletionListView.maxVisibleRows)
        case .pageDown?:
            listView.moveSelection(by: SQLCompletionListView.maxVisibleRows)
        case .carriageReturn?, .enter?, .tab?:
            guard let index = listView.selectedIndex else {
                dismiss()
                return false
            }
            accept(index)
        default:
            return false
        }
        return true
    }

    private func accept(_ index: Int) {
        guard index >= 0, index < items.count else { return }
        let item = items[index]
        dismiss()
        onAccept?(item)
    }

    // MARK: - Dismissal triggers

    private func installMouseMonitor() {
        guard mouseMonitor == nil else { return }
        mouseMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] event in
            guard let self, event.window !== panel else { return event }
            dismiss()
            return event
        }
    }

    private func removeMouseMonitor() {
        if let mouseMonitor {
            NSEvent.removeMonitor(mouseMonitor)
        }
        mouseMonitor = nil
    }

    @objc private func parentWindowChanged(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, window === panel.parent else { return }
        dismiss()
    }
}
