public import Foundation

/// Persists a Codable value as pretty-printed JSON, writing atomically.
public actor JSONFileStore<Value: Codable & Sendable> {
    public let url: URL
    private let defaultValue: Value
    private var cached: Value?

    public init(url: URL, defaultValue: Value) {
        self.url = url
        self.defaultValue = defaultValue
    }

    public func load() throws -> Value {
        if let cached { return cached }
        guard FileManager.default.fileExists(atPath: url.path) else {
            cached = defaultValue
            return defaultValue
        }
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let value = try decoder.decode(Value.self, from: data)
        cached = value
        return value
    }

    public func save(_ value: Value) throws {
        cached = value
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    /// Loads, mutates and saves in one step.
    @discardableResult
    public func update<Result: Sendable>(_ mutate: @Sendable (inout Value) throws -> Result) throws -> Result {
        var value = try load()
        let result = try mutate(&value)
        try save(value)
        return result
    }
}

/// Locations of the app's data files.
public enum StorageLocations {
    public static let bundleIdentifier = "io.tableplusplus.app"

    /// `~/Library/Application Support/Table++`
    public static func applicationSupportDirectory(fileManager: FileManager = .default) -> URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Table++", isDirectory: true)
    }
}
