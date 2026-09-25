import SwiftUI
import TableCore

/// Read-only description of a table: columns, indexes and constraints.
struct StructureTabView: View {
    @Bindable var model: StructureTabModel

    var body: some View {
        Group {
            if let structure = model.structure {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header(structure)
                        columnsTable(structure)
                        if !structure.indexes.isEmpty { indexesTable(structure) }
                        if !structure.constraints.isEmpty { constraintsTable(structure) }
                    }
                    .padding(16)
                }
            } else if let error = model.error {
                ErrorBanner(error: error)
                Spacer()
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await model.load() }
        .toolbar {
            ToolbarItem {
                Button { Task { await model.load(forceReload: true) } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
            }
        }
    }

    private func header(_ structure: TableStructure) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(structure.ref.quoted).font(.title3.monospaced())
                Text(structure.kind.title)
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }
            if let comment = structure.comment {
                Text(comment).foregroundStyle(.secondary)
            }
        }
    }

    private func columnsTable(_ structure: TableStructure) -> some View {
        section("Columns", count: structure.columns.count) {
            Table(structure.columns) {
                TableColumn("Name") { column in
                    HStack(spacing: 4) {
                        if column.isPrimaryKey { Image(systemName: "key.fill").font(.caption2).foregroundStyle(.orange) }
                        Text(column.name).font(.body.monospaced())
                    }
                }
                TableColumn("Type") { Text($0.typeName).font(.body.monospaced()) }
                TableColumn("Nullable") { Text($0.isNullable ? "yes" : "no").foregroundStyle($0.isNullable ? .secondary : .primary) }
                TableColumn("Default") { column in
                    Text(column.isIdentity ? "identity" : (column.isGenerated ? "generated" : (column.defaultValue ?? "")))
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                }
                TableColumn("Comment") { Text($0.comment ?? "").foregroundStyle(.secondary) }
            }
            .frame(height: CGFloat(structure.columns.count) * 24 + 30)
        }
    }

    private func indexesTable(_ structure: TableStructure) -> some View {
        section("Indexes", count: structure.indexes.count) {
            Table(structure.indexes) {
                TableColumn("Name") { Text($0.name).font(.body.monospaced()) }
                TableColumn("Columns") { Text($0.columns.joined(separator: ", ")).font(.body.monospaced()) }
                TableColumn("Kind") { index in Text(index.isPrimary ? "primary" : (index.isUnique ? "unique" : "")) }
                TableColumn("Definition") { Text($0.definition).font(.callout.monospaced()).foregroundStyle(.secondary) }
            }
            .frame(height: CGFloat(structure.indexes.count) * 24 + 30)
        }
    }

    private func constraintsTable(_ structure: TableStructure) -> some View {
        section("Constraints", count: structure.constraints.count) {
            Table(structure.constraints) {
                TableColumn("Name") { Text($0.name).font(.body.monospaced()) }
                TableColumn("Kind") { Text($0.kind.title) }
                TableColumn("Definition") { Text($0.definition).font(.callout.monospaced()).foregroundStyle(.secondary) }
            }
            .frame(height: CGFloat(structure.constraints.count) * 24 + 30)
        }
    }

    private func section<Content: View>(_ title: String, count: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(title) · \(count)").font(.headline)
            content()
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}
