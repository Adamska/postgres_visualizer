import SwiftUI

/// User preferences backed by `UserDefaults`, shared by SwiftUI views via `@AppStorage`.
enum PreferenceKey {
    static let appearance = "appearance"
    static let pageSize = "pageSize"
    static let queryRowLimit = "queryRowLimit"
    static let editorFontSize = "editorFontSize"
    static let gridFontSize = "gridFontSize"
    static let restoreWorkspace = "restoreWorkspace"
    static let showSystemSchemas = "showSystemSchemas"
    static let confirmBeforeCommit = "confirmBeforeCommit"
}

enum AppearanceSetting: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum PreferenceDefaults {
    static let pageSize = 200
    static let queryRowLimit = 1_000
    static let editorFontSize = 13.0
    static let gridFontSize = 12.0
    static let restoreWorkspace = true
    static let showSystemSchemas = false
    static let confirmBeforeCommit = true

    /// Registers defaults so `UserDefaults.standard` reads are consistent outside SwiftUI.
    static func register() {
        UserDefaults.standard.register(defaults: [
            PreferenceKey.appearance: AppearanceSetting.system.rawValue,
            PreferenceKey.pageSize: pageSize,
            PreferenceKey.queryRowLimit: queryRowLimit,
            PreferenceKey.editorFontSize: editorFontSize,
            PreferenceKey.gridFontSize: gridFontSize,
            PreferenceKey.restoreWorkspace: restoreWorkspace,
            PreferenceKey.showSystemSchemas: showSystemSchemas,
            PreferenceKey.confirmBeforeCommit: confirmBeforeCommit,
        ])
    }
}
