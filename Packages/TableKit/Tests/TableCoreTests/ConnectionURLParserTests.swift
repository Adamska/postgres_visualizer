import Testing
@testable import TableCore

@Suite("Connection URL parsing")
struct ConnectionURLParserTests {
    @Test("Parses a full libpq URL")
    func parsesFullURL() throws {
        let parsed = try ConnectionURLParser.parse("postgresql://alice:s%40cret@db.example.com:6543/app?sslmode=require")
        #expect(parsed.profile.username == "alice")
        #expect(parsed.password == "s@cret")
        #expect(parsed.profile.host == "db.example.com")
        #expect(parsed.profile.port == 6543)
        #expect(parsed.profile.database == "app")
        #expect(parsed.profile.sslMode == .require)
        #expect(parsed.profile.name == "alice@db.example.com")
    }

    @Test("Applies defaults for a minimal URL")
    func appliesDefaults() throws {
        let parsed = try ConnectionURLParser.parse("postgres://localhost")
        #expect(parsed.profile.host == "localhost")
        #expect(parsed.profile.port == 5432)
        #expect(parsed.profile.database == "postgres")
        #expect(parsed.profile.username == "postgres")
        #expect(parsed.password == nil)
        #expect(parsed.profile.sslMode == .disable)
    }

    @Test("Maps libpq ssl modes onto supported ones", arguments: [
        ("disable", SSLMode.disable), ("allow", .disable), ("prefer", .require),
        ("require", .require), ("verify-ca", .require), ("verify-full", .verifyFull),
    ])
    func mapsSSLModes(input: String, expected: SSLMode) throws {
        let parsed = try ConnectionURLParser.parse("postgres://h/db?sslmode=\(input)")
        #expect(parsed.profile.sslMode == expected)
    }

    @Test("Rejects other schemes")
    func rejectsOtherSchemes() {
        #expect(throws: ConnectionURLError.unsupportedScheme("mysql")) {
            try ConnectionURLParser.parse("mysql://localhost/db")
        }
    }

    @Test("Round trips a profile without its password")
    func roundTrips() throws {
        let profile = ConnectionProfile(name: "x", host: "h", port: 5433, database: "d", username: "u", sslMode: .verifyFull)
        let url = ConnectionURLParser.url(for: profile)
        #expect(url == "postgresql://u@h:5433/d?sslmode=verify-full")
        let parsed = try ConnectionURLParser.parse(url)
        #expect(parsed.profile.host == "h")
        #expect(parsed.profile.sslMode == .verifyFull)
    }

    @Test("Validation reports missing fields")
    func validation() {
        var profile = ConnectionProfile()
        #expect(profile.isValid)
        profile.host = " "
        profile.port = 70_000
        #expect(profile.validationIssues.count == 2)
    }
}
