import SwiftUI

@main
struct TablePlusPlusApp: App {
    @State private var model: AppModel
    @AppStorage(PreferenceKey.appearance) private var appearance = AppearanceSetting.system

    init() {
        PreferenceDefaults.register()
        _model = State(initialValue: AppModel(environment: .live()))
    }

    var body: some Scene {
        WindowGroup {
            MainWindowView()
                .environment(model)
                .preferredColorScheme(appearance.colorScheme)
                .frame(minWidth: 960, minHeight: 600)
        }
        .windowStyle(.automatic)
        .windowToolbarStyle(.unified)
        .commands {
            AppCommands(model: model)
        }

        Settings {
            SettingsView()
                .preferredColorScheme(appearance.colorScheme)
        }
    }
}
