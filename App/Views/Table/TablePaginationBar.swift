import SwiftUI
import TableCore

/// Footer with the page size, row range and paging controls.
struct TablePaginationBar: View {
    @Bindable var model: TableTabModel

    var body: some View {
        HStack(spacing: 10) {
            Picker("Rows per page", selection: $model.query.pageSize) {
                ForEach(TableQuery.pageSizes, id: \.self) { size in
                    Text("\(size) rows").tag(size)
                }
            }
            .labelsHidden()
            .fixedSize()
            .onChange(of: model.query.pageSize) { _, _ in Task { await model.load() } }

            if let duration = model.lastLoadDuration {
                Text(ValueFormatting.duration(duration))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }
            if model.isLoading {
                ProgressView().controlSize(.mini)
            }

            Spacer()

            if !model.selectedRows.isEmpty {
                Text("\(model.selectedRows.count) selected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(model.pageRange)
                .font(.callout.monospacedDigit())
                .foregroundStyle(.secondary)

            HStack(spacing: 2) {
                Button {
                    Task { await model.goToPreviousPage() }
                } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled(!model.canGoToPreviousPage)
                Text("Page \(model.query.page + 1)")
                    .font(.callout.monospacedDigit())
                    .frame(minWidth: 60)
                Button {
                    Task { await model.goToNextPage() }
                } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled(!model.canGoToNextPage)
            }
            .buttonStyle(.borderless)
        }
        .controlSize(.small)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.bar)
    }
}
