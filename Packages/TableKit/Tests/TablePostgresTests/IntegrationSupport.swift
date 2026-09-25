import Foundation
import Testing
@testable import TableCore
@testable import TablePostgres

/// Shared helpers for tests that need a live server (see docker-compose.yml).
enum Integration {
    static let databaseURL = ProcessInfo.processInfo.environment["TABLEPP_TEST_DATABASE_URL"]
    static var isAvailable: Bool { databaseURL != nil }

    static func connect() async throws -> PostgresSession {
        let parsed = try ConnectionURLParser.parse(try #require(databaseURL))
        let session = try await PostgresDriver().connect(to: parsed.profile, password: parsed.password)
        return try #require(session as? PostgresSession)
    }
}
