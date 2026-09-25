import SwiftUI
import TableCore

/// App preferences window.
struct SettingsView: View {
    @AppStorage(PreferenceKey.appearance) private var appearance = AppearanceSetting.system
    @AppStorage(PreferenceKey.pageSize) private var pageSize = PreferenceDefaults.pageSize
    @AppStorage(PreferenceKey.queryRowLimit) private var queryRowLimit = PreferenceDefaults.queryRowLimit
    @AppStorage(PreferenceKey.editorFontSize) private var editorFontSize = PreferenceDefaults.editorFontSize
    @AppStorage(PreferenceKey.gridFontSize) private var gridFontSize = PreferenceDefaults.gridFontSize
    @AppStorage(PreferenceKey.restoreWorkspace) private var restoreWorkspace = PreferenceDefaults.restoreWorkspace
    @AppStorage(PreferenceKey.showSystemSchemas) private var showSystemSchemas = PreferenceDefaults.showSystemSchemas
    @AppStorage(PreferenceKey.confirmBeforeCommit) private var confirmBeforeCommit = PreferenceDefaults.confirmBeforeCommit

    var body: some View {
        TabView {
            Form {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppearanceSetting.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                Toggle("Reopen connections and tabs at launch", isOn: $restoreWorkspace)
                Toggle("Show system schemas (pg_catalog, information_schema)", isOn: $showSystemSchemas)
                Toggle("Show the SQL preview before committing changes", isOn: $confirmBeforeCommit)
            }
            .tabItem { Label("General", systemImage: "gearshape") }

            Form {
                Picker("Default rows per page", selection: $pageSize) {
                    ForEach(TableQuery.pageSizes, id: \.self) { Text("\($0)").tag($0) }
                }
                Picker("Query result limit", selection: $queryRowLimit) {
                    ForEach([200, 500, 1_000, 5_000, 10_000, 50_000], id: \.self) { Text("\($0) rows").tag($0) }
                }
                Text("Query tabs stop fetching after this many rows; browse tables with pagination for more.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .tabItem { Label("Data", systemImage: "tablecells") }

            Form {
                Slider(value: $editorFontSize, in: 10...20, step: 1) {
                    Text("Editor font size: \(Int(editorFontSize))")
                }
                Slider(value: $gridFontSize, in: 10...16, step: 1) {
                    Text("Grid font size: \(Int(gridFontSize))")
                }
            }
            .tabItem { Label("Editor", systemImage: "textformat.size") }
        }
        .formStyle(.grouped)
        .frame(width: 480, height: 260)
    }
}
