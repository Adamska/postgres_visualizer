import AppKit

/// Borderless, non-activating panel that hosts the completion list. It is attached to the editor's
/// window as a child window and never becomes key, so key events keep flowing to the text view.
@MainActor
final class SQLCompletionPanel: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: SQLCompletionListView.width, height: SQLCompletionListView.rowHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = true
        hasShadow = true
        isOpaque = false
        backgroundColor = .clear
        animationBehavior = .none
        isExcludedFromWindowsMenu = true
        collectionBehavior = [.transient, .ignoresCycle, .fullScreenAuxiliary]
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// The scrollable list of completions, with an SF Symbol per kind and a dimmed detail on the right.
@MainActor
final class SQLCompletionListView: NSView, NSTableViewDataSource, NSTableViewDelegate {
    static let width: CGFloat = 320
    static let rowHeight: CGFloat = 22
    static let maxVisibleRows = 12
    private static let verticalPadding: CGFloat = 4
    private static let columnIdentifier = NSUserInterfaceItemIdentifier("completion")

    /// Called when the user clicks a row.
    var onClickRow: ((Int) -> Void)?

    var items: [SQLCompletion] = [] {
        didSet {
            tableView.reloadData()
            if !items.isEmpty { select(0) }
        }
    }

    var selectedIndex: Int? {
        let row = tableView.selectedRow
        return row >= 0 && row < items.count ? row : nil
    }

    /// Height needed to show `items` without scrolling, capped at `maxVisibleRows`.
    var preferredHeight: CGFloat {
        CGFloat(min(items.count, Self.maxVisibleRows)) * Self.rowHeight + Self.verticalPadding * 2
    }

    private let backgroundView = NSVisualEffectView()
    private let scrollView = NSScrollView()
    private let tableView = SQLCompletionTableView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("SQLCompletionListView does not support NSCoding")
    }

    private func configure() {
        backgroundView.material = .popover
        backgroundView.blendingMode = .behindWindow
        backgroundView.state = .active
        backgroundView.wantsLayer = true
        backgroundView.layer?.cornerRadius = 8
        backgroundView.layer?.cornerCurve = .continuous
        backgroundView.layer?.masksToBounds = true
        backgroundView.autoresizingMask = [.width, .height]
        addSubview(backgroundView)

        let column = NSTableColumn(identifier: Self.columnIdentifier)
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        tableView.headerView = nil
        tableView.rowHeight = Self.rowHeight
        tableView.intercellSpacing = .zero
        tableView.backgroundColor = .clear
        tableView.selectionHighlightStyle = .regular
        tableView.allowsEmptySelection = true
        tableView.allowsMultipleSelection = false
        tableView.columnAutoresizingStyle = .firstColumnOnlyAutoresizingStyle
        tableView.style = .plain
        tableView.dataSource = self
        tableView.delegate = self
        tableView.target = self
        tableView.action = #selector(rowClicked(_:))

        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.automaticallyAdjustsContentInsets = false
        scrollView.contentInsets = NSEdgeInsets(top: Self.verticalPadding, left: 0, bottom: Self.verticalPadding, right: 0)
        scrollView.autoresizingMask = [.width, .height]
        backgroundView.addSubview(scrollView)
    }

    override func layout() {
        super.layout()
        backgroundView.frame = bounds
        scrollView.frame = backgroundView.bounds
        tableView.tableColumns.first?.width = bounds.width
    }

    // MARK: - Selection

    func select(_ index: Int) {
        guard !items.isEmpty else { return }
        let clamped = max(0, min(index, items.count - 1))
        tableView.selectRowIndexes(IndexSet(integer: clamped), byExtendingSelection: false)
        tableView.scrollRowToVisible(clamped)
    }

    func moveSelection(by delta: Int) {
        guard !items.isEmpty else { return }
        let current = selectedIndex ?? (delta > 0 ? -1 : items.count)
        select(current + delta)
    }

    @objc private func rowClicked(_ sender: Any?) {
        let row = tableView.clickedRow
        guard row >= 0, row < items.count else { return }
        onClickRow?(row)
    }

    // MARK: - NSTableViewDataSource / NSTableViewDelegate

    func numberOfRows(in tableView: NSTableView) -> Int {
        items.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let cell = tableView.makeView(withIdentifier: Self.columnIdentifier, owner: nil) as? SQLCompletionCellView
            ?? SQLCompletionCellView(identifier: Self.columnIdentifier)
        cell.configure(with: items[row])
        return cell
    }

    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
        SQLCompletionRowView()
    }
}

/// Table that accepts clicks although its panel is never the key window.
@MainActor
final class SQLCompletionTableView: NSTableView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Row that draws an accent-coloured selection even though its window is never key.
@MainActor
final class SQLCompletionRowView: NSTableRowView {
    override var interiorBackgroundStyle: NSView.BackgroundStyle {
        isSelected ? .emphasized : .normal
    }

    override func drawSelection(in dirtyRect: NSRect) {
        guard isSelected else { return }
        NSColor.controlAccentColor.setFill()
        NSBezierPath(roundedRect: bounds.insetBy(dx: 4, dy: 0), xRadius: 5, yRadius: 5).fill()
    }
}

/// Icon, completion text and dimmed detail.
@MainActor
final class SQLCompletionCellView: NSTableCellView {
    private static let iconSize: CGFloat = 16
    private static let horizontalPadding: CGFloat = 8
    private static let textLeading: CGFloat = 30

    private let iconView = NSImageView()
    private let nameField = NSTextField(labelWithString: "")
    private let detailField = NSTextField(labelWithString: "")

    init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: .zero)
        self.identifier = identifier
        iconView.imageScaling = .scaleProportionallyDown
        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 12, weight: .regular)
        nameField.font = NSFont.monospacedSystemFont(ofSize: NSFont.systemFontSize - 1, weight: .regular)
        nameField.lineBreakMode = .byTruncatingTail
        detailField.font = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)
        detailField.lineBreakMode = .byTruncatingTail
        detailField.alignment = .right
        addSubview(iconView)
        addSubview(nameField)
        addSubview(detailField)
        textField = nameField
        imageView = iconView
        applyBackgroundStyle()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("SQLCompletionCellView does not support NSCoding")
    }

    override var backgroundStyle: NSView.BackgroundStyle {
        didSet { applyBackgroundStyle() }
    }

    func configure(with item: SQLCompletion) {
        iconView.image = NSImage(systemSymbolName: Self.symbolName(for: item.kind), accessibilityDescription: nil)
        nameField.stringValue = item.text
        detailField.stringValue = item.detail ?? ""
        needsLayout = true
    }

    override func layout() {
        super.layout()
        let height = bounds.height
        iconView.frame = NSRect(
            x: Self.horizontalPadding,
            y: (height - Self.iconSize) / 2,
            width: Self.iconSize,
            height: Self.iconSize
        )
        let detailWidth = detailField.stringValue.isEmpty
            ? 0
            : min(ceil(detailField.intrinsicContentSize.width), bounds.width * 0.45)
        let nameHeight = ceil(nameField.intrinsicContentSize.height)
        let detailHeight = ceil(detailField.intrinsicContentSize.height)
        let nameWidth = max(0, bounds.width - Self.textLeading - detailWidth - Self.horizontalPadding * 2)
        nameField.frame = NSRect(x: Self.textLeading, y: (height - nameHeight) / 2, width: nameWidth, height: nameHeight)
        detailField.frame = NSRect(
            x: bounds.width - Self.horizontalPadding - detailWidth,
            y: (height - detailHeight) / 2,
            width: detailWidth,
            height: detailHeight
        )
    }

    private func applyBackgroundStyle() {
        let emphasized = backgroundStyle == .emphasized
        nameField.textColor = emphasized ? .alternateSelectedControlTextColor : .labelColor
        detailField.textColor = emphasized ? NSColor.alternateSelectedControlTextColor.withAlphaComponent(0.75) : .secondaryLabelColor
        iconView.contentTintColor = emphasized ? .alternateSelectedControlTextColor : .secondaryLabelColor
    }

    private static func symbolName(for kind: SQLCompletion.Kind) -> String {
        switch kind {
        case .keyword: "textformat"
        case .schema: "folder"
        case .table: "tablecells"
        case .view: "eye"
        case .column: "rectangle.split.3x1"
        case .function: "function"
        case .snippet: "text.insert"
        }
    }
}
