import SwiftUI
import TableCore

/// Visual filter builder plus a raw WHERE field.
struct FilterBarView: View {
    @Bindable var model: TableTabModel
    let structure: TableStructure

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach($model.query.filters) { $filter in
                HStack(spacing: 6) {
                    Toggle("", isOn: $filter.isEnabled)
                        .labelsHidden()
                        .toggleStyle(.checkbox)
                        .onChange(of: filter.isEnabled) { _, _ in apply() }
                    Picker("Column", selection: $filter.column) {
                        ForEach(structure.columns) { column in
                            Text(column.name).tag(column.name)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 170)
                    Picker("Operator", selection: $filter.op) {
                        ForEach(FilterOperator.allCases) { op in
                            Text(op.title).tag(op)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 140)
                    .onChange(of: filter.op) { _, _ in if !filter.op.requiresValue { apply() } }
                    if filter.op.requiresValue {
                        TextField(valuePrompt(for: filter), text: $filter.value)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit(apply)
                    } else {
                        Spacer()
                    }
                    Button {
                        Task { await model.removeFilter(id: filter.id) }
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 6) {
                Text("WHERE").font(.caption.monospaced()).foregroundStyle(.secondary)
                TextField("raw SQL condition, e.g. created_at > now() - interval '1 day'", text: $model.query.rawWhere)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout.monospaced())
                    .onSubmit(apply)
                Button("Add Filter") { model.addFilter() }
                Button("Apply", action: apply)
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.glassProminent)
                if model.query.hasActiveFilters {
                    Button("Clear") { Task { await model.clearFilters() } }
                }
            }
        }
        .controlSize(.small)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.3))
    }

    private func apply() {
        Task { await model.applyFilters() }
    }

    private func valuePrompt(for filter: Filter) -> String {
        switch filter.op {
        case .isIn, .isNotIn: "comma separated values"
        case .like, .notLike, .iLike: "%pattern%"
        default: structure.column(named: filter.column)?.typeName ?? "value"
        }
    }
}
