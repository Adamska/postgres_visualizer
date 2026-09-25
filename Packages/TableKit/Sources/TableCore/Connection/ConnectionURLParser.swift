public import Foundation

/// Result of parsing a `postgres://` URL: the profile plus the password when the URL embeds one.
public struct ParsedConnectionURL: Sendable, Equatable {
    public var profile: ConnectionProfile
    public var password: String?

    public init(profile: ConnectionProfile, password: String?) {
        self.profile = profile
        self.password = password
    }
}

public enum ConnectionURLError: Error, Equatable, LocalizedError {
    case malformed
    case unsupportedScheme(String)

    public var errorDescription: String? {
        switch self {
        case .malformed: "The connection URL could not be parsed."
        case .unsupportedScheme(let scheme): "Unsupported URL scheme “\(scheme)”. Expected postgres:// or postgresql://."
        }
    }
}

/// Parses libpq style connection URLs such as
/// `postgresql://user:secret@host:5432/dbname?sslmode=require`.
public enum ConnectionURLParser {
    public static func parse(_ string: String) throws -> ParsedConnectionURL {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed) else { throw ConnectionURLError.malformed }
        guard let scheme = components.scheme?.lowercased() else { throw ConnectionURLError.malformed }
        guard scheme == "postgres" || scheme == "postgresql" else {
            throw ConnectionURLError.unsupportedScheme(scheme)
        }

        var profile = ConnectionProfile()
        profile.host = components.host?.removingPercentEncoding ?? "localhost"
        if profile.host.isEmpty { profile.host = "localhost" }
        profile.port = components.port ?? ConnectionProfile.defaultPort
        if let user = components.user, !user.isEmpty { profile.username = user }

        let path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !path.isEmpty { profile.database = path }

        for item in components.queryItems ?? [] {
            guard let value = item.value else { continue }
            switch item.name.lowercased() {
            case "sslmode":
                if let mode = SSLMode(libpqValue: value) { profile.sslMode = mode }
            case "dbname":
                profile.database = value
            case "user":
                profile.username = value
            case "host":
                profile.host = value
            case "port":
                if let port = Int(value) { profile.port = port }
            default:
                break
            }
        }

        profile.name = "\(profile.username)@\(profile.host)"
        return ParsedConnectionURL(profile: profile, password: components.password)
    }

    /// Builds a URL for the profile, omitting the password.
    public static func url(for profile: ConnectionProfile) -> String {
        var components = URLComponents()
        components.scheme = "postgresql"
        components.user = profile.username
        components.host = profile.host
        components.port = profile.port
        components.path = "/" + profile.database
        components.queryItems = [URLQueryItem(name: "sslmode", value: profile.sslMode.rawValue)]
        return components.string ?? ""
    }
}
