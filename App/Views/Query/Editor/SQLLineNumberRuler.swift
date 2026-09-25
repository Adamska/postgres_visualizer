import AppKit

/// Gutter that draws one number per real line (wrapped continuation fragments are skipped),
/// with the caret's line in the label colour and the others in the secondary label colour.
@MainActor
final class SQLLineNumberRuler: NSRulerView {
    private static let horizontalPadding: CGFloat = 8
    private static let minimumDigits = 3

    /// Font size of the editor; the gutter uses one point less.
    var fontSize: CGFloat {
        didSet {
            guard fontSize != oldValue else { return }
            updateThickness()
            needsDisplay = true
        }
    }

    private weak var textView: NSTextView?
    /// UTF-16 offsets at which each line starts. Rebuilt on every text change.
    private var lineStarts: [Int] = [0]

    init(textView: NSTextView, scrollView: NSScrollView, fontSize: CGFloat) {
        self.textView = textView
        self.fontSize = fontSize
        super.init(scrollView: scrollView, orientation: .verticalRuler)
        clientView = textView
        invalidateLines()
        scrollView.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(scrollViewDidScroll(_:)),
            name: NSView.boundsDidChangeNotification,
            object: scrollView.contentView
        )
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("SQLLineNumberRuler does not support NSCoding")
    }

    override var isFlipped: Bool { true }

    // MARK: - Invalidation

    /// Recomputes the line table after the text changed and widens the gutter when needed.
    func invalidateLines() {
        var starts = [0]
        if let text = textView?.string {
            var offset = 0
            for unit in text.utf16 {
                offset += 1
                if unit == 0x0A { starts.append(offset) }
            }
        }
        lineStarts = starts
        updateThickness()
        needsDisplay = true
    }

    /// Redraws so the current-line emphasis follows the caret.
    func selectionDidChange() {
        needsDisplay = true
    }

    @objc private func scrollViewDidScroll(_ notification: Notification) {
        needsDisplay = true
    }

    private var numberFont: NSFont {
        SQLEditorTheme.font(size: max(fontSize - 1, 6))
    }

    private func updateThickness() {
        let digits = max(Self.minimumDigits, String(lineStarts.count).count)
        let digitWidth = ("8" as NSString).size(withAttributes: [.font: numberFont]).width
        let thickness = ceil(CGFloat(digits) * digitWidth + Self.horizontalPadding * 2)
        if ruleThickness != thickness {
            ruleThickness = thickness
        }
    }

    // MARK: - Drawing

    override func draw(_ dirtyRect: NSRect) {
        // Clamp to our bounds: rulers can be asked to draw rects that extend over the content.
        NSColor.textBackgroundColor.setFill()
        dirtyRect.intersection(bounds).fill()
        guard let textView, let layoutManager = textView.layoutManager, let container = textView.textContainer else {
            return
        }
        let inset = textView.textContainerInset
        var visible = textView.visibleRect
        visible.origin.y -= inset.height
        let glyphRange = layoutManager.glyphRange(forBoundingRect: visible, in: container)
        let textOrigin = convert(NSPoint.zero, from: textView)
        let font = numberFont
        let currentLine = lineIndex(containing: textView.selectedRange().location)
        let rightEdge = bounds.width - Self.horizontalPadding

        layoutManager.enumerateLineFragments(forGlyphRange: glyphRange) { rect, _, _, fragmentGlyphRange, _ in
            let characterIndex = layoutManager.characterIndexForGlyph(at: fragmentGlyphRange.location)
            guard let line = self.exactLineIndex(startingAt: characterIndex) else { return }
            let baseline = rect.minY + layoutManager.location(forGlyphAt: fragmentGlyphRange.location).y
            self.drawNumber(
                line + 1,
                baseline: textOrigin.y + inset.height + baseline,
                rightEdge: rightEdge,
                font: font,
                isCurrent: line == currentLine
            )
        }

        if layoutManager.extraLineFragmentTextContainer != nil {
            let rect = layoutManager.extraLineFragmentRect
            let textFont = SQLEditorTheme.font(size: fontSize)
            let baseline = rect.maxY - layoutManager.defaultLineHeight(for: textFont) + textFont.ascender
            let line = lineStarts.count - 1
            drawNumber(
                line + 1,
                baseline: textOrigin.y + inset.height + baseline,
                rightEdge: rightEdge,
                font: font,
                isCurrent: line == currentLine
            )
        }
    }

    private func drawNumber(_ number: Int, baseline: CGFloat, rightEdge: CGFloat, font: NSFont, isCurrent: Bool) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: isCurrent ? NSColor.labelColor : NSColor.secondaryLabelColor,
        ]
        let label = String(number) as NSString
        let size = label.size(withAttributes: attributes)
        let origin = NSPoint(x: rightEdge - size.width, y: baseline - font.ascender)
        label.draw(at: origin, withAttributes: attributes)
    }

    // MARK: - Line lookup

    /// Index of the line containing the character at `offset`.
    private func lineIndex(containing offset: Int) -> Int {
        var low = 0
        var high = lineStarts.count
        while low < high {
            let mid = (low + high) / 2
            if lineStarts[mid] <= offset {
                low = mid + 1
            } else {
                high = mid
            }
        }
        return max(0, low - 1)
    }

    /// Index of the line that starts exactly at `offset`, or nil when `offset` is inside a line.
    private func exactLineIndex(startingAt offset: Int) -> Int? {
        let index = lineIndex(containing: offset)
        return lineStarts[index] == offset ? index : nil
    }
}
