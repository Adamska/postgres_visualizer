public import TableCore

/// Core `pg_type` entries with fixed OIDs. Used to decode the catalog bootstrap query and
/// as a fallback when the live catalog has not been loaded yet.
public enum BuiltinTypes {
    public static let catalog = TypeCatalog(types: all)

    // swiftlint:disable:next function_body_length
    static let all: [TypeInfo] = {
        func base(_ oid: UInt32, _ name: String, _ category: Character, array: UInt32 = 0) -> [TypeInfo] {
            var types = [TypeInfo(oid: oid, name: name, shape: category == "P" ? .pseudo : .base, category: category)]
            if array != 0 {
                types.append(TypeInfo(oid: array, name: "_" + name, category: "A", elementOID: oid))
            }
            return types
        }
        func range(_ oid: UInt32, _ name: String, subtype: UInt32, array: UInt32, multi: UInt32, multiArray: UInt32) -> [TypeInfo] {
            [
                TypeInfo(oid: oid, name: name, shape: .range, category: "R", subtypeOID: subtype),
                TypeInfo(oid: array, name: "_" + name, category: "A", elementOID: oid),
                TypeInfo(oid: multi, name: name.replacingOccurrences(of: "range", with: "multirange"), shape: .multirange, category: "R", subtypeOID: oid),
                TypeInfo(oid: multiArray, name: "_" + name.replacingOccurrences(of: "range", with: "multirange"), category: "A", elementOID: multi),
            ]
        }
        return [
            base(16, "bool", "B", array: 1_000), base(17, "bytea", "U", array: 1_001), base(18, "char", "Z", array: 1_002),
            base(19, "name", "S", array: 1_003), base(20, "int8", "N", array: 1_016), base(21, "int2", "N", array: 1_005),
            base(23, "int4", "N", array: 1_007), base(24, "regproc", "N", array: 1_008), base(25, "text", "S", array: 1_009),
            base(26, "oid", "N", array: 1_028), base(27, "tid", "U", array: 1_010), base(28, "xid", "U", array: 1_011),
            base(29, "cid", "U", array: 1_012), base(114, "json", "U", array: 199), base(142, "xml", "U", array: 143),
            base(194, "pg_node_tree", "S"), base(600, "point", "G", array: 1_017), base(601, "lseg", "G", array: 1_018),
            base(602, "path", "G", array: 1_019), base(603, "box", "G", array: 1_020), base(604, "polygon", "G", array: 1_027),
            base(628, "line", "G", array: 629), base(650, "cidr", "I", array: 651), base(700, "float4", "N", array: 1_021),
            base(701, "float8", "N", array: 1_022), base(705, "unknown", "X"), base(718, "circle", "G", array: 719),
            base(774, "macaddr8", "U", array: 775), base(790, "money", "N", array: 791), base(829, "macaddr", "U", array: 1_040),
            base(869, "inet", "I", array: 1_041), base(1_033, "aclitem", "U", array: 1_034), base(1_042, "bpchar", "S", array: 1_014),
            base(1_043, "varchar", "S", array: 1_015), base(1_082, "date", "D", array: 1_182), base(1_083, "time", "D", array: 1_183),
            base(1_114, "timestamp", "D", array: 1_115), base(1_184, "timestamptz", "D", array: 1_185),
            base(1_186, "interval", "T", array: 1_187), base(1_266, "timetz", "D", array: 1_270), base(1_560, "bit", "V", array: 1_561),
            base(1_562, "varbit", "V", array: 1_563), base(1_700, "numeric", "N", array: 1_231), base(1_790, "refcursor", "U", array: 2_201),
            base(2_202, "regprocedure", "N", array: 2_207), base(2_203, "regoper", "N", array: 2_208),
            base(2_204, "regoperator", "N", array: 2_209), base(2_205, "regclass", "N", array: 2_210),
            base(2_206, "regtype", "N", array: 2_211), base(2_249, "record", "P", array: 2_287), base(2_275, "cstring", "P", array: 1_263),
            base(2_278, "void", "P"), base(2_950, "uuid", "U", array: 2_951), base(3_220, "pg_lsn", "U", array: 3_221),
            base(3_614, "tsvector", "U", array: 3_643), base(3_615, "tsquery", "U", array: 3_645),
            base(3_734, "regconfig", "N", array: 3_735), base(3_769, "regdictionary", "N", array: 3_770),
            base(3_802, "jsonb", "U", array: 3_807), base(4_072, "jsonpath", "U", array: 4_073),
            base(4_089, "regnamespace", "N", array: 4_090), base(4_096, "regrole", "N", array: 4_097),
            base(4_191, "regcollation", "N", array: 4_192), base(5_069, "xid8", "U", array: 271),
            range(3_904, "int4range", subtype: 23, array: 3_905, multi: 4_451, multiArray: 6_150),
            range(3_906, "numrange", subtype: 1_700, array: 3_907, multi: 4_532, multiArray: 6_151),
            range(3_908, "tsrange", subtype: 1_114, array: 3_909, multi: 4_533, multiArray: 6_152),
            range(3_910, "tstzrange", subtype: 1_184, array: 3_911, multi: 4_534, multiArray: 6_153),
            range(3_912, "daterange", subtype: 1_082, array: 3_913, multi: 4_535, multiArray: 6_155),
            range(3_926, "int8range", subtype: 20, array: 3_927, multi: 4_536, multiArray: 6_157),
        ].flatMap { $0 }
    }()
}
