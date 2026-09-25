import Foundation
import Testing
@testable import TableCore
@testable import TablePostgres

@Suite("Postgres session (integration)", .enabled(if: Integration.isAvailable), .serialized)
struct PostgresSessionIntegrationTests {
    @Test("Connects, reports the server version and closes")
    func connectAndClose() async throws {
        let session = try await Integration.connect()
        let version = try await session.serverVersion()
        #expect(version.hasPrefix("1"))
        #expect(await !session.isClosed)
        await session.close()
        #expect(await session.isClosed)
        await #expect(throws: DatabaseError.self) { try await session.execute("SELECT 1") }
    }

    @Test("Rejects bad credentials with an authentication error")
    func badPassword() async throws {
        let parsed = try ConnectionURLParser.parse(try #require(Integration.databaseURL))
        await #expect(throws: DatabaseError.self) {
            _ = try await PostgresDriver().connect(to: parsed.profile, password: "wrong")
        }
        do {
            _ = try await PostgresDriver().connect(to: parsed.profile, password: "wrong")
        } catch let error as DatabaseError {
            #expect(error.category == .authentication)
        }
    }

    @Test("Every seeded column decodes exactly like the server's text output")
    func decodingMatchesServerText() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        for table in ["customers", "orders", "order_items", "audit_log", "analytics.daily_sales"] {
            let ref = table.contains(".") ? TableRef(schema: "analytics", name: "daily_sales") : TableRef(schema: "public", name: table)
            let structure = try await session.structure(of: ref)
            let selectList = structure.columns.flatMap { column in
                ["\(SQLIdentifier.quote(column.name))", "\(SQLIdentifier.quote(column.name))::text AS \(SQLIdentifier.quote(column.name + "__text"))"]
            }.joined(separator: ", ")
            let result = try await session.execute("SELECT \(selectList) FROM \(ref.quoted) ORDER BY 1")
            #expect(!result.rows.isEmpty, "\(table) should have rows")
            for (rowIndex, row) in result.rows.enumerated() {
                for column in structure.columns {
                    let decoded = result.value(row: rowIndex, column: column.name)
                    let expected = result.value(row: rowIndex, column: column.name + "__text")
                    let context = "\(table).\(column.name) (\(column.typeName)) row \(rowIndex)"
                    let comparison = "\(String(describing: decoded)) vs \(String(describing: expected))"
                    #expect(Self.normalize(decoded) == Self.normalize(expected), "\(context): \(comparison)")
                }
                _ = row
            }
        }
    }

    @Test("Decodes a wide variety of literal expressions")
    func decodesExpressions() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        let expressions = [
            "1::int2", "-1::int4", "9007199254740993::int8", "1.5::float4", "1e-7::float8", "123456789012345678::float8",
            "12345.6789::numeric", "0.000001::numeric", "'NaN'::numeric", "'infinity'::float8",
            "true", "'x'::char", "'abc'::varchar(5)", "'abc'::char(5)", "'héllo wörld'::text", "'a''b'::text",
            "'\\xdead'::bytea", "'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid", "'2024-02-29'::date", "'0001-01-01 BC'::date", "'infinity'::date",
            "'12:34:56.789'::time", "'12:34:56+05:30'::timetz", "'2024-01-01 12:00:00.123456'::timestamp",
            "'2024-01-01 12:00:00+02'::timestamptz", "'-infinity'::timestamptz", "'1 year 2 months -3 days 04:05:06.5'::interval",
            "'-1 day 01:00'::interval", "'3 hours'::interval", "'-90 minutes'::interval",
            "'{\"a\": [1, 2, {\"b\": null}]}'::jsonb", "'{\"a\":1}'::json", "'{1,2,NULL}'::int[]", "'{{1,2},{3,4}}'::int[]",
            "'{\"a b\",\"c,d\",\"e\\\"f\",\"\",NULL,null}'::text[]", "'{}'::text[]", "'[2:3]={5,6}'::int[]",
            "'192.168.0.1/24'::inet", "'192.168.0.0/24'::cidr", "'::1'::inet", "'2001:db8:0:0:1:0:0:1'::inet",
            "'08:00:2b:01:02:03'::macaddr", "B'10110'", "'(1.5,2)'::point", "'[(0,0),(1,1)]'::lseg", "'((0,0),(1,1))'::box",
            "'<(0,0),5>'::circle", "'((0,0),(1,0),(1,1))'::polygon", "'[(0,0),(1,1)]'::path", "'{1,2,3}'::line",
            "'[1,10)'::int4range", "'empty'::int4range", "'(,)'::numrange", "'[2024-01-01,2024-02-01)'::daterange",
            "'{[1,2),[5,8)}'::int4multirange", "'\"a\"=>\"1\", \"b\"=>NULL'::hstore", "'sad'::mood", "'{happy,ok}'::mood[]",
            "ROW(1.5, 2)::dimensions", "ROW(1, 'a b', NULL)", "42::positive_int", "'12.34'::money", "'(0,1)'::tid",
            "'16/B374D848'::pg_lsn", "'1 2'::tsvector::text", "'01:02:03.5'::time", "'2024-01-01'::timestamp", "0.1::float4",
            "3.4028235e38::float4", "1e308::float8", "'2000-01-01 00:00:00'::timestamptz", "'1999-12-31 23:59:59.999999'::timestamp",
            "'00:00:00'::interval", "'-00:00:00.000001'::interval", "'1 mon -1 day'::interval", "'@ 1 day ago'::interval",
            "xmlcomment('hi')", "'$.a[*]'::jsonpath", "'x'::name", "'123'::oid", "'pg_class'::regclass", "'int4'::regtype",
        ]
        let selectList = expressions.enumerated().map { index, expression in
            "(\(expression)) AS v\(index), (\(expression))::text AS t\(index)"
        }.joined(separator: ", ")
        let result = try await session.execute("SELECT \(selectList)")
        for (index, expression) in expressions.enumerated() {
            let decoded = result.value(row: 0, column: "v\(index)")
            let expected = result.value(row: 0, column: "t\(index)")
            #expect(Self.normalize(decoded) == Self.normalize(expected), "\(expression): \(String(describing: decoded)) vs \(String(describing: expected))")
        }
    }

    /// The `::text` cast differs from the type's own output function in a few documented ways:
    /// `inet` always shows the mask, `char(n)` loses its padding, and `reg*` types show names
    /// whereas the binary wire format only carries the OID. Those differences are intentional.
    private static func normalize(_ value: CellValue?) -> CellValue? {
        guard case .text(let text)? = value else { return value }
        var normalized = text
        if normalized.hasSuffix("/32") || normalized.hasSuffix("/128") {
            normalized = String(normalized[..<normalized.lastIndex(of: "/")!])
        }
        while normalized.hasSuffix(" ") { normalized.removeLast() }
        if normalized == "pg_class" { normalized = "1259" }
        if normalized == "integer" { normalized = "23" }
        return .text(normalized)
    }

    @Test("Catalog introspection sees the seeded schema")
    func catalog() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }

        let schemas = try await session.listSchemas()
        #expect(schemas.first?.name == "public")
        #expect(schemas.contains { $0.name == "analytics" })
        #expect(schemas.contains { $0.name == "pg_catalog" && $0.isSystem })

        let relations = try await session.listRelations(in: "public")
        #expect(relations.map(\.ref.name) == ["active_customers", "audit_log", "customer_totals", "customers", "order_items", "orders"])
        #expect(relations.first { $0.ref.name == "active_customers" }?.kind == .view)
        #expect(relations.first { $0.ref.name == "customer_totals" }?.kind == .materializedView)
        #expect(relations.first { $0.ref.name == "customers" }?.comment == "People who buy things")

        let functions = try await session.listFunctions(in: "public")
        #expect(functions.contains { $0.name == "customer_count" && $0.returnType == "bigint" && !$0.isProcedure })
        #expect(functions.contains { $0.name == "archive_orders" && $0.isProcedure && $0.arguments == "IN before timestamp with time zone" })

        let customers = try await session.structure(of: TableRef(schema: "public", name: "customers"))
        #expect(customers.primaryKeyColumns == ["id"])
        #expect(customers.isEditable)
        #expect(customers.comment == "People who buy things")
        let email = try #require(customers.column(named: "email"))
        #expect(email.comment == "Unique login" && !email.isNullable && email.kind == .text)
        let id = try #require(customers.column(named: "id"))
        #expect(id.isIdentity && id.isPrimaryKey && id.kind == .integer)
        let mood = try #require(customers.column(named: "mood"))
        #expect(mood.kind == .enumeration && mood.typeName == "mood" && mood.defaultValue == "'ok'::mood")
        #expect(customers.column(named: "search_name")?.isGenerated == true)
        #expect(customers.column(named: "tags")?.kind == .array)
        #expect(customers.column(named: "score")?.kind == .integer)
        #expect(customers.column(named: "preferences")?.kind == .json)
        #expect(customers.indexes.contains { $0.isPrimary && $0.columns == ["id"] })
        #expect(customers.constraints.contains { $0.kind == .unique && $0.columns == ["email"] })

        let orders = try await session.structure(of: TableRef(schema: "public", name: "orders"))
        let customersKey = ForeignKeyInfo(
            name: "orders_customer_id_fkey",
            columns: ["customer_id"],
            referencedTable: TableRef(schema: "public", name: "customers"),
            referencedColumns: ["id"]
        )
        #expect(orders.foreignKeys == [customersKey])
        #expect(orders.indexes.contains { $0.name == "orders_customer_idx" && $0.columns == ["customer_id", "placed_at"] })
        #expect(orders.constraints.contains { $0.kind == .check })

        let items = try await session.structure(of: TableRef(schema: "public", name: "order_items"))
        #expect(items.primaryKeyColumns == ["order_id", "line"])

        let log = try await session.structure(of: TableRef(schema: "public", name: "audit_log"))
        #expect(!log.isEditable)

        let view = try await session.structure(of: TableRef(schema: "public", name: "active_customers"))
        #expect(view.kind == .view && !view.isEditable)

        let types = try await session.typeCatalog()
        #expect(types.enumLabels(of: mood.typeOID) == ["sad", "ok", "happy"])
    }

    @Test("Row limits truncate results and leave the connection usable")
    func rowLimit() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        let limited = try await session.execute("SELECT generate_series(1, 100000)", options: ExecutionOptions(rowLimit: 10))
        #expect(limited.rows.count == 10)
        #expect(limited.isTruncated)
        let next = try await session.execute("SELECT 1 AS one")
        #expect(next.rows == [[.text("1")]])
        #expect(!next.isTruncated)
    }

    @Test("Data modification reports affected rows and RETURNING rows")
    func modifications() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        _ = try await session.execute("CREATE TEMP TABLE scratch (id int PRIMARY KEY, name text)")
        let insert = try await session.execute("INSERT INTO scratch VALUES (1, 'a'), (2, 'b') RETURNING id")
        #expect(insert.affectedRows == 2)
        #expect(insert.commandTag == "INSERT 2")
        #expect(insert.rows == [[.text("1")], [.text("2")]])
        let update = try await session.execute("UPDATE scratch SET name = 'z' WHERE id > 5")
        #expect(update.affectedRows == 0)
        #expect(update.summary.hasPrefix("UPDATE 0 · 0 affected"))
        let delete = try await session.execute("DELETE FROM scratch")
        #expect(delete.affectedRows == 2)
        let ddl = try await session.execute("DROP TABLE scratch")
        #expect(ddl.rows.isEmpty && ddl.affectedRows == nil)
    }

    @Test("Server errors carry SQLSTATE, position and hints")
    func serverErrors() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        do {
            _ = try await session.execute("SELECT * FROM nowhere")
            Issue.record("expected an error")
        } catch let error as DatabaseError {
            #expect(error.category == .server)
            #expect(error.sqlState == "42P01")
            #expect(error.message == "relation \"nowhere\" does not exist")
            #expect(error.position == 15)
        }
        let recovered = try await session.execute("SELECT 2 AS two")
        #expect(recovered.rows == [[.text("2")]])
    }

    @Test("Transactions roll back on failure")
    func transactions() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        _ = try await session.execute("CREATE TEMP TABLE tx (id int PRIMARY KEY)")
        await #expect(throws: DatabaseError.self) {
            try await session.executeTransaction(["INSERT INTO tx VALUES (1)", "INSERT INTO tx VALUES (1)"])
        }
        let count = try await session.execute("SELECT count(*) FROM tx")
        #expect(count.rows == [[.text("0")]])
        let results = try await session.executeTransaction(["INSERT INTO tx VALUES (1)", "INSERT INTO tx VALUES (2)"])
        #expect(results.map(\.affectedRows) == [1, 1])
        let after = try await session.execute("SELECT count(*) FROM tx")
        #expect(after.rows == [[.text("2")]])
    }

    @Test("Change sets round trip through the server")
    func changeSetRoundTrip() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        _ = try await session.execute("CREATE TEMP TABLE people (id serial PRIMARY KEY, name text, tags text[], meta jsonb, born date)")
        _ = try await session.execute("INSERT INTO people (name, tags) VALUES ('Ann', '{a}'), ('Bob', '{b}'), ('Cy', NULL)")
        // Temp tables live in pg_temp; resolve their schema for the structure query.
        let schema = try await session.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()").rows[0][0].stringValue ?? "pg_temp"
        let ref = TableRef(schema: schema, name: "people")
        let structure = try await session.structure(of: ref)
        let query = TableQuery(table: ref)
        let page = try await session.execute(query.sql(defaultOrder: structure.primaryKeyColumns))
        #expect(page.rows.count == 3)

        var changes = ChangeSet()
        let ann = try #require(RowIdentity(structure: structure, row: page.rows[0], columns: page.columns))
        let bob = try #require(RowIdentity(structure: structure, row: page.rows[1], columns: page.columns))
        changes.setValue(.text("Ann O'Brien"), original: page.rows[0][1], column: "name", row: ann)
        changes.setValue(.text("{x,\"y z\"}"), original: page.rows[0][2], column: "tags", row: ann)
        changes.setValue(.text("{\"k\": [1, 2]}"), original: page.rows[0][3], column: "meta", row: ann)
        changes.setValue(.text("2024-02-29"), original: page.rows[0][4], column: "born", row: ann)
        changes.markDeleted(bob)
        let insert = changes.addInsert()
        changes.setInsertValue(.text("Dee"), column: "name", insertID: insert.id)
        changes.setInsertValue(.null, column: "tags", insertID: insert.id)

        _ = try await session.executeTransaction(changes.statements(for: structure))
        let after = try await session.execute("SELECT name, tags, meta, born FROM people ORDER BY id")
        #expect(after.rows == [
            [.text("Ann O'Brien"), .text("{x,\"y z\"}"), .text("{\"k\": [1, 2]}"), .text("2024-02-29")],
            [.text("Cy"), .null, .null, .null],
            [.text("Dee"), .null, .null, .null],
        ])
    }

    @Test("Filters, sorting, paging and counts work end to end")
    func tableQueries() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        var query = TableQuery(table: TableRef(schema: "public", name: "orders"), pageSize: 5)
        query.filters = [Filter(column: "status", op: .equals, value: "shipped"), Filter(column: "total", op: .greaterThan, value: "100")]
        query.sort = [SortDescriptor(column: "total", ascending: false)]
        let page = try await session.execute(query.sql(defaultOrder: ["id"]))
        #expect(page.rows.count == 5)
        let totals = page.rows.compactMap { $0[page.columnIndex(named: "total")!].stringValue }.compactMap(Double.init)
        #expect(totals == totals.sorted(by: >))
        let count = try await session.execute(query.countSQL)
        #expect(Int(count.rows[0][0].stringValue ?? "") ?? 0 > 5)

        query.filters = [Filter(column: "status", op: .contains, value: "SHIP")]
        query.rawWhere = "customer_id = (SELECT min(id) FROM customers)"
        let filtered = try await session.execute(query.countSQL)
        #expect(filtered.rows == [[.text("13")]])
    }

    @Test("CSV import plans execute against the server")
    func csvImport() async throws {
        let session = try await Integration.connect()
        defer { Task { await session.close() } }
        _ = try await session.execute("CREATE TEMP TABLE imported (id int PRIMARY KEY, label text, amount numeric)")
        let schema = try await session.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()").rows[0][0].stringValue ?? "pg_temp"
        let structure = try await session.structure(of: TableRef(schema: schema, name: "imported"))
        let document = CSVReader.parse("id,label,amount,ignored\n1,\"a, b\",1.50,x\n2,,,y\n")
        var plan = CSVImportPlan.automatic(document: document, structure: structure)
        plan.batchSize = 1
        _ = try await session.executeTransaction(plan.statements(for: document))
        let rows = try await session.execute("SELECT id, label, amount FROM imported ORDER BY id")
        #expect(rows.rows == [[.text("1"), .text("a, b"), .text("1.50")], [.text("2"), .null, .null]])
    }
}
