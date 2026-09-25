import Foundation
public import TableCore

/// Converts binary-format wire values into their canonical text representation.
///
/// PostgresNIO always requests binary results, so every type the app displays must be
/// decoded here. Unknown types fall back to `CellValue.binary`.
public struct PostgresBinaryDecoder: Sendable {
    public var catalog: TypeCatalog

    public init(catalog: TypeCatalog = BuiltinTypes.catalog) {
        self.catalog = catalog
    }

    /// Decodes one cell. `bytes == nil` means SQL NULL.
    public func decode(_ bytes: [UInt8]?, oid: UInt32, isText: Bool = false) -> CellValue {
        guard let bytes else { return .null }
        if isText { return .text(String(decoding: bytes, as: UTF8.self)) }
        guard let text = text(bytes, oid: oid) else { return .binary(Data(bytes)) }
        return .text(text)
    }

    // swiftlint:disable function_body_length
    /// Returns `nil` when the type cannot be decoded. The body is a flat dispatch table over
    /// type names, which reads better than splitting it apart.
    func text(_ bytes: [UInt8], oid: UInt32) -> String? {
        guard let type = catalog.resolvingDomains(oid) else { return nil }

        if type.isArray { return array(bytes, elementOID: type.elementOID) }
        switch type.shape {
        case .enumeration: return utf8(bytes)
        case .composite: return composite(bytes)
        case .range: return range(bytes, subtypeOID: type.subtypeOID)
        case .multirange: return multirange(bytes, rangeOID: type.subtypeOID)
        case .pseudo: return pseudo(bytes, name: type.name)
        case .base, .domain: break
        }

        var reader = ByteReader(bytes)
        switch type.name {
        case "bool":
            return reader.readUInt8().map { $0 != 0 ? "true" : "false" }
        case "int2":
            return reader.readInt16().map(String.init)
        case "int4":
            return reader.readInt32().map(String.init)
        case "int8":
            return reader.readInt64().map(String.init)
        case "oid", "xid", "cid", "regproc", "regprocedure", "regoper", "regoperator", "regclass", "regtype",
             "regconfig", "regdictionary", "regnamespace", "regrole", "regcollation":
            return reader.readUInt32().map(String.init)
        case "xid8":
            return reader.readUInt64().map(String.init)
        case "float4":
            return reader.readFloat().map { PostgresTextFormat.float($0) }
        case "float8":
            return reader.readDouble().map { PostgresTextFormat.float($0) }
        case "numeric":
            return numeric(&reader)
        case "money":
            return reader.readInt64().map { PostgresTextFormat.money(cents: $0) }
        case "text", "varchar", "bpchar", "name", "char", "unknown", "xml", "json", "citext", "pg_node_tree":
            return utf8(bytes)
        case "jsonpath", "ltree", "lquery", "ltxtquery":
            // These carry a one-byte format version before the text payload.
            return utf8(Array(bytes.dropFirst()))
        case "jsonb":
            guard reader.readUInt8() == 1 else { return nil }
            return utf8(reader.readRemaining())
        case "bytea":
            return PostgresTextFormat.hex(bytes)
        case "uuid":
            return bytes.count == 16 ? PostgresTextFormat.uuid(bytes) : nil
        case "date":
            return reader.readInt32().map { PostgresTextFormat.date(daysSince2000: $0) }
        case "time":
            return reader.readInt64().map { PostgresTextFormat.time(microseconds: $0) }
        case "timetz":
            guard let micros = reader.readInt64(), let zone = reader.readInt32() else { return nil }
            return PostgresTextFormat.timeWithZone(microseconds: micros, zoneSecondsWestOfUTC: zone)
        case "timestamp":
            return reader.readInt64().map { PostgresTextFormat.timestamp(microsecondsSince2000: $0, withZone: false) }
        case "timestamptz":
            return reader.readInt64().map { PostgresTextFormat.timestamp(microsecondsSince2000: $0, withZone: true) }
        case "interval":
            guard let micros = reader.readInt64(), let days = reader.readInt32(), let months = reader.readInt32() else { return nil }
            return PostgresTextFormat.interval(microseconds: micros, days: days, months: months)
        case "inet", "cidr":
            return networkAddress(&reader, isCIDR: type.name == "cidr")
        case "macaddr", "macaddr8":
            return PostgresTextFormat.macAddress(bytes)
        case "bit", "varbit":
            return bitString(&reader)
        case "point":
            return point(&reader)
        case "lseg":
            guard let first = point(&reader), let second = point(&reader) else { return nil }
            return "[\(first),\(second)]"
        case "box":
            guard let first = point(&reader), let second = point(&reader) else { return nil }
            return "\(first),\(second)"
        case "line":
            guard let a = reader.readDouble(), let b = reader.readDouble(), let c = reader.readDouble() else { return nil }
            return "{\(PostgresTextFormat.float(a)),\(PostgresTextFormat.float(b)),\(PostgresTextFormat.float(c))}"
        case "circle":
            guard let center = point(&reader), let radius = reader.readDouble() else { return nil }
            return "<\(center),\(PostgresTextFormat.float(radius))>"
        case "path":
            guard let closed = reader.readUInt8(), let points = pointList(&reader) else { return nil }
            return closed != 0 ? "(\(points))" : "[\(points)]"
        case "polygon":
            return pointList(&reader).map { "(\($0))" }
        case "tid":
            guard let block = reader.readUInt32(), let offset = reader.readUInt16() else { return nil }
            return "(\(block),\(offset))"
        case "pg_lsn":
            return reader.readUInt64().map { String(format: "%X/%X", UInt32($0 >> 32), UInt32(truncatingIfNeeded: $0)) }
        case "hstore":
            return hstore(&reader)
        case "vector", "halfvec":
            return vector(&reader, isHalf: type.name == "halfvec")
        default:
            return nil
        }
    }
    // swiftlint:enable function_body_length

    // MARK: Helpers

    private func pseudo(_ bytes: [UInt8], name: String) -> String? {
        switch name {
        case "void": ""
        case "record": composite(bytes)
        case "cstring", "unknown": utf8(bytes)
        default: nil
        }
    }

    private func utf8(_ bytes: [UInt8]) -> String {
        String(decoding: bytes, as: UTF8.self)
    }

    private func numeric(_ reader: inout ByteReader) -> String? {
        guard let count = reader.readInt16(), let weight = reader.readInt16(),
              let sign = reader.readUInt16(), let scale = reader.readUInt16() else { return nil }
        var digits: [Int16] = []
        for _ in 0..<max(0, Int(count)) {
            guard let digit = reader.readInt16() else { return nil }
            digits.append(digit)
        }
        return PostgresTextFormat.numeric(digits: digits, weight: weight, sign: sign, scale: scale)
    }

    private func networkAddress(_ reader: inout ByteReader, isCIDR: Bool) -> String? {
        guard let family = reader.readUInt8(), let bits = reader.readUInt8(), reader.readUInt8() != nil,
              let length = reader.readUInt8(), let address = reader.readBytes(Int(length)) else { return nil }
        let text: String
        let maxBits: UInt8
        if family == 2, address.count == 4 {
            text = address.map(String.init).joined(separator: ".")
            maxBits = 32
        } else if address.count == 16 {
            text = PostgresTextFormat.ipv6(address)
            maxBits = 128
        } else {
            return nil
        }
        return (isCIDR || bits != maxBits) ? "\(text)/\(bits)" : text
    }

    private func bitString(_ reader: inout ByteReader) -> String? {
        guard let length = reader.readInt32(), length >= 0 else { return nil }
        let bytes = reader.readRemaining()
        var output = ""
        output.reserveCapacity(Int(length))
        for index in 0..<Int(length) {
            let byte = bytes[index / 8]
            let bit = (byte >> (7 - UInt8(index % 8))) & 1
            output.append(bit == 1 ? "1" : "0")
        }
        return output
    }

    private func point(_ reader: inout ByteReader) -> String? {
        guard let x = reader.readDouble(), let y = reader.readDouble() else { return nil }
        return "(\(PostgresTextFormat.float(x)),\(PostgresTextFormat.float(y)))"
    }

    private func pointList(_ reader: inout ByteReader) -> String? {
        guard let count = reader.readInt32(), count >= 0 else { return nil }
        var points: [String] = []
        for _ in 0..<Int(count) {
            guard let value = point(&reader) else { return nil }
            points.append(value)
        }
        return points.joined(separator: ",")
    }

    private func array(_ bytes: [UInt8], elementOID: UInt32) -> String? {
        var reader = ByteReader(bytes)
        guard let dimensions = reader.readInt32(), reader.readInt32() != nil, let elementType = reader.readUInt32() else { return nil }
        let effectiveElementOID = elementType != 0 ? elementType : elementOID
        guard dimensions >= 0 else { return nil }
        if dimensions == 0 { return "{}" }
        var lengths: [Int] = []
        var lowerBounds: [Int] = []
        for _ in 0..<Int(dimensions) {
            guard let length = reader.readInt32(), let lower = reader.readInt32() else { return nil }
            lengths.append(Int(length))
            lowerBounds.append(Int(lower))
        }
        var elements: [String] = []
        let total = lengths.reduce(1, *)
        for _ in 0..<total {
            guard let payload = reader.readLengthPrefixed() else { return nil }
            guard let value = payload else {
                elements.append("NULL")
                continue
            }
            guard let text = text(value, oid: effectiveElementOID) else { return nil }
            elements.append(PostgresTextFormat.arrayElement(text))
        }
        var cursor = 0
        func nest(_ level: Int) -> String {
            if level == lengths.count - 1 {
                let slice = elements[cursor..<cursor + lengths[level]]
                cursor += lengths[level]
                return "{" + slice.joined(separator: ",") + "}"
            }
            return "{" + (0..<lengths[level]).map { _ in nest(level + 1) }.joined(separator: ",") + "}"
        }
        let body = nest(0)
        guard lowerBounds.allSatisfy({ $0 == 1 }) else {
            let prefix = zip(lowerBounds, lengths).map { "[\($0):\($0 + $1 - 1)]" }.joined()
            return prefix + "=" + body
        }
        return body
    }

    private func composite(_ bytes: [UInt8]) -> String? {
        var reader = ByteReader(bytes)
        guard let count = reader.readInt32(), count >= 0 else { return nil }
        var fields: [String] = []
        for _ in 0..<Int(count) {
            guard let oid = reader.readUInt32(), let payload = reader.readLengthPrefixed() else { return nil }
            guard let value = payload else {
                fields.append("")
                continue
            }
            guard let text = text(value, oid: oid) else { return nil }
            fields.append(PostgresTextFormat.compositeField(text))
        }
        return "(" + fields.joined(separator: ",") + ")"
    }

    private func range(_ bytes: [UInt8], subtypeOID: UInt32) -> String? {
        var reader = ByteReader(bytes)
        return rangeBody(&reader, subtypeOID: subtypeOID)
    }

    private func rangeBody(_ reader: inout ByteReader, subtypeOID: UInt32) -> String? {
        guard let flags = reader.readUInt8() else { return nil }
        if flags & 0x01 != 0 { return "empty" }
        let lowerInclusive = flags & 0x02 != 0
        let upperInclusive = flags & 0x04 != 0
        let lowerInfinite = flags & 0x08 != 0
        let upperInfinite = flags & 0x10 != 0
        var lower = ""
        var upper = ""
        if !lowerInfinite {
            guard let payload = reader.readLengthPrefixed(), let value = payload, let text = text(value, oid: subtypeOID) else { return nil }
            lower = PostgresTextFormat.rangeBound(text)
        }
        if !upperInfinite {
            guard let payload = reader.readLengthPrefixed(), let value = payload, let text = text(value, oid: subtypeOID) else { return nil }
            upper = PostgresTextFormat.rangeBound(text)
        }
        return (lowerInclusive ? "[" : "(") + lower + "," + upper + (upperInclusive ? "]" : ")")
    }

    private func multirange(_ bytes: [UInt8], rangeOID: UInt32) -> String? {
        var reader = ByteReader(bytes)
        guard let count = reader.readInt32(), count >= 0 else { return nil }
        let subtypeOID = catalog[rangeOID]?.subtypeOID ?? 0
        var ranges: [String] = []
        for _ in 0..<Int(count) {
            guard let payload = reader.readLengthPrefixed(), let value = payload else { return nil }
            var inner = ByteReader(value)
            guard let text = rangeBody(&inner, subtypeOID: subtypeOID) else { return nil }
            ranges.append(text)
        }
        return "{" + ranges.joined(separator: ",") + "}"
    }

    private func hstore(_ reader: inout ByteReader) -> String? {
        guard let count = reader.readInt32(), count >= 0 else { return nil }
        var pairs: [String] = []
        for _ in 0..<Int(count) {
            guard let keyPayload = reader.readLengthPrefixed(), let key = keyPayload,
                  let valuePayload = reader.readLengthPrefixed() else { return nil }
            let value = valuePayload.map { utf8($0) }
            pairs.append(PostgresTextFormat.hstoreToken(utf8(key)) + "=>" + PostgresTextFormat.hstoreToken(value))
        }
        return pairs.joined(separator: ", ")
    }

    private func vector(_ reader: inout ByteReader, isHalf: Bool) -> String? {
        guard let dimensions = reader.readUInt16(), reader.readUInt16() != nil else { return nil }
        var values: [String] = []
        for _ in 0..<Int(dimensions) {
            if isHalf {
                guard let raw = reader.readUInt16() else { return nil }
                values.append(PostgresTextFormat.float(Float(Float16(bitPattern: raw))))
            } else {
                guard let value = reader.readFloat() else { return nil }
                values.append(PostgresTextFormat.float(value))
            }
        }
        return "[" + values.joined(separator: ",") + "]"
    }
}
