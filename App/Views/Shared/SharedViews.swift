import SwiftUI
import TableCore

/// Coloured dot used for connection profiles.
struct ProfileColorDot: View {
    var color: ProfileColor
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(color.swiftUIColor ?? Color.secondary.opacity(0.35))
            .frame(width: size, height: size)
    }
}

extension ProfileColor {
    var swiftUIColor: Color? {
        switch self {
        case .none: nil
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .teal: .teal
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        case .gray: .gray
        }
    }
}

/// Centered placeholder with an icon, a title and an optional action.
struct EmptyStateView<Actions: View>: View {
    var systemImage: String
    var title: String
    var message: String?
    @ViewBuilder var actions: Actions

    init(systemImage: String, title: String, message: String? = nil, @ViewBuilder actions: () -> Actions = { EmptyView() }) {
        self.systemImage = systemImage
        self.title = title
        self.message = message
        self.actions = actions()
    }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(.tertiary)
            Text(title)
                .font(.title3.weight(.medium))
            if let message {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
            }
            actions
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

/// Inline error shown above grids and editors.
struct ErrorBanner: View {
    var error: DatabaseError
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 3) {
                Text(error.message)
                    .font(.callout.weight(.medium))
                    .textSelection(.enabled)
                if let detail = error.detail {
                    Text(detail).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                }
                if let hint = error.hint {
                    Text("Hint: \(hint)").font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                }
                if let sqlState = error.sqlState {
                    Text("SQLSTATE \(sqlState)").font(.caption2.monospaced()).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.red.opacity(0.25)))
        .padding([.horizontal, .top], 8)
    }
}

/// Thin horizontal separator used between toolbar rows and content.
struct HairlineDivider: View {
    var body: some View {
        Rectangle().fill(.separator).frame(height: 1)
    }
}
