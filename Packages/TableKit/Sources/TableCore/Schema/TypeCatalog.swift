/// A row of `pg_type` reduced to what the value decoder needs.
public struct TypeInfo: Hashable, Codable, Sendable, Identifiable {
    public enum Shape: String, Codable, Sendable {
        case base
        case enumeration
        case domain
        case composite
        case range
        case multirange
        case pseudo

        public init(typtype: Character) {
            switch typtype {
            case "e": self = .enumeration
            case "d": self = .domain
            case "c": self = .composite
            case "r": self = .range
            case "m": self = .multirange
            case "p": self = .pseudo
            default: self = .base
            }
        }
    }

    public var oid: UInt32
    public var name: String
    public var schema: String
    public var shape: Shape
    public var category: Character
    /// For array types, the OID of the element type; zero otherwise.
    public var elementOID: UInt32
    /// For domains, the OID of the underlying type; zero otherwise.
    public var baseOID: UInt32
    /// For ranges and multiranges, the OID of the subtype; zero otherwise.
    public var subtypeOID: UInt32
    /// Enum labels, for enum types.
    public var enumLabels: [String]

    public var id: UInt32 { oid }

    public init(
        oid: UInt32,
        name: String,
        schema: String = "pg_catalog",
        shape: Shape = .base,
        category: Character = "X",
        elementOID: UInt32 = 0,
        baseOID: UInt32 = 0,
        subtypeOID: UInt32 = 0,
        enumLabels: [String] = []
    ) {
        self.oid = oid
        self.name = name
        self.schema = schema
        self.shape = shape
        self.category = category
        self.elementOID = elementOID
        self.baseOID = baseOID
        self.subtypeOID = subtypeOID
        self.enumLabels = enumLabels
    }

    public var isArray: Bool { category == "A" && elementOID != 0 }

    /// Type name as users write it, e.g. `text[]` or `myschema.status`.
    public var displayName: String {
        if schema == "pg_catalog" || schema == "public" { return name }
        return "\(schema).\(name)"
    }

    public var kind: ValueKind {
        .from(typeName: name, category: category, isArray: isArray)
    }

    enum CodingKeys: String, CodingKey {
        case oid, name, schema, shape, category, elementOID, baseOID, subtypeOID, enumLabels
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        oid = try container.decode(UInt32.self, forKey: .oid)
        name = try container.decode(String.self, forKey: .name)
        schema = try container.decode(String.self, forKey: .schema)
        shape = try container.decode(Shape.self, forKey: .shape)
        category = try container.decode(String.self, forKey: .category).first ?? "X"
        elementOID = try container.decode(UInt32.self, forKey: .elementOID)
        baseOID = try container.decode(UInt32.self, forKey: .baseOID)
        subtypeOID = try container.decode(UInt32.self, forKey: .subtypeOID)
        enumLabels = try container.decode([String].self, forKey: .enumLabels)
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(oid, forKey: .oid)
        try container.encode(name, forKey: .name)
        try container.encode(schema, forKey: .schema)
        try container.encode(shape, forKey: .shape)
        try container.encode(String(category), forKey: .category)
        try container.encode(elementOID, forKey: .elementOID)
        try container.encode(baseOID, forKey: .baseOID)
        try container.encode(subtypeOID, forKey: .subtypeOID)
        try container.encode(enumLabels, forKey: .enumLabels)
    }
}

/// Lookup table of the types known to a server, keyed by OID.
public struct TypeCatalog: Sendable, Hashable {
    private var types: [UInt32: TypeInfo]

    public init(types: [TypeInfo] = []) {
        self.types = Dictionary(types.map { ($0.oid, $0) }, uniquingKeysWith: { first, _ in first })
    }

    public subscript(oid: UInt32) -> TypeInfo? { types[oid] }

    public var count: Int { types.count }

    /// Resolves domains down to their base type so decoders see the real representation.
    public func resolvingDomains(_ oid: UInt32) -> TypeInfo? {
        var current = types[oid]
        var hops = 0
        while let type = current, type.shape == .domain, type.baseOID != 0, hops < 16 {
            current = types[type.baseOID]
            hops += 1
        }
        return current
    }

    public func kind(of oid: UInt32) -> ValueKind {
        guard let resolved = resolvingDomains(oid) else { return .other }
        if let declared = types[oid], declared.shape == .domain, resolved.isArray { return .array }
        return resolved.kind
    }

    public func name(of oid: UInt32) -> String {
        types[oid]?.displayName ?? "oid:\(oid)"
    }

    /// Enum labels for an enum type, resolving domains.
    public func enumLabels(of oid: UInt32) -> [String]? {
        guard let resolved = resolvingDomains(oid), resolved.shape == .enumeration else { return nil }
        return resolved.enumLabels
    }

    /// Types that are useful as autocomplete/casting suggestions (excludes internal ones).
    public var userVisibleTypes: [TypeInfo] {
        types.values
            .filter { !$0.name.hasPrefix("_") && $0.shape != .pseudo && !$0.name.hasPrefix("pg_") }
            .sorted { $0.name < $1.name }
    }
}
