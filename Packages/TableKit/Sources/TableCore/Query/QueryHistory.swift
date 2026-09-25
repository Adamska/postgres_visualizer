public import Foundation

/// A query the user ran, kept for the history panel.
public struct QueryHistoryEntry: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var profileID: UUID
    public var sql: String
    public var executedAt: Date
    public var duration: Duration
    public var succeeded: Bool
    public var rowCount: Int?

    public init(
        id: UUID = UUID(),
        profileID: UUID,
        sql: String,
        executedAt: Date = Date(),
        duration: Duration,
        succeeded: Bool,
        rowCount: Int? = nil
    ) {
        self.id = id
        self.profileID = profileID
        self.sql = sql
        self.executedAt = executedAt
        self.duration = duration
        self.succeeded = succeeded
        self.rowCount = rowCount
    }
}

/// A query the user chose to keep, optionally bound to a profile.
public struct SavedQuery: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var name: String
    public var sql: String
    public var profileID: UUID?
    public var createdAt: Date
    public var updatedAt: Date

    public init(id: UUID = UUID(), name: String, sql: String, profileID: UUID? = nil, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.name = name
        self.sql = sql
        self.profileID = profileID
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
