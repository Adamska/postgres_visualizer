import AppKit
import TableCore

/// Colours and fonts used by the SQL editor. Every colour is dynamic, so it follows the
/// light/dark appearance of the window it is drawn in.
enum SQLEditorTheme {
    // MARK: - Token colours

    static let keyword = dynamic("sqlKeyword", light: 0x5A3E_C6, dark: 0xB4A0_FF)
    static let string = dynamic("sqlString", light: 0xC41A_16, dark: 0xFF7B_72)
    static let number = dynamic("sqlNumber", light: 0x0550_AE, dark: 0x79B8_FF)
    static let comment = dynamic("sqlComment", light: 0x6E77_81, dark: 0x8B94_9E)
    static let quotedIdentifier = dynamic("sqlQuotedIdentifier", light: 0x0072_7E, dark: 0x56D4_DD)
    static let parameter = dynamic("sqlParameter", light: 0x9A2D_B8, dark: 0xE2A8_F5)
    static let plain = NSColor.labelColor
    static let error = NSColor.systemRed

    /// Foreground colour for a token kind.
    static func color(for kind: SQLToken.Kind) -> NSColor {
        switch kind {
        case .keyword: keyword
        case .string: string
        case .number: number
        case .comment: comment
        case .quotedIdentifier: quotedIdentifier
        case .parameter: parameter
        case .identifier, .whitespace, .punctuation, .op: plain
        }
    }

    // MARK: - Fonts and metrics

    /// Line height relative to the font's natural line height.
    static let lineHeightMultiple: CGFloat = 1.25
    /// Inset between the text and the edges of the editor.
    static let textInset = NSSize(width: 8, height: 8)

    static func font(size: CGFloat) -> NSFont {
        NSFont.monospacedSystemFont(ofSize: size, weight: .regular)
    }

    static func boldFont(size: CGFloat) -> NSFont {
        NSFont.monospacedSystemFont(ofSize: size, weight: .bold)
    }

    /// Italic variant of the monospaced font, falling back to the regular face when the
    /// system font has no italic.
    static func italicFont(size: CGFloat) -> NSFont {
        let regular = font(size: size)
        let descriptor = regular.fontDescriptor.withSymbolicTraits(.italic)
        return NSFont(descriptor: descriptor, size: size) ?? regular
    }

    static func paragraphStyle() -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineHeightMultiple = lineHeightMultiple
        style.lineBreakMode = .byWordWrapping
        return style
    }

    // MARK: - Helpers

    private static func dynamic(_ name: String, light: Int, dark: Int) -> NSColor {
        NSColor(name: NSColor.Name(name)) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light)
        }
    }
}

extension NSColor {
    /// Opaque sRGB colour from a `0xRRGGBB` literal.
    convenience init(hex: Int) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
