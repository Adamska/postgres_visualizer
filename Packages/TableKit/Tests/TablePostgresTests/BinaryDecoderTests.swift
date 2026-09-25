import Foundation
import Testing
@testable import TableCore
@testable import TablePostgres

@Suite("Binary value decoding")
struct BinaryDecoderTests {
    private let decoder = PostgresBinaryDecoder()

    private func be<T: FixedWidthInteger>(_ value: T) -> [UInt8] {
        withUnsafeBytes(of: value.bigEndian) { Array($0) }
    }

    private func text(_ bytes: [UInt8], oid: UInt32) -> String? {
        decoder.decode(bytes, oid: oid).stringValue
    }

    @Test("Null, text format and undecodable values")
    func basics() {
        #expect(decoder.decode(nil, oid: 23) == .null)
        #expect(decoder.decode([0x61], oid: 99_999, isText: true) == .text("a"))
        #expect(decoder.decode([0x01, 0x02], oid: 99_999) == .binary(Data([1, 2])))
        #expect(decoder.decode([0x01], oid: 3_614) == .binary(Data([1]))) // tsvector unsupported
    }

    @Test("Integers, booleans and OIDs")
    func integers() {
        #expect(text([1], oid: 16) == "true")
        #expect(text([0], oid: 16) == "false")
        #expect(text(be(Int16(-7)), oid: 21) == "-7")
        #expect(text(be(Int32(123_456)), oid: 23) == "123456")
        #expect(text(be(Int64.min), oid: 20) == "-9223372036854775808")
        #expect(text(be(UInt32(4_000_000_000)), oid: 26) == "4000000000")
        #expect(text(be(UInt64(1) << 63), oid: 5_069) == "9223372036854775808")
    }

    @Test("Floats use PostgreSQL's shortest notation", arguments: [
        (1.5, "1.5"), (100_000.0, "100000"), (1e15, "1e+15"), (123_456_789_012_345.0, "123456789012345"),
        (0.0001, "0.0001"), (0.00001, "1e-05"), (-2.5e-7, "-2.5e-07"), (Double.nan, "NaN"),
        (Double.infinity, "Infinity"), (-Double.infinity, "-Infinity"), (0.0, "0"), (3.141592653589793, "3.141592653589793"),
        (1e100, "1e+100"), (12_345.678, "12345.678"),
    ])
    func floats(value: Double, expected: String) {
        #expect(text(be(value.bitPattern), oid: 701) == expected)
    }

    @Test("Float4 values")
    func float4() {
        #expect(text(be(Float(0.1).bitPattern), oid: 700) == "0.1")
        #expect(text(be(Float(-42).bitPattern), oid: 700) == "-42")
    }

    @Test("Numeric renders exactly with scale", arguments: [
        ([Int16(1), 2_345], Int16(1), UInt16(0), UInt16(2), "12345.00"),
        ([Int16(5)], Int16(-1), UInt16(0x4000), UInt16(4), "-0.0005"),
        ([], Int16(0), UInt16(0), UInt16(0), "0"),
        ([Int16(12), 3_400], Int16(1), UInt16(0), UInt16(0), "123400"),
        ([Int16(1)], Int16(0), UInt16(0), UInt16(3), "1.000"),
        ([Int16(1), 5], Int16(0), UInt16(0), UInt16(2), "1.00"),
        ([Int16(1), 5_000], Int16(0), UInt16(0), UInt16(1), "1.5"),
        ([], Int16(0), UInt16(0xC000), UInt16(0), "NaN"),
        ([], Int16(0), UInt16(0xD000), UInt16(0), "Infinity"),
    ])
    func numeric(digits: [Int16], weight: Int16, sign: UInt16, scale: UInt16, expected: String) {
        var bytes = be(Int16(digits.count)) + be(weight) + be(sign) + be(scale)
        for digit in digits { bytes += be(digit) }
        #expect(text(bytes, oid: 1_700) == expected)
    }

    @Test("Text-like types, JSON and bytea")
    func textual() {
        #expect(text(Array("héllo".utf8), oid: 25) == "héllo")
        #expect(text(Array("x".utf8), oid: 1_043) == "x")
        #expect(text([1] + Array("{\"a\":1}".utf8), oid: 3_802) == "{\"a\":1}")
        #expect(text([2] + Array("{}".utf8), oid: 3_802) == nil)
        #expect(text([0xDE, 0xAD, 0xBE, 0xEF], oid: 17) == "\\xdeadbeef")
        #expect(text([0x12, 0x3E, 0x45, 0x67, 0xE8, 0x9B, 0x12, 0xD3, 0xA4, 0x56, 0x42, 0x66, 0x55, 0x44, 0x00, 0x00], oid: 2_950)
            == "123e4567-e89b-12d3-a456-426655440000")
    }

    @Test("Dates and timestamps")
    func dates() {
        #expect(text(be(Int32(0)), oid: 1_082) == "2000-01-01")
        #expect(text(be(Int32(9_205)), oid: 1_082) == "2025-03-15")
        #expect(text(be(Int32(-730_119)), oid: 1_082) == "0001-01-01")
        #expect(text(be(Int32(-730_120)), oid: 1_082) == "0001-12-31 BC")
        #expect(text(be(Int32.max), oid: 1_082) == "infinity")
        #expect(text(be(Int32.min), oid: 1_082) == "-infinity")

        let micros: Int64 = 9_205 * 86_400_000_000 + 13 * 3_600_000_000 + 45 * 60_000_000 + 7 * 1_000_000 + 250_000
        #expect(text(be(micros), oid: 1_114) == "2025-03-15 13:45:07.25")
        #expect(text(be(micros), oid: 1_184) == "2025-03-15 13:45:07.25+00")
        #expect(text(be(Int64(-1)), oid: 1_114) == "1999-12-31 23:59:59.999999")
        #expect(text(be(Int64.max), oid: 1_184) == "infinity")
    }

    @Test("Times, time zones and intervals")
    func timesAndIntervals() {
        #expect(text(be(Int64(3_723_000_000)), oid: 1_083) == "01:02:03")
        #expect(text(be(Int64(3_723_000_000)) + be(Int32(18_000)), oid: 1_266) == "01:02:03-05")
        #expect(text(be(Int64(0)) + be(Int32(-19_800)), oid: 1_266) == "00:00:00+05:30")

        func interval(_ micros: Int64, _ days: Int32, _ months: Int32) -> String? {
            text(be(micros) + be(days) + be(months), oid: 1_186)
        }
        #expect(interval(0, 0, 0) == "00:00:00")
        #expect(interval(3_600_000_000 + 1_500_000, 3, 14) == "1 year 2 mons 3 days 01:00:01.5")
        #expect(interval(-3_600_000_000, 0, 0) == "-01:00:00")
        #expect(interval(3_600_000_000, -2, 0) == "-2 days +01:00:00")
        #expect(interval(0, 1, -1) == "-1 mons +1 day")
        #expect(interval(0, 0, 12) == "1 year")
    }

    @Test("Arrays of scalars, with nulls, quoting and dimensions")
    func arrays() {
        var bytes = be(Int32(1)) + be(Int32(1)) + be(UInt32(25)) + be(Int32(3)) + be(Int32(1))
        bytes += be(Int32(1)) + Array("a".utf8)
        bytes += be(Int32(-1))
        bytes += be(Int32(5)) + Array("b, \"c".utf8)
        #expect(text(bytes, oid: 1_009) == "{a,NULL,\"b, \\\"c\"}")

        var matrix = be(Int32(2)) + be(Int32(0)) + be(UInt32(23)) + be(Int32(2)) + be(Int32(1)) + be(Int32(2)) + be(Int32(1))
        for value in [1, 2, 3, 4] { matrix += be(Int32(4)) + be(Int32(value)) }
        #expect(text(matrix, oid: 1_007) == "{{1,2},{3,4}}")

        let empty = be(Int32(0)) + be(Int32(0)) + be(UInt32(23))
        #expect(text(empty, oid: 1_007) == "{}")

        let shifted = be(Int32(1)) + be(Int32(0)) + be(UInt32(23)) + be(Int32(1)) + be(Int32(0)) + be(Int32(4)) + be(Int32(9))
        #expect(text(shifted, oid: 1_007) == "[0:0]={9}")
    }

    @Test("Composites, ranges and multiranges")
    func compositesAndRanges() {
        var record = be(Int32(2))
        record += be(UInt32(23)) + be(Int32(4)) + be(Int32(7))
        record += be(UInt32(25)) + be(Int32(-1))
        #expect(text(record, oid: 2_249) == "(7,)")

        var range = [UInt8(0x02)] // lower inclusive
        range += be(Int32(4)) + be(Int32(1))
        range += be(Int32(4)) + be(Int32(10))
        #expect(text(range, oid: 3_904) == "[1,10)")
        #expect(text([0x01], oid: 3_904) == "empty")
        #expect(text([0x18], oid: 3_904) == "(,)")

        let multirange = be(Int32(1)) + be(Int32(range.count)) + range
        #expect(text(multirange, oid: 4_451) == "{[1,10)}")
    }

    @Test("Network, MAC, bit strings and geometry")
    func networkAndGeometry() {
        #expect(text([2, 32, 0, 4, 192, 168, 0, 1], oid: 869) == "192.168.0.1")
        #expect(text([2, 24, 1, 4, 10, 0, 0, 0], oid: 650) == "10.0.0.0/24")
        let v6: [UInt8] = [3, 128, 0, 16, 0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
        #expect(text(v6, oid: 869) == "2001:db8::1")
        #expect(text([0x08, 0x00, 0x2b, 0x01, 0x02, 0x03], oid: 829) == "08:00:2b:01:02:03")
        #expect(text(be(Int32(5)) + [0b1011_0000], oid: 1_560) == "10110")
        #expect(text(be(1.5.bitPattern) + be((-2.0).bitPattern), oid: 600) == "(1.5,-2)")
        #expect(text(be(UInt64(0x0000_0001_0000_00A0)), oid: 3_220) == "1/A0")
    }

    @Test("Enums and domains resolve through the catalog")
    func enumsAndDomains() {
        let catalog = TypeCatalog(types: BuiltinTypes.all + [
            TypeInfo(oid: 20_000, name: "mood", schema: "public", shape: .enumeration, category: "E", enumLabels: ["happy"]),
            TypeInfo(oid: 20_001, name: "positive", schema: "public", shape: .domain, category: "N", baseOID: 23),
            TypeInfo(oid: 20_002, name: "_mood", schema: "public", category: "A", elementOID: 20_000),
        ])
        let decoder = PostgresBinaryDecoder(catalog: catalog)
        #expect(decoder.decode(Array("happy".utf8), oid: 20_000) == .text("happy"))
        #expect(decoder.decode(be(Int32(3)), oid: 20_001) == .text("3"))
        let array = be(Int32(1)) + be(Int32(0)) + be(UInt32(20_000)) + be(Int32(1)) + be(Int32(1)) + be(Int32(5)) + Array("happy".utf8)
        #expect(decoder.decode(array, oid: 20_002) == .text("{happy}"))
    }

    @Test("Extension types: hstore and pgvector")
    func extensions() {
        let catalog = TypeCatalog(types: BuiltinTypes.all + [
            TypeInfo(oid: 30_000, name: "hstore", schema: "public", category: "U"),
            TypeInfo(oid: 30_001, name: "vector", schema: "public", category: "U"),
        ])
        let decoder = PostgresBinaryDecoder(catalog: catalog)
        let hstore = be(Int32(2)) + be(Int32(1)) + Array("a".utf8) + be(Int32(1)) + Array("1".utf8) + be(Int32(1)) + Array("b".utf8) + be(Int32(-1))
        #expect(decoder.decode(hstore, oid: 30_000) == .text("\"a\"=>\"1\", \"b\"=>NULL"))
        let vector = be(UInt16(2)) + be(UInt16(0)) + be(Float(0.5).bitPattern) + be(Float(-1).bitPattern)
        #expect(decoder.decode(vector, oid: 30_001) == .text("[0.5,-1]"))
    }

    @Test("Money formatting")
    func money() {
        #expect(text(be(Int64(123_456)), oid: 790) == "$1,234.56")
        #expect(text(be(Int64(-5)), oid: 790) == "-$0.05")
    }
}
