public import Foundation

/// TLS behaviour requested for a connection.
public enum SSLMode: String, Codable, CaseIterable, Sendable, Identifiable {
    case disable
    case require
    case verifyFull = "verify-full"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .disable: "Disabled"
        case .require: "Required (no verification)"
        case .verifyFull: "Verify full"
        }
    }

    /// Parses the `sslmode` values accepted by libpq, mapping the ones we do not
    /// support explicitly onto the closest supported mode.
    public init?(libpqValue: String) {
        switch libpqValue.lowercased() {
        case "disable", "allow": self = .disable
        case "prefer", "require", "verify-ca": self = .require
        case "verify-full": self = .verifyFull
        default: return nil
        }
    }
}

/// Accent colour used to tag a connection (production in red, staging in orange…).
public enum ProfileColor: String, Codable, CaseIterable, Sendable, Identifiable {
    case none
    case red
    case orange
    case yellow
    case green
    case teal
    case blue
    case purple
    case pink
    case gray

    public var id: String { rawValue }

    public var title: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }
}

/// A saved database connection. The password is never stored here; it lives in the keychain.
public struct ConnectionProfile: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var host: String
    public var port: Int
    public var database: String
    public var username: String
    public var sslMode: SSLMode
    public var color: ProfileColor
    public var group: String?
    public var createdAt: Date
    public var lastConnectedAt: Date?

    public static let defaultPort = 5432

    public init(
        id: UUID = UUID(),
        name: String = "",
        host: String = "localhost",
        port: Int = ConnectionProfile.defaultPort,
        database: String = "postgres",
        username: String = "postgres",
        sslMode: SSLMode = .disable,
        color: ProfileColor = .none,
        group: String? = nil,
        createdAt: Date = Date(),
        lastConnectedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.sslMode = sslMode
        self.color = color
        self.group = group
        self.createdAt = createdAt
        self.lastConnectedAt = lastConnectedAt
    }

    /// Name shown in the UI, falling back to `user@host/database` when the profile is unnamed.
    public var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "\(username)@\(host)/\(database)" : trimmed
    }

    /// Human readable endpoint, e.g. `db.example.com:5432/app`.
    public var endpointDescription: String {
        "\(host):\(port)/\(database)"
    }

    /// Problems that prevent the profile from being used for a connection.
    public var validationIssues: [String] {
        var issues: [String] = []
        if host.trimmingCharacters(in: .whitespaces).isEmpty { issues.append("Host is required.") }
        if !(1...65_535).contains(port) { issues.append("Port must be between 1 and 65535.") }
        if database.trimmingCharacters(in: .whitespaces).isEmpty { issues.append("Database is required.") }
        if username.trimmingCharacters(in: .whitespaces).isEmpty { issues.append("Username is required.") }
        return issues
    }

    public var isValid: Bool { validationIssues.isEmpty }
}
