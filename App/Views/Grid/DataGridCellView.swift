import AppKit
import TableCore

/// Reusable view-based cell. Hosts a single-line label and draws the modified tint and the
/// focused-cell border itself, so no extra subviews are needed.
final class DataGridCellView: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("DataGridCellView")
    static let gutterIdentifier = NSUserInterfaceItemIdentifier("DataGridGutterCellView")

    /// Draws the accent border when true.
    var isFocused = false {
        didSet {
            if isFocused != oldValue { needsDisplay = true }
        }
    }

    private let label = NSTextField(labelWithString: "")
    private var isModified = false
    private var isStrikethrough = false
    private var isSecondary = false
    private var displayText = ""
    private var textHeight: CGFloat = 16

    // MARK: Lifecycle

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        label.lineBreakMode = .byTruncatingTail
        label.usesSingleLineMode = true
        label.cell?.truncatesLastVisibleLine = true
        label.isEditable = false
        label.isSelectable = false
        label.drawsBackground = false
        label.isBezeled = false
        addSubview(label)
        textField = label
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("DataGridCellView does not support NSCoder")
    }

    // MARK: Configuration

    /// Configures the view for a data cell.
    func configure(cell: GridCell, column: GridColumn, rowState: GridRowState, isFocused: Bool, style: DataGridStyle) {
        if cell.isDefault {
            displayText = "DEFAULT"
            isSecondary = true
            label.font = style.italicFont
        } else if cell.isNull {
            displayText = cell.text
            isSecondary = true
            label.font = style.italicFont
        } else {
            displayText = cell.text
            isSecondary = false
            label.font = style.font
        }
        label.alignment = column.kind.isRightAligned ? .right : .left
        isStrikethrough = rowState == .deleted
        isModified = cell.isModified
        textHeight = style.textHeight
        self.isFocused = isFocused
        render()
        needsDisplay = true
        needsLayout = true
    }

    /// Configures the view as the row-number gutter cell.
    func configureGutter(rowNumber: Int, style: DataGridStyle) {
        displayText = String(rowNumber)
        isSecondary = true
        isStrikethrough = false
        isModified = false
        isFocused = false
        label.font = style.font
        label.alignment = .right
        textHeight = style.textHeight
        render()
        needsDisplay = true
        needsLayout = true
    }

    // MARK: Layout and drawing

    override func layout() {
        super.layout()
        let padding = DataGridStyle.cellPadding
        let height = min(textHeight, bounds.height)
        label.frame = NSRect(
            x: padding,
            y: ((bounds.height - height) / 2).rounded(),
            width: max(0, bounds.width - padding * 2),
            height: height
        )
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if isModified {
            DataGridStyle.modifiedCellTint.setFill()
            bounds.intersection(dirtyRect).fill()
        }
        if isFocused {
            let inset = DataGridStyle.focusBorderWidth / 2 + 0.5
            let path = NSBezierPath(
                roundedRect: bounds.insetBy(dx: inset, dy: inset),
                xRadius: DataGridStyle.focusCornerRadius,
                yRadius: DataGridStyle.focusCornerRadius
            )
            path.lineWidth = DataGridStyle.focusBorderWidth
            DataGridStyle.focusBorderColor.setStroke()
            path.stroke()
        }
    }

    override var backgroundStyle: NSView.BackgroundStyle {
        didSet {
            if backgroundStyle != oldValue { render() }
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        isFocused = false
        isModified = false
    }

    // MARK: Private

    private var effectiveTextColor: NSColor {
        if backgroundStyle == .emphasized {
            return isSecondary ? DataGridStyle.selectedSecondaryTextColor : DataGridStyle.selectedTextColor
        }
        return isSecondary ? DataGridStyle.secondaryTextColor : DataGridStyle.primaryTextColor
    }

    /// Pushes the display text into the label. Deleted rows need an attributed string for the
    /// strikethrough; everything else uses the cheaper plain string path.
    private func render() {
        let color = effectiveTextColor
        if isStrikethrough {
            let paragraph = NSMutableParagraphStyle()
            paragraph.lineBreakMode = .byTruncatingTail
            paragraph.alignment = label.alignment
            let attributes: [NSAttributedString.Key: Any] = [
                .font: label.font ?? NSFont.systemFont(ofSize: NSFont.systemFontSize),
                .foregroundColor: color,
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .strikethroughColor: color,
                .paragraphStyle: paragraph,
            ]
            label.attributedStringValue = NSAttributedString(string: displayText, attributes: attributes)
        } else {
            label.stringValue = displayText
            label.textColor = color
        }
    }
}

/// Row view that paints the inserted/deleted tint underneath the cells.
final class DataGridRowView: NSTableRowView {
    static let identifier = NSUserInterfaceItemIdentifier("DataGridRowView")

    /// Background tint for the whole row, or nil for a plain row.
    var tint: NSColor? {
        didSet {
            if tint != oldValue { needsDisplay = true }
        }
    }

    override func drawBackground(in dirtyRect: NSRect) {
        super.drawBackground(in: dirtyRect)
        guard let tint else { return }
        tint.setFill()
        bounds.intersection(dirtyRect).fill()
    }
}
