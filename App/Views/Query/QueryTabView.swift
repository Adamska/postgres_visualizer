import SwiftUI
import TableCore

/// SQL editor on top, results below.
struct QueryTabView: View {
    @Environment(AppModel.self) private var appModel
    @AppStorage(PreferenceKey.editorFontSize) private var editorFontSize = PreferenceDefaults.editorFontSize
    @AppStorage(PreferenceKey.gridFontSize) private var gridFontSize = PreferenceDefaults.gridFontSize
    @Bindable var model: QueryTabModel
    @State private var showHistory = false
    @State private var showSaved = false
    @State private var showSaveDialog = false
    @State private var saveName = ""
    @State private var showExport = false

    var body: some View {
        VStack(spacing: 0) {
            QueryToolbar(model: model, showHistory: $showHistory, showSaved: $showSaved, onSave: { saveName = model.customTitle ?? ""; showSaveDialog = true })
            HairlineDivider()
            VSplitView {
                SQLEditorView(
                    text: $model.text,
                    selectedRange: $model.selectedRange,
                    completionProvider: model,
                    errorMarker: model.errorMarker,
                    fontSize: editorFontSize,
                    onRun: { scope in model.run(scope) }
                )
                .frame(minHeight: 120)
                QueryResultsView(model: model, gridFontSize: gridFontSize)
                    .frame(minHeight: 140)
            }
        }
        .popover(isPresented: $showHistory, arrowEdge: .bottom) {
            QueryHistoryPopover(connection: model.connection) { sql in insert(sql) }
        }
        .popover(isPresented: $showSaved, arrowEdge: .bottom) {
            SavedQueriesPopover { sql in insert(sql) }
        }
        .alert("Save Query", isPresented: $showSaveDialog) {
            TextField("Name", text: $saveName)
            Button("Save") { Task { try? await model.save(as: saveName) } }.disabled(saveName.isEmpty)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Saved queries are available from every connection.")
        }
        .sheet(isPresented: $showExport) {
            ExportSheet(title: "Export result", hasSelection: !model.selectedRows.isEmpty, defaultName: "result") { format, selectionOnly in
                model.exportText(format: format, selectionOnly: selectionOnly)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportRequested)) { _ in
            if appModel.selectedTab?.queryModel === model, model.selectedResult?.hasRows == true { showExport = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: .refreshRequested)) { _ in
            if appModel.selectedTab?.queryModel === model { model.run(.all) }
        }
    }

    private func insert(_ sql: String) {
        if model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            model.text = sql
        } else {
            model.text += "\n\n" + sql
        }
    }
}

private struct QueryToolbar: View {
    @Bindable var model: QueryTabModel
    @Binding var showHistory: Bool
    @Binding var showSaved: Bool
    var onSave: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button {
                model.run(.currentStatement)
            } label: {
                Label("Run", systemImage: "play.fill")
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(.glassProminent)
            .help("Run the selection or the statement under the caret (⌘↩)")
            .disabled(model.isRunning)

            Button { model.run(.all) } label: { Label("Run All", systemImage: "play.square.stack") }
                .help("Run every statement (⇧⌘↩)")
                .disabled(model.isRunning)

            Menu {
                Button("Explain") { model.explain(analyze: false) }
                Button("Explain Analyze") { model.explain(analyze: true) }
            } label: {
                Label("Explain", systemImage: "list.bullet.indent")
            }
            .menuIndicator(.hidden)
            .fixedSize()
            .disabled(model.isRunning)

            if model.isRunning {
                Button { model.cancel() } label: { Label("Stop", systemImage: "stop.fill") }
                    .help("Cancel the running query")
                ProgressView().controlSize(.small)
            }

            Divider().frame(height: 16)

            Button { showHistory.toggle() } label: { Label("History", systemImage: "clock") }
                .help("Query history")
            Button { showSaved.toggle() } label: { Label("Saved", systemImage: "bookmark") }
                .help("Saved queries")
            Button(action: onSave) { Label("Save", systemImage: "square.and.arrow.down") }
                .help("Save this query")
                .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            Spacer()

            if model.isInTransaction {
                Label("In transaction", systemImage: "arrow.triangle.branch")
                    .font(.caption)
                    .foregroundStyle(.orange)
                Button("Commit") { model.runDetached("COMMIT") }
                    .controlSize(.small)
                Button("Rollback") { model.runDetached("ROLLBACK") }
                    .controlSize(.small)
            }
            Text("Limit \(model.rowLimit)")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .help("Row limit for query results, configurable in Settings")
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }
}

/// Result tabs, grid, plan text and status line.
private struct QueryResultsView: View {
    @Environment(AppModel.self) private var appModel
    @Bindable var model: QueryTabModel
    let gridFontSize: Double

    var body: some View {
        VStack(spacing: 0) {
            if model.results.count > 1 {
                Picker("Result", selection: $model.selectedResultIndex) {
                    ForEach(model.results.indices, id: \.self) { index in
                        Text(resultTitle(model.results[index], index: index)).tag(index)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .controlSize(.small)
                .padding(8)
            }
            if let error = model.error {
                ErrorBanner(error: error)
            }
            content
            HairlineDivider()
            statusBar
        }
    }

    @ViewBuilder private var content: some View {
        if let result = model.selectedResult, result.hasRows {
            if isPlan(result) {
                ScrollView {
                    Text(result.rows.compactMap { $0.first?.stringValue }.joined(separator: "\n"))
                        .font(.callout.monospaced())
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                }
            } else {
                DataGridView(
                    content: model.gridContent,
                    sort: nil,
                    hiddenColumnIDs: model.hiddenColumnIDs,
                    focusedCell: model.focusedCell,
                    fontSize: gridFontSize,
                    actions: gridActions
                )
            }
        } else if let result = model.selectedResult {
            EmptyStateView(systemImage: "checkmark.circle", title: result.summary, message: result.hasRows ? nil : "The statement returned no rows.")
        } else if model.error == nil {
            EmptyStateView(systemImage: "terminal", title: "Run a query", message: "⌘↩ runs the statement under the caret. ⇧⌘↩ runs everything.")
        } else {
            Spacer()
        }
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            if let message = model.statusMessage {
                Text(message).font(.caption).foregroundStyle(.secondary)
            } else if let result = model.selectedResult {
                Text(result.summary).font(.caption).foregroundStyle(.secondary)
            }
            if model.selectedResult?.isTruncated == true {
                Label("Only the first \(model.rowLimit) rows are shown", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            Spacer()
            if !model.selectedRows.isEmpty {
                Text("\(model.selectedRows.count) selected").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .frame(height: 24)
        .background(.bar)
    }

    private var gridActions: GridActions {
        var actions = GridActions()
        actions.onSelectionChange = { rows, focused in
            model.selectedRows = rows
            model.focusedCell = focused
        }
        actions.onToggleColumnVisibility = { columnID in
            if model.hiddenColumnIDs.contains(columnID) { model.hiddenColumnIDs.remove(columnID) } else { model.hiddenColumnIDs.insert(columnID) }
        }
        return actions
    }

    private func isPlan(_ result: QueryResult) -> Bool {
        result.columns.count == 1 && result.columns[0].name == "QUERY PLAN"
    }

    private func resultTitle(_ result: QueryResult, index: Int) -> String {
        let keyword = SQLStatementKind.leadingKeywords(of: result.statement, limit: 1).first?.uppercased() ?? "Result"
        return "\(index + 1) · \(keyword)"
    }
}
