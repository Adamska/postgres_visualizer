import Foundation
import PostgresNIO
public import TableCore

extension DatabaseError {
    /// Translates driver errors into the app's error type, preserving server diagnostics.
    public init(_ error: any Error) {
        if let databaseError = error as? DatabaseError {
            self = databaseError
            return
        }
        if error is CancellationError {
            self.init(category: .cancelled, message: "The query was cancelled.")
            return
        }
        guard let psqlError = error as? PSQLError else {
            self.init(category: .connection, message: String(describing: error))
            return
        }

        switch psqlError.code {
        case .server:
            let info = psqlError.serverInfo
            let message = info?[.message] ?? "The server reported an error."
            let sqlState = info?[.sqlState]
            let category: DatabaseError.Category = sqlState?.hasPrefix("28") == true ? .authentication : .server
            self.init(
                category: category,
                message: message,
                detail: info?[.detail],
                hint: info?[.hint],
                sqlState: sqlState,
                position: info?[.position].flatMap { Int($0) }
            )
        case .queryCancelled:
            self.init(category: .cancelled, message: "The query was cancelled.")
        case .authMechanismRequiresPassword:
            self.init(category: .authentication, message: "The server requires a password.")
        case .unsupportedAuthMechanism:
            self.init(category: .authentication, message: "The server uses an unsupported authentication method.")
        case .sslUnsupported:
            self.init(category: .connection, message: "The server does not support TLS. Change the SSL mode to “Disabled”.")
        case .serverClosedConnection, .clientClosedConnection, .uncleanShutdown:
            self.init(category: .connection, message: "The connection was closed.")
        case .connectionError:
            let detail = psqlError.underlying.map { String(describing: $0) }
            self.init(category: .connection, message: "Could not connect to the server.", detail: detail)
        default:
            self.init(category: .connection, message: String(describing: psqlError), detail: psqlError.underlying.map { "\($0)" })
        }
    }
}
