import AppKit
import Testing
@testable import TablePlusPlus

@MainActor
@Suite struct SQLEditorTests {
    // MARK: - Completion context

    @Test func wordContextSplitsQualifierAndPrefix() {
        let text = "select u.na"
        let context = SQLEditing.wordContext(in: text, caret: (text as NSString).length)
        #expect(context.prefix == "na")
        #expect(context.qualifier == "u")
        #expect(context.range == NSRange(location: 9, length: 2))
    }

    @Test func wordContextWithoutQualifier() {
        let context = SQLEditing.wordContext(in: "select us", caret: 9)
        #expect(context.prefix == "us")
        #expect(context.qualifier == nil)
        #expect(context.range == NSRange(location: 7, length: 2))
    }

    @Test func wordContextAfterSchemaDot() {
        let context = SQLEditing.wordContext(in: "from public.", caret: 12)
        #expect(context.prefix.isEmpty)
        #expect(context.qualifier == "public")
        #expect(context.range == NSRange(location: 12, length: 0))
    }

    @Test func wordContextWithQuotedQualifier() {
        let text = "select \"My Schema\".t"
        let context = SQLEditing.wordContext(in: text, caret: (text as NSString).length)
        #expect(context.prefix == "t")
        #expect(context.qualifier == "My Schema")
    }

    @Test func wordContextInMiddleOfWordUsesTextBeforeCaret() {
        let context = SQLEditing.wordContext(in: "select users", caret: 9)
        #expect(context.prefix == "us")
        #expect(context.range == NSRange(location: 7, length: 2))
    }

    @Test func keywordCaseFollowsPrefix() {
        #expect(SQLEditing.matchingCase(of: "Sel", in: "select") == "SELECT")
        #expect(SQLEditing.matchingCase(of: "sel", in: "SELECT") == "select")
        #expect(SQLEditing.matchingCase(of: "", in: "SELECT") == "SELECT")
    }

    // MARK: - Highlighting

    @Test func keywordsGetKeywordColourAndBoldFont() {
        let storage = NSTextStorage(string: "select 1 from users")
        let highlighter = SQLSyntaxHighlighter(textStorage: storage, fontSize: 13)
        highlighter.highlightNow()

        let keywordColor = storage.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? NSColor
        let keywordFont = storage.attribute(.font, at: 0, effectiveRange: nil) as? NSFont
        #expect(keywordColor == SQLEditorTheme.keyword)
        #expect(keywordFont == SQLEditorTheme.boldFont(size: 13))

        let numberColor = storage.attribute(.foregroundColor, at: 7, effectiveRange: nil) as? NSColor
        #expect(numberColor == SQLEditorTheme.number)

        let identifierColor = storage.attribute(.foregroundColor, at: 14, effectiveRange: nil) as? NSColor
        let identifierFont = storage.attribute(.font, at: 14, effectiveRange: nil) as? NSFont
        #expect(identifierColor == SQLEditorTheme.plain)
        #expect(identifierFont == SQLEditorTheme.font(size: 13))
    }

    @Test func editsAreRehighlightedThroughTheStorageDelegate() {
        let storage = NSTextStorage(string: "x")
        let highlighter = SQLSyntaxHighlighter(textStorage: storage, fontSize: 13)
        highlighter.highlightNow()
        storage.replaceCharacters(in: NSRange(location: 0, length: 1), with: "select 'text' -- note")

        let stringColor = storage.attribute(.foregroundColor, at: 7, effectiveRange: nil) as? NSColor
        let commentColor = storage.attribute(.foregroundColor, at: 14, effectiveRange: nil) as? NSColor
        #expect(stringColor == SQLEditorTheme.string)
        #expect(commentColor == SQLEditorTheme.comment)
    }

    @Test func errorMarkerIsUnderlinedWithTooltip() {
        let storage = NSTextStorage(string: "select * from userz")
        let highlighter = SQLSyntaxHighlighter(textStorage: storage, fontSize: 13)
        highlighter.errorMarker = SQLErrorMarker(location: 14, length: 500, message: "relation does not exist")
        highlighter.highlightNow()

        var effective = NSRange(location: 0, length: 0)
        let tooltip = storage.attribute(.toolTip, at: 14, effectiveRange: &effective) as? String
        #expect(tooltip == "relation does not exist")
        #expect(effective == NSRange(location: 14, length: 5))
        #expect(storage.attribute(.underlineStyle, at: 14, effectiveRange: nil) != nil)
        #expect(storage.attribute(.underlineStyle, at: 0, effectiveRange: nil) == nil)

        highlighter.errorMarker = nil
        highlighter.highlightNow()
        #expect(storage.attribute(.toolTip, at: 14, effectiveRange: nil) == nil)
    }

    // MARK: - Line commands

    @Test func toggleCommentAddsAndRemovesMarkers() {
        let text = "select 1\n  from t\n"
        let commented = SQLEditing.toggleLineComment(text, selection: NSRange(location: 0, length: 12))
        #expect(commented.range == NSRange(location: 0, length: 18))
        #expect(commented.replacement == "-- select 1\n--   from t\n")
        #expect(commented.selection == NSRange(location: 0, length: 24))

        let round = (text as NSString).replacingCharacters(in: commented.range, with: commented.replacement)
        let uncommented = SQLEditing.toggleLineComment(round, selection: commented.selection)
        #expect(uncommented.replacement == text)
    }

    @Test func toggleCommentKeepsBlankLinesAndCaret() {
        let text = "    select 1\n\n    from t"
        let edit = SQLEditing.toggleLineComment(text, selection: NSRange(location: 8, length: 0))
        #expect(edit.replacement == "    -- select 1\n")
        #expect(edit.selection == NSRange(location: 11, length: 0))

        let all = SQLEditing.toggleLineComment(text, selection: NSRange(location: 0, length: 24))
        #expect(all.replacement == "    -- select 1\n\n    -- from t")
    }

    @Test func toggleCommentIgnoresLineAfterTrailingNewlineInSelection() {
        let text = "a\nb\nc"
        let edit = SQLEditing.toggleLineComment(text, selection: NSRange(location: 0, length: 2))
        #expect(edit.replacement == "-- a\n")
    }

    @Test func indentAndOutdentLines() {
        let text = "select 1\n\nfrom t"
        let indented = SQLEditing.indent(text, selection: NSRange(location: 0, length: 16))
        #expect(indented.replacement == "    select 1\n\n    from t")
        #expect(indented.selection == NSRange(location: 0, length: 24))

        let outdented = SQLEditing.outdent(indented.replacement, selection: NSRange(location: 0, length: 24))
        #expect(outdented.replacement == text)

        let partial = SQLEditing.outdent("  x\n\ty", selection: NSRange(location: 0, length: 6))
        #expect(partial.replacement == "x\ny")
    }

    @Test func outdentKeepsCaretOnItsLine() {
        let edit = SQLEditing.outdent("    select", selection: NSRange(location: 2, length: 0))
        #expect(edit.replacement == "select")
        #expect(edit.selection == NSRange(location: 0, length: 0))

        let later = SQLEditing.outdent("    select", selection: NSRange(location: 8, length: 0))
        #expect(later.selection == NSRange(location: 4, length: 0))
    }

    @Test func newlineKeepsIndentation() {
        #expect(SQLEditing.newlineInsertion(in: "  select 1", caret: 10) == "\n  ")
        #expect(SQLEditing.newlineInsertion(in: "\tx\n    y", caret: 8) == "\n    ")
        #expect(SQLEditing.newlineInsertion(in: "    y", caret: 2) == "\n  ")
    }

    @Test func parenthesisAutoPairing() {
        #expect(SQLEditing.shouldAutoPairParenthesis(in: "count", selection: NSRange(location: 5, length: 0)))
        #expect(SQLEditing.shouldAutoPairParenthesis(in: "count x", selection: NSRange(location: 5, length: 0)))
        #expect(!SQLEditing.shouldAutoPairParenthesis(in: "countx", selection: NSRange(location: 5, length: 0)))
        #expect(!SQLEditing.shouldAutoPairParenthesis(in: "count", selection: NSRange(location: 0, length: 5)))
    }
}
