import AppKit

/// Header cell showing the column name, prefixed by a key symbol for primary key columns.
/// Sort indicators are drawn by AppKit from `NSTableView.setIndicatorImage(_:in:)`.
final class DataGridHeaderCell: NSTableHeaderCell {
    init(title: String, isPrimaryKey: Bool) {
        super.init(textCell: title)
        font = DataGridStyle.headerFont
        lineBreakMode = .byTruncatingTail
        attributedStringValue = Self.attributedTitle(title, isPrimaryKey: isPrimaryKey)
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("DataGridHeaderCell does not support NSCoder")
    }

    // MARK: Private

    private static func attributedTitle(_ title: String, isPrimaryKey: Bool) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        paragraph.alignment = .left
        let font = DataGridStyle.headerFont
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: DataGridStyle.headerTextColor,
            .paragraphStyle: paragraph,
        ]
        let result = NSMutableAttributedString()
        if isPrimaryKey, let image = keySymbol() {
            let attachment = NSTextAttachment()
            attachment.image = image
            let size = image.size
            let baselineOffset = (font.capHeight - size.height) / 2
            attachment.bounds = NSRect(x: 0, y: baselineOffset.rounded(), width: size.width, height: size.height)
            result.append(NSAttributedString(attachment: attachment))
            result.append(NSAttributedString(string: " ", attributes: attributes))
        }
        result.append(NSAttributedString(string: title, attributes: attributes))
        return result
    }

    private static func keySymbol() -> NSImage? {
        let base = NSImage(systemSymbolName: "key.fill", accessibilityDescription: "Primary key")
        let configuration = NSImage.SymbolConfiguration(pointSize: DataGridStyle.keySymbolPointSize, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [DataGridStyle.secondaryTextColor]))
        return base?.withSymbolConfiguration(configuration)
    }
}

/// Header view that forwards right-clicks to the controller for the show/hide column menu.
final class DataGridHeaderView: NSTableHeaderView {
    weak var controller: DataGridController?

    override func menu(for event: NSEvent) -> NSMenu? {
        let point = convert(event.locationInWindow, from: nil)
        return controller?.headerMenu(forTableColumn: column(at: point))
    }
}

/// Table column carrying the index of its `GridColumn` in `GridContent.columns`. The gutter
/// column has no content index.
final class DataGridTableColumn: NSTableColumn {
    static let gutterIdentifier = NSUserInterfaceItemIdentifier("DataGridGutterColumn")

    /// Index into `GridContent.columns`, or nil for the row-number gutter.
    let contentIndex: Int?

    init(identifier: NSUserInterfaceItemIdentifier, contentIndex: Int?) {
        self.contentIndex = contentIndex
        super.init(identifier: identifier)
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("DataGridTableColumn does not support NSCoder")
    }
}
