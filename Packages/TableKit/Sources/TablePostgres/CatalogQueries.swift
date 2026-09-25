import Foundation
import TableCore

/// SQL for the catalog introspection queries, and parsers for their results.
enum CatalogQueries {
    static let separator = "\u{1F}"

    static let types = """
    SELECT t.oid AS oid, t.typname AS name, n.nspname AS schema, t.typtype::text AS shape,
           t.typcategory::text AS category, t.typelem AS element_oid, t.typbasetype AS base_oid,
           COALESCE(r.rngsubtype, m.rngtypid, 0) AS subtype_oid,
           (SELECT string_agg(e.enumlabel, '\(separator)' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_range r ON r.rngtypid = t.oid
    LEFT JOIN pg_range m ON m.rngmultitypid = t.oid
    """

    static let schemas = """
    SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner
    FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg\\_temp%' AND n.nspname NOT LIKE 'pg\\_toast%'
    ORDER BY (n.nspname = 'public') DESC, (n.nspname LIKE 'pg\\_%' OR n.nspname = 'information_schema') ASC, n.nspname
    """

    static func relations(in schema: String) -> String {
        """
        SELECT c.relname AS name, c.relkind::text AS kind, c.reltuples::bigint AS estimated_rows,
               obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = \(SQLLiteral.quote(schema)) AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
        ORDER BY c.relname
        """
    }

    static func functions(in schema: String) -> String {
        """
        SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
               pg_get_function_result(p.oid) AS return_type, l.lanname AS language, (p.prokind = 'p') AS is_procedure
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = \(SQLLiteral.quote(schema)) AND p.prokind IN ('f', 'p')
        ORDER BY p.proname, arguments
        """
    }

    static func relationHeader(_ table: TableRef) -> String {
        """
        SELECT c.relkind::text AS kind, obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        WHERE c.oid = \(SQLLiteral.quote(table.quoted))::regclass
        """
    }

    static func columns(of table: TableRef) -> String {
        """
        SELECT a.attname AS name, a.attnum AS ordinal, format_type(a.atttypid, a.atttypmod) AS type_name,
               a.atttypid AS type_oid, NOT a.attnotnull AS is_nullable, pg_get_expr(d.adbin, d.adrelid) AS default_value,
               (a.attidentity <> '') AS is_identity, (a.attgenerated <> '') AS is_generated,
               col_description(a.attrelid, a.attnum) AS comment,
               EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS is_primary_key
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = \(SQLLiteral.quote(table.quoted))::regclass AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
        """
    }

    static func indexes(of table: TableRef) -> String {
        """
        SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition, i.indisunique AS is_unique, i.indisprimary AS is_primary,
               (SELECT string_agg(a.attname, '\(separator)' ORDER BY k.ord)
                FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS columns
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = \(SQLLiteral.quote(table.quoted))::regclass
        ORDER BY i.indisprimary DESC, c.relname
        """
    }

    static func constraints(of table: TableRef) -> String {
        """
        SELECT con.conname AS name, con.contype::text AS kind, pg_get_constraintdef(con.oid) AS definition,
               (SELECT string_agg(a.attname, '\(separator)' ORDER BY k.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columns,
               fn.nspname AS ref_schema, fc.relname AS ref_table,
               (SELECT string_agg(a.attname, '\(separator)' ORDER BY k.ord)
                FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS ref_columns
        FROM pg_constraint con
        LEFT JOIN pg_class fc ON fc.oid = con.confrelid
        LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE con.conrelid = \(SQLLiteral.quote(table.quoted))::regclass
        ORDER BY con.contype, con.conname
        """
    }

    // MARK: Parsing

    static func parseTypes(_ result: QueryResult) -> [TypeInfo] {
        result.rows.indices.compactMap { row in
            guard let oid = result.value(row: row, column: "oid")?.stringValue.flatMap(UInt32.init),
                  let name = result.value(row: row, column: "name")?.stringValue else { return nil }
            let labels = result.value(row: row, column: "labels")?.stringValue
            return TypeInfo(
                oid: oid,
                name: name,
                schema: string(result, row, "schema") ?? "pg_catalog",
                shape: TypeInfo.Shape(typtype: string(result, row, "shape")?.first ?? "b"),
                category: string(result, row, "category")?.first ?? "X",
                elementOID: uint32(result, row, "element_oid"),
                baseOID: uint32(result, row, "base_oid"),
                subtypeOID: uint32(result, row, "subtype_oid"),
                enumLabels: labels.map { $0.components(separatedBy: separator) } ?? []
            )
        }
    }

    static func parseSchemas(_ result: QueryResult) -> [SchemaInfo] {
        result.rows.indices.compactMap { row in
            guard let name = string(result, row, "name") else { return nil }
            return SchemaInfo(name: name, owner: string(result, row, "owner") ?? "")
        }
    }

    static func parseRelations(_ result: QueryResult, schema: String) -> [RelationInfo] {
        result.rows.indices.compactMap { row in
            guard let name = string(result, row, "name"), let kind = RelationKind(relkind: string(result, row, "kind") ?? "") else { return nil }
            let estimate = string(result, row, "estimated_rows").flatMap(Int.init)
            return RelationInfo(
                ref: TableRef(schema: schema, name: name),
                kind: kind,
                estimatedRowCount: (estimate ?? -1) >= 0 ? estimate : nil,
                comment: string(result, row, "comment")
            )
        }
    }

    static func parseFunctions(_ result: QueryResult, schema: String) -> [FunctionInfo] {
        result.rows.indices.compactMap { row in
            guard let name = string(result, row, "name") else { return nil }
            return FunctionInfo(
                schema: schema,
                name: name,
                arguments: string(result, row, "arguments") ?? "",
                returnType: string(result, row, "return_type") ?? "",
                language: string(result, row, "language") ?? "",
                isProcedure: bool(result, row, "is_procedure")
            )
        }
    }

    static func parseColumns(_ result: QueryResult, catalog: TypeCatalog) -> [ColumnInfo] {
        result.rows.indices.compactMap { row in
            guard let name = string(result, row, "name") else { return nil }
            let oid = uint32(result, row, "type_oid")
            return ColumnInfo(
                name: name,
                ordinal: Int(string(result, row, "ordinal") ?? "0") ?? 0,
                typeName: string(result, row, "type_name") ?? catalog.name(of: oid),
                typeOID: oid,
                kind: catalog.kind(of: oid),
                isNullable: bool(result, row, "is_nullable"),
                defaultValue: string(result, row, "default_value"),
                isPrimaryKey: bool(result, row, "is_primary_key"),
                isIdentity: bool(result, row, "is_identity"),
                isGenerated: bool(result, row, "is_generated"),
                comment: string(result, row, "comment")
            )
        }
    }

    static func parseIndexes(_ result: QueryResult) -> [IndexInfo] {
        result.rows.indices.compactMap { row in
            guard let name = string(result, row, "name") else { return nil }
            return IndexInfo(
                name: name,
                definition: string(result, row, "definition") ?? "",
                isUnique: bool(result, row, "is_unique"),
                isPrimary: bool(result, row, "is_primary"),
                columns: list(result, row, "columns")
            )
        }
    }

    static func parseConstraints(_ result: QueryResult) -> (constraints: [ConstraintInfo], foreignKeys: [ForeignKeyInfo]) {
        var constraints: [ConstraintInfo] = []
        var foreignKeys: [ForeignKeyInfo] = []
        for row in result.rows.indices {
            guard let name = string(result, row, "name") else { continue }
            let kind = ConstraintKind(contype: string(result, row, "kind") ?? "")
            let columns = list(result, row, "columns")
            constraints.append(ConstraintInfo(name: name, kind: kind, definition: string(result, row, "definition") ?? "", columns: columns))
            if kind == .foreignKey, let refSchema = string(result, row, "ref_schema"), let refTable = string(result, row, "ref_table") {
                foreignKeys.append(ForeignKeyInfo(
                    name: name,
                    columns: columns,
                    referencedTable: TableRef(schema: refSchema, name: refTable),
                    referencedColumns: list(result, row, "ref_columns")
                ))
            }
        }
        return (constraints, foreignKeys)
    }

    // MARK: Cell accessors

    private static func string(_ result: QueryResult, _ row: Int, _ column: String) -> String? {
        result.value(row: row, column: column)?.stringValue
    }

    private static func bool(_ result: QueryResult, _ row: Int, _ column: String) -> Bool {
        string(result, row, column) == "true"
    }

    private static func uint32(_ result: QueryResult, _ row: Int, _ column: String) -> UInt32 {
        string(result, row, column).flatMap(UInt32.init) ?? 0
    }

    private static func list(_ result: QueryResult, _ row: Int, _ column: String) -> [String] {
        string(result, row, column).map { $0.components(separatedBy: separator) } ?? []
    }
}
