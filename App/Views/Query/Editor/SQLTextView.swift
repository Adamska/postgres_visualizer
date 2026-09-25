import AppKit
import TableCore

/// The editor's `NSTextView`: TextKit 1, plain text, monospaced, with SQL-specific key handling.
///
/// Editing commands (indent, comment toggling, newline indentation) are computed by `SQLEditing`
/// and applied through `shouldChangeText`/`didChangeText` so they stay undoable. Completion logic
/// lives in `SQLTextView+Completion.swift`.
@MainActor
final class SQLTextView: NSTextView {
    // MARK: - Configuration

    /// Invoked for Cmd+Return (`.currentStatement`) and Cmd+Shift+Return (`.all`).
    var onRun: ((SQLRunScope) -> Void)?
    /// Source of completions. Held weakly: the query tab model owns it.
    weak var completionProvider: (any SQLCompletionProviding)?
    weak var lineNumberRuler: SQLLineNumberRuler?

    let highlighter: SQLSyntaxHighlighter
    let completionController = SQLCompletionController()

    /// Debounced automatic completion request.
    var completionTask: Task<Void, Never>?
    /// Range of the word the visible completion list was computed for.
    var completionWordRange: NSRange?
    /// Set while a completion is being inserted, so the insertion does not trigger another request.
    var isApplyingCompletion = false

    var fontSize: CGFloat { highlighter.fontSize }

    init(frame: NSRect, textContainer: NSTextContainer, textStorage: NSTextStorage, fontSize: CGFloat) {
        highlighter = SQLSyntaxHighlighter(textStorage: textStorage, fontSize: fontSize)
        super.init(frame: frame, textContainer: textContainer)
        configure()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("SQLTextView does not support NSCoding")
    }

    private func configure() {
        isRichText = false
        importsGraphics = false
        allowsUndo = true
        usesFindBar = true
        isIncrementalSearchingEnabled = true
        usesFontPanel = false
        isAutomaticQuoteSubstitutionEnabled = false
        isAutomaticDashSubstitutionEnabled = false
        isAutomaticTextReplacementEnabled = false
        isAutomaticSpellingCorrectionEnabled = false
        isAutomaticTextCompletionEnabled = false
        isAutomaticLinkDetectionEnabled = false
        isAutomaticDataDetectionEnabled = false
        isContinuousSpellCheckingEnabled = false
        isGrammarCheckingEnabled = false
        smartInsertDeleteEnabled = false

        drawsBackground = true
        backgroundColor = .textBackgroundColor
        insertionPointColor = .labelColor
        textContainerInset = SQLEditorTheme.textInset
        textContainer?.lineFragmentPadding = 0

        isVerticallyResizable = true
        isHorizontallyResizable = false
        autoresizingMask = [.width]
        minSize = .zero
        maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)

        applyFontAttributes()
        highlighter.visibleRangeProvider = { [weak self] in
            self?.visibleCharacterRange() ?? NSRange(location: 0, length: 0)
        }
        completionController.onAccept = { [weak self] completion in
            self?.acceptCompletion(completion)
        }
    }

    private func applyFontAttributes() {
        font = highlighter.regularFont
        defaultParagraphStyle = highlighter.paragraphStyle
        typingAttributes = highlighter.baseAttributes
    }

    // MARK: - External updates

    func setFontSize(_ size: CGFloat) {
        guard size != highlighter.fontSize else { return }
        highlighter.fontSize = size
        applyFontAttributes()
        lineNumberRuler?.fontSize = size
    }

    func setErrorMarker(_ marker: SQLErrorMarker?) {
        highlighter.errorMarker = marker
    }

    /// Replaces the whole document. The change is registered with the undo manager when the view is
    /// editable; otherwise the undo stack is dropped because it would no longer match the text.
    func replaceAllText(with text: String) {
        guard let textStorage else { return }
        let fullRange = NSRange(location: 0, length: textStorage.length)
        if shouldChangeText(in: fullRange, replacementString: text) {
            textStorage.replaceCharacters(in: fullRange, with: text)
        } else {
            textStorage.replaceCharacters(in: fullRange, with: text)
            undoManager?.removeAllActions()
        }
        didChangeText()
    }

    /// Applies an `SQLEditing` result as a single undoable change and restores its selection.
    func apply(_ edit: SQLTextEdit) {
        guard let textStorage, shouldChangeText(in: edit.range, replacementString: edit.replacement) else { return }
        textStorage.replaceCharacters(in: edit.range, with: edit.replacement)
        didChangeText()
        setSelectedRange(SQLEditing.clamp(edit.selection, to: textStorage.length))
        completionController.dismiss()
    }

    /// Characters on screen plus one screen above and below, for partial highlighting of large documents.
    func visibleCharacterRange() -> NSRange {
        guard let layoutManager, let textContainer else {
            return NSRange(location: 0, length: textStorage?.length ?? 0)
        }
        var rect = visibleRect
        rect.origin.y -= textContainerInset.height
        rect = rect.insetBy(dx: 0, dy: -rect.height)
        let glyphRange = layoutManager.glyphRange(forBoundingRect: rect, in: textContainer)
        return layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
    }

    // MARK: - Change tracking

    override func didChangeText() {
        super.didChangeText()
        lineNumberRuler?.invalidateLines()
    }

    override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
        super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
        lineNumberRuler?.selectionDidChange()
        completionSelectionDidChange()
    }

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        NotificationCenter.default.removeObserver(self, name: NSView.boundsDidChangeNotification, object: nil)
        guard let clipView = enclosingScrollView?.contentView else { return }
        clipView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(clipViewBoundsDidChange(_:)),
            name: NSView.boundsDidChangeNotification,
            object: clipView
        )
    }

    @objc private func clipViewBoundsDidChange(_ notification: Notification) {
        completionController.dismiss()
        if let textStorage, textStorage.length > SQLSyntaxHighlighter.largeDocumentThreshold {
            highlighter.scheduleHighlight()
        }
    }

    override func mouseDown(with event: NSEvent) {
        completionController.dismiss()
        super.mouseDown(with: event)
    }

    override func resignFirstResponder() -> Bool {
        completionController.dismiss()
        return super.resignFirstResponder()
    }

    // MARK: - Keyboard

    override func keyDown(with event: NSEvent) {
        if completionController.handleKeyDown(event) { return }
        let modifiers = event.modifierFlags
            .intersection(.deviceIndependentFlagsMask)
            .subtracting([.numericPad, .function, .capsLock])
        let key = event.charactersIgnoringModifiers ?? ""
        let isReturn = event.specialKey == .carriageReturn || event.specialKey == .enter

        if isReturn, modifiers == [.command] || modifiers == [.command, .shift] {
            completionController.dismiss()
            onRun?(modifiers.contains(.shift) ? .all : .currentStatement)
            return
        }
        if key == "/", modifiers == [.command] {
            apply(SQLEditing.toggleLineComment(string, selection: selectedRange()))
            return
        }
        if key == " ", modifiers == [.control] {
            requestCompletions(explicit: true)
            return
        }
        super.keyDown(with: event)
    }

    override func insertNewline(_ sender: Any?) {
        completionController.dismiss()
        let insertion = SQLEditing.newlineInsertion(in: string, caret: selectedRange().location)
        insertText(insertion, replacementRange: selectedRange())
    }

    override func insertTab(_ sender: Any?) {
        let selection = selectedRange()
        if selection.length == 0 {
            insertText(SQLEditing.indentUnit, replacementRange: selection)
        } else {
            apply(SQLEditing.indent(string, selection: selection))
        }
    }

    override func insertBacktab(_ sender: Any?) {
        apply(SQLEditing.outdent(string, selection: selectedRange()))
    }

    /// Escape: closes the completion list. The native completion popup is never shown.
    override func cancelOperation(_ sender: Any?) {
        completionController.dismiss()
    }

    /// Option+Escape / F5: explicit completion request.
    override func complete(_ sender: Any?) {
        requestCompletions(explicit: true)
    }

    override func insertText(_ string: Any, replacementRange: NSRange) {
        let typed = (string as? String) ?? (string as? NSAttributedString)?.string ?? ""
        let replacesSelection = replacementRange.location == NSNotFound || replacementRange == selectedRange()
        if typed == "(", replacesSelection, !isApplyingCompletion,
           SQLEditing.shouldAutoPairParenthesis(in: self.string, selection: selectedRange()) {
            super.insertText("()", replacementRange: replacementRange)
            setSelectedRange(NSRange(location: selectedRange().location - 1, length: 0))
            completionController.dismiss()
            return
        }
        super.insertText(string, replacementRange: replacementRange)
        guard !isApplyingCompletion else { return }
        completionDidType(typed)
    }

    override func deleteBackward(_ sender: Any?) {
        super.deleteBackward(sender)
        if completionController.isVisible {
            requestCompletions(explicit: false)
        }
    }
}
