import AppKit

/// Completion behaviour of the editor: when to ask the provider, where to show the list and how to
/// insert the chosen item.
extension SQLTextView {
    private static let automaticDelay: Duration = .milliseconds(80)

    // MARK: - Triggers

    /// Reacts to text typed by the user: identifier characters and dots (re)open the list, anything
    /// else closes it.
    func completionDidType(_ typed: String) {
        guard typed.utf16.count == 1, let unit = typed.utf16.first else {
            completionController.dismiss()
            return
        }
        let dot = unichar(0x2E)
        guard SQLEditing.isIdentifierCharacter(unit) || unit == dot else {
            completionController.dismiss()
            return
        }
        if completionController.isVisible {
            requestCompletions(explicit: false)
        } else {
            scheduleAutomaticCompletion()
        }
    }

    private func scheduleAutomaticCompletion() {
        completionTask?.cancel()
        completionTask = Task { [weak self] in
            try? await Task.sleep(for: Self.automaticDelay)
            guard !Task.isCancelled, let self else { return }
            requestCompletions(explicit: false)
        }
    }

    /// Asks the provider for the word under the caret and shows the result. Automatic requests need
    /// a prefix or a qualifier; explicit ones (Ctrl+Space, Option+Escape) always ask.
    func requestCompletions(explicit: Bool) {
        completionTask?.cancel()
        completionTask = nil
        guard isEditable, let provider = completionProvider, let window, selectedRange().length == 0 else {
            completionController.dismiss()
            return
        }
        let context = SQLEditing.wordContext(in: string, caret: selectedRange().location)
        guard explicit || !context.prefix.isEmpty || context.qualifier != nil else {
            completionController.dismiss()
            return
        }
        let items = provider.completions(prefix: context.prefix, qualifier: context.qualifier)
        guard !items.isEmpty else {
            completionController.dismiss()
            return
        }
        completionWordRange = context.range
        let anchor = firstRect(forCharacterRange: NSRange(location: context.range.location, length: 0), actualRange: nil)
        completionController.present(items, anchor: anchor, in: window)
    }

    /// Closes the list when the caret leaves the word it was computed for.
    func completionSelectionDidChange() {
        guard completionController.isVisible, let wordRange = completionWordRange else { return }
        let selection = selectedRange()
        let context = SQLEditing.wordContext(in: string, caret: selection.location)
        if selection.length != 0 || context.range.location != wordRange.location {
            completionController.dismiss()
        }
    }

    // MARK: - Acceptance

    /// Replaces the typed prefix with `completion.text`; keywords take the case of the prefix.
    func acceptCompletion(_ completion: SQLCompletion) {
        guard let wordRange = completionWordRange, let textStorage else { return }
        let caret = selectedRange().location
        let context = SQLEditing.wordContext(in: string, caret: caret)
        var text = completion.text
        if completion.kind == .keyword {
            text = SQLEditing.matchingCase(of: context.prefix, in: text)
        }
        let range = SQLEditing.clamp(NSRange(location: wordRange.location, length: caret - wordRange.location), to: textStorage.length)
        isApplyingCompletion = true
        insertText(text, replacementRange: range)
        isApplyingCompletion = false
        completionWordRange = nil
        completionController.dismiss()
    }
}
