import SwiftUI
import TableCore
import UniformTypeIdentifiers

/// Imports a CSV file into a table: pick the file, map columns, run in one transaction.
struct CSVImportSheet: View {
    @Environment(\.dismiss) private var dismiss
    let structure: TableStructure
    let connection: ConnectionModel
    var onImported: () async -> Void

    @State private var document: CSVDocument?
    @State private var fileName = ""
    @State private var plan: CSVImportPlan?
    @State private var hasHeader = true
    @State private var nullRepresentation = ""
    @State private var rawText = ""
    @State private var delimiter: Character = ","
    @State private var isImporting = false
    @State private var error: DatabaseError?
    @State private var importedCount: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Import CSV into \(structure.ref.description)").font(.headline)
            HStack {
                Button("Choose File…", action: chooseFile)
                Text(fileName.isEmpty ? "No file selected" : fileName).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Toggle("First row is a header", isOn: $hasHeader).toggleStyle(.checkbox)
                    .onChange(of: hasHeader) { _, _ in reparse() }
                Picker("Delimiter", selection: $delimiter) {
                    Text("Comma").tag(Character(","))
                    Text("Semicolon").tag(Character(";"))
                    Text("Tab").tag(Character("\t"))
                    Text("Pipe").tag(Character("|"))
                }
                .fixedSize()
                .onChange(of: delimiter) { _, _ in reparse() }
            }
            .controlSize(.small)

            if let document, let plan {
                mapping(document: document, plan: plan)
                preview(document: document)
            } else {
                Spacer()
                Text("Choose a CSV file to map its columns onto the table.").foregroundStyle(.secondary).frame(maxWidth: .infinity)
                Spacer()
            }

            if let error {
                ErrorBanner(error: error)
            }
            if let importedCount {
                Label("Imported \(ValueFormatting.rowCount(importedCount)).", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            }

            HStack {
                TextField("NULL marker", text: $nullRepresentation, prompt: Text("Text treated as NULL (empty by default)"))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 260)
                    .controlSize(.small)
                Spacer()
                Button(importedCount == nil ? "Cancel" : "Close") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Import") { Task { await runImport() } }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.glassProminent)
                    .disabled(plan?.activeMappings.isEmpty ?? true || isImporting || importedCount != nil)
            }
        }
        .padding(20)
        .frame(width: 720, height: 560)
    }

    private func mapping(document: CSVDocument, plan: CSVImportPlan) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Column mapping").font(.subheadline.weight(.semibold))
            ScrollView {
                VStack(spacing: 4) {
                    ForEach(plan.mappings) { mapping in
                        HStack {
                            Text(mapping.csvColumn).font(.callout.monospaced()).frame(width: 220, alignment: .leading).lineLimit(1)
                            Image(systemName: "arrow.right").foregroundStyle(.tertiary)
                            Picker("Target", selection: binding(for: mapping.csvColumn)) {
                                Text("Skip").tag(String?.none)
                                ForEach(structure.columns.filter(\.isWritable)) { column in
                                    Text("\(column.name)  (\(column.typeName))").tag(String?.some(column.name))
                                }
                            }
                            .labelsHidden()
                        }
                    }
                }
            }
            .frame(maxHeight: 180)
            .controlSize(.small)
        }
    }

    private func preview(document: CSVDocument) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Preview · \(ValueFormatting.rowCount(document.rows.count)) in file").font(.subheadline.weight(.semibold))
            ScrollView([.horizontal, .vertical]) {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 3) {
                    SwiftUI.GridRow {
                        ForEach(document.header, id: \.self) { Text($0).font(.caption.weight(.semibold)) }
                    }
                    ForEach(Array(document.rows.prefix(8).enumerated()), id: \.offset) { _, row in
                        SwiftUI.GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, field in
                                Text(field.isEmpty ? "∅" : field).font(.caption.monospaced()).lineLimit(1).foregroundStyle(field.isEmpty ? .tertiary : .primary)
                            }
                        }
                    }
                }
                .padding(8)
            }
            .frame(maxHeight: 150)
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func binding(for csvColumn: String) -> Binding<String?> {
        Binding(
            get: { plan?.mappings.first { $0.csvColumn == csvColumn }?.tableColumn },
            set: { target in
                guard let index = plan?.mappings.firstIndex(where: { $0.csvColumn == csvColumn }) else { return }
                plan?.mappings[index].tableColumn = target
            }
        )
    }

    private func chooseFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.commaSeparatedText, .tabSeparatedText, .plainText]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            rawText = try String(contentsOf: url, encoding: .utf8)
            fileName = url.lastPathComponent
            delimiter = CSVReader.detectDelimiter(in: rawText)
            importedCount = nil
            reparse()
        } catch {
            self.error = DatabaseError(category: .unsupported, message: "Could not read the file: \(error.localizedDescription)")
        }
    }

    private func reparse() {
        guard !rawText.isEmpty else { return }
        let parsed = CSVReader.parse(rawText, options: CSVOptions(delimiter: delimiter, hasHeader: hasHeader))
        document = parsed
        plan = CSVImportPlan.automatic(document: parsed, structure: structure)
    }

    private func runImport() async {
        guard let document, var plan else { return }
        plan.nullRepresentation = nullRepresentation
        isImporting = true
        error = nil
        defer { isImporting = false }
        do {
            _ = try await connection.executeTransaction(plan.statements(for: document))
            importedCount = document.rows.count
            await onImported()
        } catch {
            self.error = DatabaseError(error)
        }
    }
}
