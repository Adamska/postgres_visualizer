import AppKit
import TableCore

/// Fonts, metrics and colours used by the data grid. A new instance is created whenever the
/// grid font size changes so cells never allocate fonts themselves.
struct DataGridStyle {
    // MARK: Metrics

    /// Width of the row-number gutter column.
    static let gutterWidth: CGFloat = 44
    /// Horizontal padding between a cell edge and its text.
    static let cellPadding: CGFloat = 6
    /// Default column widths never exceed this value.
    static let maximumDefaultWidth: CGFloat = 400
    /// The narrowest a user can make a column.
    static let minimumColumnWidth: CGFloat = 40
    /// Stroke width of the focused-cell border.
    static let focusBorderWidth: CGFloat = 1.5
    /// Corner radius of the focused-cell border and the inline editor.
    static let focusCornerRadius: CGFloat = 3
    /// Point size of the primary key symbol in headers.
    static let keySymbolPointSize: CGFloat = 9

    /// Font size the style was built for.
    let fontSize: CGFloat
    /// Regular cell font (system font with monospaced digits).
    let font: NSFont
    /// Font used for NULL and DEFAULT placeholders.
    let italicFont: NSFont
    /// Row height derived from the font size (24 at 12pt).
    let rowHeight: CGFloat
    /// Height of a single-line label using `font`, used to centre labels vertically.
    let textHeight: CGFloat

    @MainActor
    init(fontSize: CGFloat) {
        let size = max(8, fontSize)
        let font = NSFont.monospacedDigitSystemFont(ofSize: size, weight: .regular)
        self.fontSize = size
        self.font = font
        italicFont = Self.italicVariant(of: font)
        rowHeight = (size * 2).rounded()
        let probe = NSTextField(labelWithString: "Xg")
        probe.font = font
        textHeight = ceil(probe.intrinsicContentSize.height)
    }

    // MARK: Column widths

    /// Default width of a column for values of the given kind.
    static func defaultWidth(for kind: ValueKind) -> CGFloat {
        let width: CGFloat = switch kind {
        case .boolean, .integer: 90
        case .uuid: 260
        case .timestamp: 200
        default: 160
        }
        return min(width, maximumDefaultWidth)
    }

    // MARK: Colours

    /// Background tint of cells with a staged value.
    static var modifiedCellTint: NSColor { NSColor.systemOrange.withAlphaComponent(0.18) }
    /// Background tint of rows staged for deletion.
    static var deletedRowTint: NSColor { NSColor.systemRed.withAlphaComponent(0.12) }
    /// Background tint of rows staged for insertion.
    static var insertedRowTint: NSColor { NSColor.systemGreen.withAlphaComponent(0.12) }
    /// Colour of the vertical grid lines.
    static var gridLineColor: NSColor { NSColor.separatorColor.withAlphaComponent(0.5) }
    /// Border colour of the focused cell and of the inline editor.
    static var focusBorderColor: NSColor { .controlAccentColor }
    /// Text colour of regular values.
    static var primaryTextColor: NSColor { .labelColor }
    /// Text colour of NULL, DEFAULT and row numbers.
    static var secondaryTextColor: NSColor { .secondaryLabelColor }
    /// Text colour inside a selected, emphasized row.
    static var selectedTextColor: NSColor { .alternateSelectedControlTextColor }
    /// Secondary text colour inside a selected, emphasized row.
    static var selectedSecondaryTextColor: NSColor { NSColor.alternateSelectedControlTextColor.withAlphaComponent(0.75) }

    // MARK: Header

    /// Font used for column titles.
    static var headerFont: NSFont { .systemFont(ofSize: 11, weight: .medium) }
    /// Colour used for column titles.
    static var headerTextColor: NSColor { .headerTextColor }

    // MARK: Private

    private static func italicVariant(of font: NSFont) -> NSFont {
        let converted = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask)
        if converted != font {
            return converted
        }
        let descriptor = font.fontDescriptor.withSymbolicTraits(.italic)
        return NSFont(descriptor: descriptor, size: font.pointSize) ?? font
    }
}
