import AppKit
import TableCore

/// Applies syntax colours to an `NSTextStorage` using `SQLTokenizer`, and renders the error marker.
///
/// The highlighter is the storage's delegate: after every character edit it recolours the document
/// inside the same `processEditing` pass, so the new attributes reach the layout manager before the
/// next display and every edit is highlighted exactly once. Attribute-only passes triggered from the
/// outside (font size, error marker, scrolling in large documents) are coalesced per run loop turn
/// through `scheduleHighlight()`.
@MainActor
final class SQLSyntaxHighlighter: NSObject {
    /// Documents longer than this (in UTF-16 units) are highlighted around the visible range only.
    static let largeDocumentThreshold = 200_000
    /// Half-window highlighted synchronously around an edit in a large document.
    private static let editWindow = 8_000

    let textStorage: NSTextStorage

    var fontSize: CGFloat {
        didSet {
            guard fontSize != oldValue else { return }
            rebuildAttributes()
            scheduleHighlight()
        }
    }

    /// Range to underline in red with `message` as its tooltip. Clamped to the document.
    var errorMarker: SQLErrorMarker? {
        didSet {
            guard errorMarker != oldValue else { return }
            scheduleHighlight()
        }
    }

    /// Supplies the character range currently on screen (plus some slack). Used for large documents
    /// only; when nil, the whole document is highlighted.
    var visibleRangeProvider: (() -> NSRange)?

    private(set) var baseAttributes: [NSAttributedString.Key: Any] = [:]
    private(set) var paragraphStyle: NSParagraphStyle = SQLEditorTheme.paragraphStyle()
    private(set) var regularFont: NSFont
    private var boldFont: NSFont
    private var italicFont: NSFont
    private var isHighlightScheduled = false

    init(textStorage: NSTextStorage, fontSize: CGFloat) {
        self.textStorage = textStorage
        self.fontSize = fontSize
        regularFont = SQLEditorTheme.font(size: fontSize)
        boldFont = SQLEditorTheme.boldFont(size: fontSize)
        italicFont = SQLEditorTheme.italicFont(size: fontSize)
        super.init()
        rebuildAttributes()
        textStorage.delegate = self
    }

    // MARK: - Scheduling

    /// Requests a full pass on the next run loop turn. Several requests are folded into one pass.
    func scheduleHighlight() {
        guard !isHighlightScheduled else { return }
        isHighlightScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            isHighlightScheduled = false
            highlightNow()
        }
    }

    /// Highlights immediately: the whole document, or the visible window of a large one.
    func highlightNow() {
        let length = textStorage.length
        let range: NSRange
        if length > Self.largeDocumentThreshold, let visible = visibleRangeProvider?() {
            range = SQLEditing.clamp(visible, to: length)
        } else {
            range = NSRange(location: 0, length: length)
        }
        textStorage.beginEditing()
        highlight(lineAligned(range))
        textStorage.endEditing()
    }

    // MARK: - Highlighting

    /// Recolours `range` (which must start and end on line boundaries) and re-applies the error marker.
    private func highlight(_ range: NSRange) {
        guard range.length > 0 || textStorage.length == 0 else {
            applyErrorMarker()
            return
        }
        let source = (textStorage.string as NSString).substring(with: range)
        var sql = source
        sql.makeContiguousUTF8()

        textStorage.setAttributes(baseAttributes, range: range)
        var location = range.location
        let end = range.location + range.length
        for token in SQLTokenizer.tokenize(sql) {
            let tokenLength = token.text.utf16.count
            defer { location += tokenLength }
            guard tokenLength > 0, location + tokenLength <= end, let attributes = attributes(for: token.kind) else {
                continue
            }
            textStorage.addAttributes(attributes, range: NSRange(location: location, length: tokenLength))
        }
        applyErrorMarker()
    }

    private func attributes(for kind: SQLToken.Kind) -> [NSAttributedString.Key: Any]? {
        switch kind {
        case .keyword:
            [.foregroundColor: SQLEditorTheme.keyword, .font: boldFont]
        case .comment:
            [.foregroundColor: SQLEditorTheme.comment, .font: italicFont]
        case .string, .number, .quotedIdentifier, .parameter:
            [.foregroundColor: SQLEditorTheme.color(for: kind)]
        case .identifier, .whitespace, .punctuation, .op:
            nil
        }
    }

    private func applyErrorMarker() {
        guard let marker = errorMarker else { return }
        let range = SQLEditing.clamp(NSRange(location: marker.location, length: marker.length), to: textStorage.length)
        guard range.length > 0 else { return }
        textStorage.addAttributes([
            .underlineStyle: NSUnderlineStyle.thick.rawValue | NSUnderlineStyle.patternDot.rawValue,
            .underlineColor: SQLEditorTheme.error,
            .toolTip: marker.message,
        ], range: range)
    }

    /// Expands `range` to the start of its first line and the end of its last line.
    private func lineAligned(_ range: NSRange) -> NSRange {
        let clamped = SQLEditing.clamp(range, to: textStorage.length)
        return (textStorage.string as NSString).lineRange(for: clamped)
    }

    private func rebuildAttributes() {
        regularFont = SQLEditorTheme.font(size: fontSize)
        boldFont = SQLEditorTheme.boldFont(size: fontSize)
        italicFont = SQLEditorTheme.italicFont(size: fontSize)
        paragraphStyle = SQLEditorTheme.paragraphStyle()
        baseAttributes = [
            .font: regularFont,
            .foregroundColor: SQLEditorTheme.plain,
            .paragraphStyle: paragraphStyle,
        ]
    }
}

// MARK: - NSTextStorageDelegate

extension SQLSyntaxHighlighter: NSTextStorageDelegate {
    nonisolated func textStorage(
        _ textStorage: NSTextStorage,
        didProcessEditing editedMask: NSTextStorageEditActions,
        range editedRange: NSRange,
        changeInLength delta: Int
    ) {
        guard editedMask.contains(.editedCharacters) else { return }
        // NSTextStorage delegates are called on the thread that edits the storage; the editor
        // only ever edits it from the main thread.
        MainActor.assumeIsolated {
            highlightAfterEdit(editedRange)
        }
    }

    /// Synchronous pass inside `processEditing`. Layout must not be queried here (the layout manager
    /// has not seen the edit yet), so large documents are highlighted around the edit and the visible
    /// window is refreshed on the next turn.
    private func highlightAfterEdit(_ editedRange: NSRange) {
        let length = textStorage.length
        if length > Self.largeDocumentThreshold {
            let start = max(0, editedRange.location - Self.editWindow)
            let end = min(length, editedRange.location + editedRange.length + Self.editWindow)
            highlight(lineAligned(NSRange(location: start, length: end - start)))
            scheduleHighlight()
        } else {
            highlight(NSRange(location: 0, length: length))
        }
    }
}
