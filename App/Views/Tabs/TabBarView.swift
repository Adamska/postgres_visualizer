import SwiftUI

/// Horizontal strip of open tabs. Each chip shows its connection colour so tabs from several
/// connections can coexist.
struct TabBarView: View {
    @Environment(AppModel.self) private var model
    @State private var pendingClose: TabModel?

    var body: some View {
        HStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(model.tabs) { tab in
                            TabChip(tab: tab, isSelected: tab.id == model.selectedTabID) {
                                model.selectedTabID = tab.id
                            } onClose: {
                                requestClose(tab)
                            }
                            .id(tab.id)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                }
                .onChange(of: model.selectedTabID) { _, id in
                    if let id { withAnimation { proxy.scrollTo(id) } }
                }
            }
            Button {
                _ = model.newQueryTab()
            } label: {
                Image(systemName: "plus")
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("New query tab (⌘T)")
            .padding(.trailing, 8)
            .disabled(model.selectedConnection == nil)
        }
        .background(.bar)
        .confirmationDialog(
            "Close “\(pendingClose?.title ?? "")” and discard its pending changes?",
            isPresented: Binding(get: { pendingClose != nil }, set: { if !$0 { pendingClose = nil } })
        ) {
            Button("Discard and Close", role: .destructive) {
                if let tab = pendingClose { Task { await model.closeTab(id: tab.id) } }
            }
        }
    }

    private func requestClose(_ tab: TabModel) {
        if tab.hasUnsavedChanges {
            pendingClose = tab
        } else {
            Task { await model.closeTab(id: tab.id) }
        }
    }
}

private struct TabChip: View {
    @Environment(AppModel.self) private var model
    let tab: TabModel
    let isSelected: Bool
    var onSelect: () -> Void
    var onClose: () -> Void
    @State private var isHovering = false

    var body: some View {
        HStack(spacing: 6) {
            ProfileColorDot(color: tab.connection.profile.color, size: 6)
            Image(systemName: tab.systemImage)
                .font(.caption)
                .foregroundStyle(isSelected ? .primary : .secondary)
            Text(tab.title)
                .font(.callout)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: 200)
            if tab.hasUnsavedChanges {
                Circle().fill(.orange).frame(width: 6, height: 6)
            }
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .frame(width: 16, height: 16)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .opacity(isHovering || isSelected ? 1 : 0)
        }
        .padding(.leading, 10)
        .padding(.trailing, 6)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 7)
                .fill(isSelected ? Color.primary.opacity(0.08) : (isHovering ? Color.primary.opacity(0.04) : .clear))
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onSelect)
        .onHover { isHovering = $0 }
        .contextMenu {
            Button("Close Tab", action: onClose)
            Button("Close Other Tabs") { Task { await model.closeOtherTabs(except: tab.id) } }
            if let table = tab.tableModel {
                Divider()
                Button("Duplicate Tab") { model.openTable(table.query.table, on: tab.connection, filters: table.query.filters, reuseExisting: false) }
            }
        }
    }
}
