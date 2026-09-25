import Foundation
import Testing
@testable import TableCore

@Suite("Type catalog")
struct TypeCatalogTests {
    private let catalog = TypeCatalog(types: [
        TypeInfo(oid: 23, name: "int4", category: "N"),
        TypeInfo(oid: 25, name: "text", category: "S"),
        TypeInfo(oid: 1_007, name: "_int4", category: "A", elementOID: 23),
        TypeInfo(oid: 16_384, name: "positive", schema: "public", shape: .domain, category: "N", baseOID: 23),
        TypeInfo(oid: 16_400, name: "mood", schema: "app", shape: .enumeration, category: "E", enumLabels: ["sad", "ok"]),
        TypeInfo(oid: 16_401, name: "ids", schema: "public", shape: .domain, category: "A", baseOID: 1_007),
    ])

    @Test("Resolves kinds, domains and arrays")
    func kinds() {
        #expect(catalog.kind(of: 23) == .integer)
        #expect(catalog.kind(of: 25) == .text)
        #expect(catalog.kind(of: 1_007) == .array)
        #expect(catalog.kind(of: 16_384) == .integer)
        #expect(catalog.kind(of: 16_401) == .array)
        #expect(catalog.kind(of: 99) == .other)
        #expect(catalog.resolvingDomains(16_384)?.oid == 23)
    }

    @Test("Names and enum labels")
    func names() {
        #expect(catalog.name(of: 16_400) == "app.mood")
        #expect(catalog.name(of: 16_384) == "positive")
        #expect(catalog.name(of: 1) == "oid:1")
        #expect(catalog.enumLabels(of: 16_400) == ["sad", "ok"])
        #expect(catalog.enumLabels(of: 23) == nil)
        #expect(catalog.userVisibleTypes.map(\.name) == ["ids", "int4", "mood", "positive", "text"])
    }

    @Test("Value kind derivation from pg_type attributes")
    func valueKinds() {
        #expect(ValueKind.from(typeName: "timestamptz", category: "D", isArray: false) == .timestamp)
        #expect(ValueKind.from(typeName: "custom", category: "E", isArray: false) == .enumeration)
        #expect(ValueKind.from(typeName: "custom", category: "U", isArray: false) == .other)
        #expect(ValueKind.from(typeName: "int4", category: "N", isArray: true) == .array)
        #expect(ValueKind.integer.isRightAligned)
        #expect(ValueKind.json.prefersMultilineEditor)
    }

    @Test("Type info survives Codable round trips")
    func codable() throws {
        let type = TypeInfo(oid: 5, name: "x", shape: .range, category: "R", subtypeOID: 23)
        let data = try JSONEncoder().encode(type)
        #expect(try JSONDecoder().decode(TypeInfo.self, from: data) == type)
    }
}
