import SwiftUI
import TableCore

/// Shown when no connection is open: quick access to saved profiles.
struct WelcomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Image(systemName: "cylinder.split.1x2")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(.tint)
                Text("Table++")
                    .font(.largeTitle.weight(.semibold))
                Text("Connect to a PostgreSQL database to browse, query and edit its tables.")
                    .foregroundStyle(.secondary)
            }
            if model.profiles.isEmpty {
                Button {
                    NotificationCenter.default.post(name: .newConnectionRequested, object: nil)
                } label: {
                    Label("New Connection", systemImage: "plus")
                        .padding(.horizontal, 8)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
            } else {
                VStack(spacing: 6) {
                    ForEach(model.profiles.sorted(by: Self.recentFirst)) { profile in
                        HStack(spacing: 10) {
                            ProfileColorDot(color: profile.color, size: 10)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(profile.displayName).font(.body.weight(.medium))
                                Text(profile.endpointDescription).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "arrow.right.circle").foregroundStyle(.tint)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(width: 360)
                        .contentShape(Rectangle())
                        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 12))
                        .onTapGesture { Task { await model.connect(profile) } }
                    }
                    Button("New Connection…") {
                        NotificationCenter.default.post(name: .newConnectionRequested, object: nil)
                    }
                    .buttonStyle(.link)
                    .padding(.top, 6)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }

    private static func recentFirst(_ lhs: ConnectionProfile, _ rhs: ConnectionProfile) -> Bool {
        (lhs.lastConnectedAt ?? .distantPast) > (rhs.lastConnectedAt ?? .distantPast)
    }
}
