import Foundation

/// Renders decoded binary values the way PostgreSQL's text output functions do, so that
/// values round-trip through literals unchanged.
enum PostgresTextFormat {
    static let postgresEpochJulianDay = 2_451_545 // 2000-01-01
    static let microsecondsPerDay: Int64 = 86_400_000_000

    // MARK: Dates and times

    /// Converts a Julian day number to a proleptic Gregorian date (Postgres `j2date`).
    static func julianToDate(_ julianDay: Int) -> (year: Int, month: Int, day: Int) {
        var julian = julianDay + 32_044
        var quad = julian / 146_097
        let extra = (julian - quad * 146_097) * 4 + 3
        julian += 60 + quad * 3 + extra / 146_097
        quad = julian / 1_461
        julian -= quad * 1_461
        var year = julian * 4 / 1_461
        julian = year != 0 ? ((julian + 305) % 365) : ((julian + 306) % 366)
        julian += 123
        year += quad * 4
        let resultYear = year - 4_800
        quad = julian * 2_141 / 65_536
        let day = julian - 7_834 * quad / 256
        let month = (quad + 10) % 12 + 1
        return (resultYear, month, day)
    }

    static func date(daysSince2000 days: Int32) -> String {
        if days == Int32.max { return "infinity" }
        if days == Int32.min { return "-infinity" }
        return dateString(julianDay: Int(days) + postgresEpochJulianDay)
    }

    private static func dateString(julianDay: Int) -> String {
        let (year, month, day) = julianToDate(julianDay)
        if year <= 0 {
            return String(format: "%04d-%02d-%02d BC", -year + 1, month, day)
        }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func time(microseconds: Int64) -> String {
        let clamped = max(0, microseconds)
        let hours = clamped / 3_600_000_000
        let minutes = (clamped / 60_000_000) % 60
        let seconds = (clamped / 1_000_000) % 60
        let fraction = clamped % 1_000_000
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds) + fractionSuffix(fraction)
    }

    static func timeWithZone(microseconds: Int64, zoneSecondsWestOfUTC: Int32) -> String {
        time(microseconds: microseconds) + zoneSuffix(secondsEastOfUTC: -Int(zoneSecondsWestOfUTC))
    }

    static func timestamp(microsecondsSince2000 micros: Int64, withZone: Bool) -> String {
        if micros == Int64.max { return "infinity" }
        if micros == Int64.min { return "-infinity" }
        var days = micros / microsecondsPerDay
        var timeOfDay = micros % microsecondsPerDay
        if timeOfDay < 0 {
            timeOfDay += microsecondsPerDay
            days -= 1
        }
        let dateText = dateString(julianDay: Int(days) + postgresEpochJulianDay)
        let (datePart, era) = splitEra(dateText)
        let timeText = time(microseconds: timeOfDay)
        return datePart + " " + timeText + (withZone ? "+00" : "") + era
    }

    private static func splitEra(_ date: String) -> (String, String) {
        date.hasSuffix(" BC") ? (String(date.dropLast(3)), " BC") : (date, "")
    }

    static func fractionSuffix(_ micros: Int64) -> String {
        guard micros != 0 else { return "" }
        var text = String(format: "%06d", micros)
        while text.hasSuffix("0") { text.removeLast() }
        return "." + text
    }

    static func zoneSuffix(secondsEastOfUTC seconds: Int) -> String {
        let sign = seconds < 0 ? "-" : "+"
        let absolute = abs(seconds)
        let hours = absolute / 3_600
        let minutes = (absolute / 60) % 60
        let secs = absolute % 60
        if secs != 0 { return String(format: "%@%02d:%02d:%02d", sign, hours, minutes, secs) }
        if minutes != 0 { return String(format: "%@%02d:%02d", sign, hours, minutes) }
        return String(format: "%@%02d", sign, hours)
    }

    /// `IntervalStyle = postgres` rendering.
    static func interval(microseconds: Int64, days: Int32, months: Int32) -> String {
        let years = Int(months) / 12
        let remainingMonths = Int(months) % 12
        let hours = microseconds / 3_600_000_000
        let minutes = (microseconds / 60_000_000) % 60
        let seconds = (microseconds / 1_000_000) % 60
        let fraction = microseconds % 1_000_000

        var output = ""
        var isBefore = false

        func appendPart(_ value: Int, _ unit: String) {
            guard value != 0 else { return }
            if !output.isEmpty { output += " " }
            if isBefore && value > 0 { output += "+" }
            output += "\(value) \(unit)\(value == 1 ? "" : "s")"
            isBefore = value < 0
        }

        appendPart(years, "year")
        appendPart(remainingMonths, "mon")
        appendPart(Int(days), "day")

        if hours != 0 || minutes != 0 || seconds != 0 || fraction != 0 {
            let isNegative = hours < 0 || minutes < 0 || seconds < 0 || fraction < 0
            if !output.isEmpty { output += " " }
            output += isNegative ? "-" : (isBefore ? "+" : "")
            output += String(format: "%02d:%02d:%02d", abs(hours), abs(minutes), abs(seconds))
            output += fractionSuffix(abs(fraction))
        }
        return output.isEmpty ? "00:00:00" : output
    }

    // MARK: Numbers

    /// Shortest round-trip float rendering with PostgreSQL's fixed/exponential switch.
    static func float<T: BinaryFloatingPoint & CustomStringConvertible>(_ value: T) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        if value == 0 { return value.sign == .minus ? "-0" : "0" }

        let (digits, exponent, isNegative) = decimalDigits(of: value.description)
        var body: String
        if exponent >= -4 && exponent < 15 {
            if exponent < 0 {
                body = "0." + String(repeating: "0", count: -exponent - 1) + digits
            } else if digits.count <= exponent + 1 {
                body = digits + String(repeating: "0", count: exponent + 1 - digits.count)
            } else {
                let split = digits.index(digits.startIndex, offsetBy: exponent + 1)
                body = digits[..<split] + "." + digits[split...]
            }
        } else {
            body = String(digits.first ?? "0")
            if digits.count > 1 { body += "." + digits.dropFirst() }
            body += String(format: "e%@%02d", exponent < 0 ? "-" : "+", abs(exponent))
        }
        return (isNegative ? "-" : "") + body
    }

    /// Extracts significant digits and decimal exponent from Swift's shortest description.
    static func decimalDigits(of description: String) -> (digits: String, exponent: Int, isNegative: Bool) {
        var text = description
        let isNegative = text.hasPrefix("-")
        if isNegative { text.removeFirst() }
        var exponent = 0
        if let eIndex = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            exponent = Int(text[text.index(after: eIndex)...]) ?? 0
            text = String(text[..<eIndex])
        }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        let integerPart = String(parts.first ?? "")
        let fractionPart = parts.count > 1 ? String(parts[1]) : ""
        var digits = integerPart + fractionPart
        exponent += integerPart.count - 1
        while digits.hasPrefix("0"), digits.count > 1 {
            digits.removeFirst()
            exponent -= 1
        }
        while digits.hasSuffix("0"), digits.count > 1 { digits.removeLast() }
        return (digits, exponent, isNegative)
    }

    /// Renders a binary `numeric` (base-10000 digits) exactly as `numeric_out` does.
    static func numeric(digits: [Int16], weight: Int16, sign: UInt16, scale: UInt16) -> String {
        switch sign {
        case 0xC000: return "NaN"
        case 0xD000: return "Infinity"
        case 0xF000: return "-Infinity"
        default: break
        }
        var text = sign == 0x4000 ? "-" : ""
        let weightValue = Int(weight)

        if weightValue < 0 {
            text += "0"
        } else {
            for position in 0...weightValue {
                let digit = position < digits.count ? Int(digits[position]) : 0
                let chunk = String(digit)
                text += position == 0 ? chunk : String(repeating: "0", count: 4 - chunk.count) + chunk
            }
        }

        let scaleValue = Int(scale)
        guard scaleValue > 0 else { return text }
        text += "."
        var fraction = ""
        var position = weightValue + 1
        while fraction.count < scaleValue {
            let digit = position >= 0 && position < digits.count ? Int(digits[position]) : 0
            let chunk = String(digit)
            fraction += String(repeating: "0", count: 4 - chunk.count) + chunk
            position += 1
        }
        return text + fraction.prefix(scaleValue)
    }

    static func money(cents: Int64) -> String {
        let isNegative = cents < 0
        let magnitude = cents.magnitude
        let whole = magnitude / 100
        let fraction = magnitude % 100
        var grouped = ""
        for (index, character) in String(whole).reversed().enumerated() {
            if index > 0, index % 3 == 0 { grouped.append(",") }
            grouped.append(character)
        }
        return (isNegative ? "-$" : "$") + String(grouped.reversed()) + String(format: ".%02d", fraction)
    }

    // MARK: Misc

    static func hex(_ bytes: [UInt8]) -> String {
        "\\x" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func uuid(_ bytes: [UInt8]) -> String {
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let groups = [8, 4, 4, 4, 12]
        var parts: [String] = []
        var index = hex.startIndex
        for length in groups {
            let end = hex.index(index, offsetBy: length)
            parts.append(String(hex[index..<end]))
            index = end
        }
        return parts.joined(separator: "-")
    }

    static func macAddress(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02x", $0) }.joined(separator: ":")
    }

    static func ipv6(_ bytes: [UInt8]) -> String {
        var groups: [UInt16] = []
        for index in stride(from: 0, to: 16, by: 2) {
            groups.append(UInt16(bytes[index]) << 8 | UInt16(bytes[index + 1]))
        }
        // Find the longest run of zero groups (length >= 2) for `::` compression.
        var bestStart = -1
        var bestLength = 0
        var runStart = -1
        for (index, group) in groups.enumerated() {
            if group == 0 {
                if runStart < 0 { runStart = index }
                let length = index - runStart + 1
                if length > bestLength {
                    bestLength = length
                    bestStart = runStart
                }
            } else {
                runStart = -1
            }
        }
        let hexGroups = groups.map { String($0, radix: 16) }
        guard bestLength >= 2 else { return hexGroups.joined(separator: ":") }
        let head = hexGroups[..<bestStart].joined(separator: ":")
        let tail = hexGroups[(bestStart + bestLength)...].joined(separator: ":")
        return head + "::" + tail
    }

    /// Quotes an array element when the array output function would.
    static func arrayElement(_ text: String?) -> String {
        guard let text else { return "NULL" }
        let needsQuotes = text.isEmpty
            || text.caseInsensitiveCompare("NULL") == .orderedSame
            || text.contains { "{},\"\\".contains($0) || $0.isWhitespace }
        guard needsQuotes else { return text }
        return "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }

    /// Quotes a composite field when the record output function would.
    static func compositeField(_ text: String?) -> String {
        guard let text else { return "" }
        let needsQuotes = text.isEmpty || text.contains { "(),\"\\".contains($0) || $0.isWhitespace }
        guard needsQuotes else { return text }
        return "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    static func rangeBound(_ text: String?) -> String {
        guard let text else { return "" }
        let needsQuotes = text.isEmpty || text.contains { "(),[]\"\\".contains($0) || $0.isWhitespace }
        guard needsQuotes else { return text }
        return "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }

    static func hstoreToken(_ text: String?) -> String {
        guard let text else { return "NULL" }
        return "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}
