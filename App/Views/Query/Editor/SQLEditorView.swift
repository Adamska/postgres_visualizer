import SwiftUI
import TableCore

/// SwiftUI entry point of the SQL editor: a scrolling `SQLTextView` with a line-number gutter.
///
/// `text` and `selectedRange` are synchronised in both directions. The view only pushes into the
/// text view when the bound value differs from what the view already shows, so typing never resets
/// the caret; edits flow back through `textDidChange` / `textViewDidChangeSelection`.
struct SQLEditorView: NSViewRepresentable {
    @Binding var text: String
    /// Caret or selection, in UTF-16 units.
    @Binding var selectedRange: NSRange
    var completionProvider: (any SQLCompletionProviding)?
    /// Range underlined in red; its `message` becomes the tooltip. Nil clears the marker.
    var errorMarker: SQLErrorMarker?
    /// Monospaced font size (`PreferenceKey.editorFontSize`).
    var fontSize: CGFloat
    var isEditable: Bool = true
    /// Cmd+Return reports `.currentStatement`, Cmd+Shift+Return reports `.all`.
    var onRun: @MainActor (SQLRunScope) -> Void

    // MARK: - NSViewRepresentable

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let textStorage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        textStorage.addLayoutManager(layoutManager)
        let textContainer = NSTextContainer(size: NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        textContainer.widthTracksTextView = true
        layoutManager.addTextContainer(textContainer)

        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = true
        scrollView.backgroundColor = .textBackgroundColor

        let textView = SQLTextView(
            frame: NSRect(origin: .zero, size: scrollView.contentSize),
            textContainer: textContainer,
            textStorage: textStorage,
            fontSize: fontSize
        )
        textView.delegate = context.coordinator
        scrollView.documentView = textView

        let ruler = SQLLineNumberRuler(textView: textView, scrollView: scrollView, fontSize: fontSize)
        scrollView.verticalRulerView = ruler
        scrollView.hasVerticalRuler = true
        scrollView.rulersVisible = true
        textView.lineNumberRuler = ruler

        let coordinator = context.coordinator
        coordinator.isApplyingUpdate = true
        textView.replaceAllText(with: text)
        textView.undoManager?.removeAllActions()
        textView.setSelectedRange(SQLEditing.clamp(selectedRange, to: textStorage.length))
        coordinator.isApplyingUpdate = false

        textView.onRun = { [weak coordinator] scope in
            coordinator?.parent.onRun(scope)
        }
        applyProperties(to: textView)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        guard let textView = scrollView.documentView as? SQLTextView, let textStorage = textView.textStorage else { return }

        coordinator.isApplyingUpdate = true
        defer { coordinator.isApplyingUpdate = false }

        if textView.string != text {
            textView.replaceAllText(with: text)
        }
        let selection = SQLEditing.clamp(selectedRange, to: textStorage.length)
        if textView.selectedRange() != selection {
            textView.setSelectedRange(selection)
        }
        applyProperties(to: textView)
    }

    private func applyProperties(to textView: SQLTextView) {
        textView.isEditable = isEditable
        textView.isSelectable = true
        textView.completionProvider = completionProvider
        textView.setFontSize(fontSize)
        textView.setErrorMarker(errorMarker)
    }

    // MARK: - Coordinator

    /// Bridges `NSTextViewDelegate` callbacks to the bindings, ignoring the ones caused by
    /// `updateNSView` itself.
    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: SQLEditorView
        /// True while `updateNSView` pushes SwiftUI state into the text view.
        var isApplyingUpdate = false

        init(parent: SQLEditorView) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard !isApplyingUpdate, let textView = notification.object as? NSTextView else { return }
            let current = textView.string
            if parent.text != current {
                parent.text = current
            }
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !isApplyingUpdate, let textView = notification.object as? NSTextView else { return }
            let range = textView.selectedRange()
            if parent.selectedRange != range {
                parent.selectedRange = range
            }
        }
    }
}

// MARK: - Preview

@MainActor
private final class PreviewCompletionProvider: SQLCompletionProviding {
    static let shared = PreviewCompletionProvider()

    private let tables = ["users", "user_roles", "orders", "order_items", "products"]
    private let columns = ["id", "name", "email", "created_at", "updated_at"]

    func completions(prefix: String, qualifier: String?) -> [SQLCompletion] {
        let lowered = prefix.lowercased()
        if qualifier != nil {
            return columns.filter { $0.hasPrefix(lowered) }.map { SQLCompletion(text: $0, kind: .column, detail: "text") }
        }
        let keywords = SQLKeywords.all.sorted().filter { $0.hasPrefix(lowered) }
            .prefix(8).map { SQLCompletion(text: $0.uppercased(), kind: .keyword) }
        let matchingTables = tables.filter { $0.hasPrefix(lowered) }.map { SQLCompletion(text: $0, kind: .table, detail: "public") }
        return matchingTables + keywords
    }
}

private let previewSample = """
-- Active users created this year
SELECT u.id, u.name, count(o.id) AS orders, $1 AS batch
FROM public.users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at >= '2026-01-01' /* inclusive */
  AND "Status" = 'active'
GROUP BY u.id, u.name
ORDER BY orders DESC
LIMIT 100;

SELECT * FROM userz;
"""

#Preview("SQL editor") {
    @Previewable @State var text = previewSample
    @Previewable @State var selection = NSRange(location: 0, length: 0)
    let errorRange = (previewSample as NSString).range(of: "userz")
    SQLEditorView(
        text: $text,
        selectedRange: $selection,
        completionProvider: PreviewCompletionProvider.shared,
        errorMarker: SQLErrorMarker(location: errorRange.location, length: errorRange.length, message: "relation \"userz\" does not exist"),
        fontSize: 13,
        onRun: { _ in }
    )
    .frame(width: 640, height: 380)
}
