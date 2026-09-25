/// Big-endian cursor over a byte array, used by the binary value decoder.
struct ByteReader {
    let bytes: [UInt8]
    private(set) var offset: Int

    init(_ bytes: [UInt8], offset: Int = 0) {
        self.bytes = bytes
        self.offset = offset
    }

    var remaining: Int { bytes.count - offset }
    var isAtEnd: Bool { offset >= bytes.count }

    mutating func readUInt8() -> UInt8? {
        guard remaining >= 1 else { return nil }
        defer { offset += 1 }
        return bytes[offset]
    }

    mutating func readInt16() -> Int16? { readInteger(as: Int16.self) }
    mutating func readUInt16() -> UInt16? { readInteger(as: UInt16.self) }
    mutating func readInt32() -> Int32? { readInteger(as: Int32.self) }
    mutating func readUInt32() -> UInt32? { readInteger(as: UInt32.self) }
    mutating func readInt64() -> Int64? { readInteger(as: Int64.self) }
    mutating func readUInt64() -> UInt64? { readInteger(as: UInt64.self) }

    mutating func readFloat() -> Float? {
        readUInt32().map { Float(bitPattern: $0) }
    }

    mutating func readDouble() -> Double? {
        readUInt64().map { Double(bitPattern: $0) }
    }

    mutating func readBytes(_ count: Int) -> [UInt8]? {
        guard count >= 0, remaining >= count else { return nil }
        defer { offset += count }
        return Array(bytes[offset..<offset + count])
    }

    /// Reads an int32 length followed by that many bytes; `nil` payload means SQL NULL (-1).
    mutating func readLengthPrefixed() -> [UInt8]?? {
        guard let length = readInt32() else { return nil }
        if length < 0 { return .some(nil) }
        guard let payload = readBytes(Int(length)) else { return nil }
        return .some(payload)
    }

    mutating func readRemaining() -> [UInt8] {
        defer { offset = bytes.count }
        return Array(bytes[offset...])
    }

    private mutating func readInteger<T: FixedWidthInteger>(as type: T.Type) -> T? {
        let size = MemoryLayout<T>.size
        guard remaining >= size else { return nil }
        var value: T = 0
        for index in 0..<size {
            value = (value << 8) | T(truncatingIfNeeded: bytes[offset + index])
        }
        offset += size
        return value
    }
}
