import Foundation
import Logging
import NIOCore
import NIOSSL
import PostgresNIO
public import TableCore

/// Opens `PostgresSession`s for connection profiles.
public struct PostgresDriver: DatabaseDriver {
    public static let applicationName = "Table++"

    private let logger = Logger(label: "io.tableplusplus.postgres")

    public init() {}

    public func connect(to profile: ConnectionProfile, password: String?) async throws -> any DatabaseSession {
        var configuration = PostgresConnection.Configuration(
            host: profile.host,
            port: profile.port,
            username: profile.username,
            password: password,
            database: profile.database,
            tls: try Self.tls(for: profile.sslMode)
        )
        configuration.options.connectTimeout = .seconds(15)
        configuration.options.additionalStartupParameters = [("application_name", Self.applicationName)]

        do {
            let connection = try await PostgresConnection.connect(
                configuration: configuration,
                id: Self.nextConnectionID(),
                logger: logger
            )
            let session = PostgresSession(connection: connection, profileID: profile.id, logger: logger)
            do {
                try await session.bootstrap()
            } catch {
                await session.close()
                throw error
            }
            return session
        } catch {
            throw DatabaseError(error)
        }
    }

    static func tls(for mode: SSLMode) throws -> PostgresConnection.Configuration.TLS {
        switch mode {
        case .disable:
            return .disable
        case .require:
            var tlsConfiguration = TLSConfiguration.makeClientConfiguration()
            tlsConfiguration.certificateVerification = .none
            return .require(try NIOSSLContext(configuration: tlsConfiguration))
        case .verifyFull:
            return .require(try NIOSSLContext(configuration: .makeClientConfiguration()))
        }
    }

    private static let connectionCounter = ConnectionCounter()

    private static func nextConnectionID() -> Int {
        connectionCounter.next()
    }
}

/// Thread-safe monotonically increasing connection identifiers, for logging.
private final class ConnectionCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func next() -> Int {
        lock.withLock {
            value += 1
            return value
        }
    }
}
