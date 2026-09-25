import SwiftUI
import TableCore

/// Create or edit a connection profile, with a connection test.
struct ConnectionFormView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var profile: ConnectionProfile
    @State var password: String
    let isNew: Bool

    @State private var urlField = ""
    @State private var testState = TestState.idle
    @State private var showDeleteConfirmation = false

    private enum TestState: Equatable {
        case idle
        case testing
        case success(String)
        case failure(String)
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    TextField("Name", text: $profile.name, prompt: Text("Production, Local…"))
                    HStack {
                        Picker("Color", selection: $profile.color) {
                            ForEach(ProfileColor.allCases) { color in
                                Label {
                                    Text(color.title)
                                } icon: {
                                    ProfileColorDot(color: color, size: 10)
                                }
                                .tag(color)
                            }
                        }
                        TextField("Group", text: Binding($profile.group, replacingNilWith: ""), prompt: Text("Optional"))
                    }
                }
                Section("Server") {
                    HStack {
                        TextField("Host", text: $profile.host)
                        TextField("Port", value: $profile.port, format: .number.grouping(.never))
                            .frame(width: 80)
                    }
                    TextField("Database", text: $profile.database)
                    TextField("User", text: $profile.username)
                    SecureField("Password", text: $password)
                    Picker("SSL", selection: $profile.sslMode) {
                        ForEach(SSLMode.allCases) { mode in Text(mode.title).tag(mode) }
                    }
                }
                Section("Import from URL") {
                    HStack {
                        TextField("URL", text: $urlField, prompt: Text("postgresql://user:password@host:5432/database"))
                            .labelsHidden()
                            .textFieldStyle(.roundedBorder)
                            .font(.callout.monospaced())
                        Button("Apply") { applyURL() }
                            .disabled(urlField.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .formStyle(.grouped)

            HairlineDivider()
            footer
                .padding(12)
        }
        .frame(width: 520, height: isNew ? 560 : 590)
        .navigationTitle(isNew ? "New Connection" : "Edit Connection")
        .confirmationDialog("Delete “\(profile.displayName)”?", isPresented: $showDeleteConfirmation) {
            Button("Delete Connection", role: .destructive) {
                Task {
                    await model.deleteProfile(id: profile.id)
                    dismiss()
                }
            }
        } message: {
            Text("The saved password is removed from the keychain as well.")
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if !isNew {
                Button("Delete…", role: .destructive) { showDeleteConfirmation = true }
            }
            Button("Test Connection") { Task { await test() } }
                .disabled(!profile.isValid || testState == .testing)
            testStatus
            Spacer()
            Button("Cancel") { dismiss() }
                .keyboardShortcut(.cancelAction)
            Button(isNew ? "Save & Connect" : "Save") {
                Task {
                    await model.saveProfile(profile, password: password)
                    if isNew { await model.connect(profile) }
                    dismiss()
                }
            }
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.glassProminent)
            .disabled(!profile.isValid)
        }
    }

    @ViewBuilder private var testStatus: some View {
        switch testState {
        case .idle:
            EmptyView()
        case .testing:
            ProgressView().controlSize(.small)
        case .success(let version):
            Label("Connected · PostgreSQL \(version)", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.callout)
                .lineLimit(1)
        case .failure(let message):
            Label(message, systemImage: "xmark.octagon.fill")
                .foregroundStyle(.red)
                .font(.callout)
                .lineLimit(2)
                .help(message)
        }
    }

    private func applyURL() {
        do {
            let parsed = try ConnectionURLParser.parse(urlField)
            var updated = parsed.profile
            updated.id = profile.id
            updated.name = profile.name.isEmpty ? parsed.profile.name : profile.name
            updated.color = profile.color
            updated.group = profile.group
            updated.createdAt = profile.createdAt
            profile = updated
            if let parsedPassword = parsed.password { password = parsedPassword }
            urlField = ""
        } catch {
            testState = .failure(error.localizedDescription)
        }
    }

    func test() async {
        testState = .testing
        do {
            let session = try await model.environment.driver.connect(to: profile, password: password.isEmpty ? nil : password)
            let version = (try? await session.serverVersion()) ?? ""
            await session.close()
            testState = .success(version)
        } catch {
            testState = .failure(DatabaseError(error).message)
        }
    }
}

extension Binding where Value == String {
    /// Bridges an optional string to a non-optional text field binding.
    init(_ source: Binding<String?>, replacingNilWith placeholder: String) {
        self.init(
            get: { source.wrappedValue ?? placeholder },
            set: { source.wrappedValue = $0.isEmpty ? nil : $0 }
        )
    }
}
