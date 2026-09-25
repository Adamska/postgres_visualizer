import Foundation
import TableCore

/// A completion proposal shown by the SQL editor.
struct SQLCompletion: Hashable, Identifiable, Sendable {
    enum Kind: Hashable, Sendable {
        case keyword
        case schema
        case table
        case view
        case column
        case function
        case snippet
    }

    var text: String
    var kind: Kind
    /// Extra context shown dimmed next to the item, e.g. the column type or the table name.
    var detail: String?

    var id: String { "\(kind)-\(text)-\(detail ?? "")" }

    init(text: String, kind: Kind, detail: String? = nil) {
        self.text = text
        self.kind = kind
        self.detail = detail
    }
}

/// Supplies completions for the current word. Implemented by the query tab model using the
/// connection's schema cache.
@MainActor
protocol SQLCompletionProviding: AnyObject {
    /// `prefix` is the partial word under the caret; `qualifier` is the identifier before a dot
    /// (`users.` → "users"), when present.
    func completions(prefix: String, qualifier: String?) -> [SQLCompletion]
}

/// How much of the editor content to execute.
enum SQLRunScope: Hashable, Sendable {
    /// The selection if any, otherwise the statement under the caret.
    case currentStatement
    /// Every statement in the editor.
    case all
}

/// Character range (in UTF-16 units, as `NSRange`) to underline as an error.
struct SQLErrorMarker: Hashable, Sendable {
    var location: Int
    var length: Int
    var message: String
}
