// Richer sample data for the browser preview and the screenshots: an orders table with every
// kind of value the grid renders specially, a chartable report, a query plan, server statistics
// and a schema graph.

import type { ColumnInfo, QueryResult, RelationInfo, SchemaGraph, TableStructure } from "@/lib/types";

import { USERS_STRUCTURE } from "./mockBackend";

function column(
  name: string,
  ordinal: number,
  typeName: string,
  kind: ColumnInfo["kind"],
  extra: Partial<ColumnInfo> = {},
): ColumnInfo {
  return {
    name,
    ordinal,
    typeName,
    typeOid: 0,
    kind,
    isNullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    isIdentity: false,
    isGenerated: false,
    comment: null,
    enumValues: null,
    ...extra,
  };
}

const STATUSES = ["pending", "paid", "shipped", "refunded"];

export const ORDERS_STRUCTURE: TableStructure = {
  schema: "public",
  name: "orders",
  kind: "table",
  comment: "Customer orders",
  columns: [
    column("id", 1, "bigint", "integer", { isPrimaryKey: true, isIdentity: true, isNullable: false }),
    column("public_id", 2, "uuid", "uuid", { isNullable: false }),
    column("customer_id", 3, "bigint", "integer", { isNullable: false }),
    column("status", 4, "order_status", "enumeration", { enumValues: STATUSES, isNullable: false }),
    column("total", 5, "numeric(12,2)", "decimal", { isNullable: false }),
    column("tags", 6, "text[]", "array"),
    column("label_color", 7, "text", "text"),
    column("photo_url", 8, "text", "text"),
    column("is_gift", 9, "boolean", "boolean"),
    column("placed_at", 10, "timestamp with time zone", "timestamp", { isNullable: false }),
  ],
  indexes: [],
  constraints: [],
  foreignKeys: [
    {
      name: "orders_customer_fk",
      columns: ["customer_id"],
      referencedSchema: "public",
      referencedTable: "customers",
      referencedColumns: ["id"],
    },
  ],
  referencedBy: [
    {
      name: "items_order_fk",
      schema: "public",
      table: "order_items",
      columns: ["order_id"],
      referencedColumns: ["id"],
    },
  ],
};

export const CUSTOMERS_STRUCTURE: TableStructure = {
  schema: "public",
  name: "customers",
  kind: "table",
  comment: null,
  columns: [
    column("id", 1, "bigint", "integer", { isPrimaryKey: true, isNullable: false }),
    column("full_name", 2, "text", "text"),
    column("email", 3, "text", "text"),
    column("country", 4, "text", "text"),
    column("created_at", 5, "timestamp with time zone", "timestamp"),
  ],
  indexes: [],
  constraints: [],
  foreignKeys: [],
  referencedBy: [
    {
      name: "orders_customer_fk",
      schema: "public",
      table: "orders",
      columns: ["customer_id"],
      referencedColumns: ["id"],
    },
  ],
};

const NAMES = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Linus Torvalds",
  "Margaret Hamilton",
];
const COUNTRIES = ["FR", "US", "GB", "US", "FI", "US"];
const TAGS = [["gift"], ["express", "fragile"], [], ["bulk"], ["vip", "express"], ["b2b", "invoice", "bulk"]];
const COLORS = ["#4f6bff", "#2f9e63", "#e08a1e", "#e5484d", "#8b3fc7", "#14b8a6"];

function uuid(seed: number): string {
  const hex = (n: number, length: number) =>
    ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, length);
  return `${hex(seed + 1, 8)}-${hex(seed + 7, 4)}-4${hex(seed + 13, 3)}-a${hex(seed + 29, 3)}-${hex(seed + 3, 8)}${hex(seed + 5, 4)}`;
}

function timestamp(hoursAgo: number): string {
  const date = new Date(Date.now() - hoursAgo * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00`;
}

function resultOf(structure: TableStructure, rows: (string | null)[][]): QueryResult {
  return {
    columns: structure.columns.map((c) => ({
      name: c.name,
      typeOid: c.typeOid,
      typeName: c.typeName,
      kind: c.kind,
    })),
    rows,
    affectedRows: null,
    durationMs: 4.2,
    truncated: false,
  };
}

export const ORDERS_RESULT = resultOf(
  ORDERS_STRUCTURE,
  Array.from({ length: 60 }, (_, i) => {
    const tags = TAGS[i % TAGS.length] ?? [];
    return [
      String(10_000 + i),
      uuid(i % 17),
      String((i % NAMES.length) + 1),
      STATUSES[(i * 7) % STATUSES.length] ?? "pending",
      (((i * 97.35) % 2400) + 12.5).toFixed(2),
      `{${tags.join(",")}}`,
      COLORS[i % COLORS.length] ?? null,
      i % 5 === 0 ? `https://picsum.photos/seed/order${i}/320/200.jpg` : null,
      i % 4 === 0 ? "true" : "false",
      timestamp(i * 7 + 1),
    ];
  }),
);

export const CUSTOMERS_RESULT = resultOf(
  CUSTOMERS_STRUCTURE,
  NAMES.map((name, i) => [
    String(i + 1),
    name,
    `${name.split(" ")[0]?.toLowerCase() ?? "user"}@example.com`,
    COUNTRIES[i] ?? null,
    timestamp(24 * 90 * (i + 1)),
  ]),
);

export const REVENUE_RESULT: QueryResult = {
  columns: [
    { name: "full_name", typeOid: 25, typeName: "text", kind: "text" },
    { name: "orders", typeOid: 20, typeName: "int8", kind: "integer" },
    { name: "revenue", typeOid: 1700, typeName: "numeric", kind: "decimal" },
  ],
  rows: NAMES.map((name, i) => [name, String(12 - i), (18_400 - i * 2350 + (i % 2) * 900).toFixed(2)]),
  affectedRows: null,
  durationMs: 8.7,
  truncated: false,
};

export const PLAN_RESULT: QueryResult = {
  columns: [{ name: "QUERY PLAN", typeOid: 114, typeName: "json", kind: "json" }],
  rows: [
    [
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Limit",
            "Startup Cost": 1830.4,
            "Total Cost": 1830.53,
            "Plan Rows": 50,
            "Plan Width": 48,
            "Actual Startup Time": 41.2,
            "Actual Total Time": 41.3,
            "Actual Rows": 6,
            "Actual Loops": 1,
            Plans: [
              {
                "Node Type": "Sort",
                "Sort Key": ["(sum(o.total)) DESC"],
                "Sort Method": "quicksort",
                "Startup Cost": 1830.4,
                "Total Cost": 1830.9,
                "Plan Rows": 200,
                "Plan Width": 48,
                "Actual Startup Time": 41.2,
                "Actual Total Time": 41.2,
                "Actual Rows": 6,
                "Actual Loops": 1,
                Plans: [
                  {
                    "Node Type": "Aggregate",
                    Strategy: "Hashed",
                    "Group Key": ["c.id"],
                    "Startup Cost": 1790,
                    "Total Cost": 1812,
                    "Plan Rows": 200,
                    "Plan Width": 48,
                    "Actual Startup Time": 40.8,
                    "Actual Total Time": 41,
                    "Actual Rows": 6,
                    "Actual Loops": 1,
                    Plans: [
                      {
                        "Node Type": "Hash Join",
                        "Join Type": "Right",
                        "Hash Cond": "(o.customer_id = c.id)",
                        "Startup Cost": 25.1,
                        "Total Cost": 1540,
                        "Plan Rows": 4800,
                        "Plan Width": 40,
                        "Actual Startup Time": 0.4,
                        "Actual Total Time": 33.9,
                        "Actual Rows": 48000,
                        "Actual Loops": 1,
                        Plans: [
                          {
                            "Node Type": "Seq Scan",
                            "Relation Name": "orders",
                            Alias: "o",
                            Filter: "(status <> 'refunded'::order_status)",
                            "Rows Removed by Filter": 152000,
                            "Startup Cost": 0,
                            "Total Cost": 1320,
                            "Plan Rows": 4800,
                            "Plan Width": 16,
                            "Actual Startup Time": 0.02,
                            "Actual Total Time": 29.1,
                            "Actual Rows": 48000,
                            "Actual Loops": 1,
                          },
                          {
                            "Node Type": "Hash",
                            "Startup Cost": 18,
                            "Total Cost": 18,
                            "Plan Rows": 6,
                            "Plan Width": 40,
                            "Actual Startup Time": 0.2,
                            "Actual Total Time": 0.2,
                            "Actual Rows": 6,
                            "Actual Loops": 1,
                            Plans: [
                              {
                                "Node Type": "Seq Scan",
                                "Relation Name": "customers",
                                Alias: "c",
                                Filter: "is_active",
                                "Startup Cost": 0,
                                "Total Cost": 18,
                                "Plan Rows": 6,
                                "Plan Width": 40,
                                "Actual Startup Time": 0.01,
                                "Actual Total Time": 0.02,
                                "Actual Rows": 6,
                                "Actual Loops": 1,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          "Planning Time": 0.31,
          "Execution Time": 41.6,
        },
      ]),
    ],
  ],
  affectedRows: null,
  durationMs: 42,
  truncated: false,
};

function textResult(names: string[], rows: (string | null)[][]): QueryResult {
  return {
    columns: names.map((name) => ({ name, typeOid: 25, typeName: "text", kind: "text" })),
    rows,
    affectedRows: null,
    durationMs: 2,
    truncated: false,
  };
}

export const ACTIVITY_RESULT = textResult(
  [
    "pid",
    "usename",
    "application_name",
    "client",
    "backend_type",
    "state",
    "wait_event_type",
    "wait_event",
    "query_ms",
    "state_ms",
    "blocked_by",
    "is_self",
    "max_connections",
    "query",
  ],
  [
    [
      "8812",
      "app",
      "api-server",
      "10.0.3.12/32",
      "client backend",
      "active",
      null,
      null,
      "184000",
      "184000",
      "{}",
      "false",
      "100",
      "SELECT o.*, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.placed_at > now() - interval '90 days' ORDER BY o.total DESC",
    ],
    [
      "8820",
      "app",
      "api-server",
      "10.0.3.12/32",
      "client backend",
      "active",
      "Lock",
      "transactionid",
      "9400",
      "9400",
      "{8830}",
      "false",
      "100",
      "UPDATE orders SET status = 'shipped' WHERE id = 10042",
    ],
    [
      "8830",
      "ops",
      "psql",
      "10.0.1.4/32",
      "client backend",
      "idle in transaction",
      "Client",
      "ClientRead",
      "620000",
      "615000",
      "{}",
      "false",
      "100",
      "UPDATE orders SET total = total * 1.2 WHERE customer_id = 3",
    ],
    [
      "8844",
      "tablepp",
      "Table++",
      "127.0.0.1/32",
      "client backend",
      "active",
      null,
      null,
      "3",
      "3",
      "{}",
      "true",
      "100",
      "SELECT pid, usename, … FROM pg_stat_activity",
    ],
    [
      "8850",
      "app",
      "worker",
      "10.0.3.20/32",
      "client backend",
      "idle",
      "Client",
      "ClientRead",
      null,
      "42000",
      "{}",
      "false",
      "100",
      "COMMIT",
    ],
    [
      "60",
      null,
      null,
      null,
      "autovacuum launcher",
      null,
      "Activity",
      "AutovacuumMain",
      null,
      null,
      "{}",
      "false",
      "100",
      "",
    ],
  ],
);

export const TABLE_HEALTH_RESULT = textResult(
  [
    "schema",
    "name",
    "total_bytes",
    "table_bytes",
    "index_bytes",
    "live_rows",
    "dead_rows",
    "seq_scan",
    "seq_tup_read",
    "idx_scan",
    "last_vacuum",
    "last_analyze",
    "stats_reset",
  ],
  [
    [
      "public",
      "events",
      "2147483648",
      "1610612736",
      "536870912",
      "18400000",
      "5200000",
      "12",
      "90000000",
      "88000",
      timestamp(24 * 9),
      timestamp(24 * 9),
      timestamp(24 * 40),
    ],
    [
      "public",
      "orders",
      "402653184",
      "268435456",
      "134217728",
      "200000",
      "1200",
      "4120",
      "610000000",
      "310",
      timestamp(5),
      timestamp(5),
      timestamp(24 * 40),
    ],
    [
      "public",
      "order_items",
      "134217728",
      "100663296",
      "33554432",
      "600000",
      "300",
      "40",
      "2400000",
      "92000",
      timestamp(30),
      null,
      timestamp(24 * 40),
    ],
    [
      "public",
      "customers",
      "8388608",
      "6291456",
      "2097152",
      "5200",
      "12",
      "900",
      "4680000",
      "41000",
      timestamp(2),
      timestamp(2),
      timestamp(24 * 40),
    ],
  ],
);

export const INDEX_USAGE_RESULT = textResult(
  ["schema", "table_name", "name", "bytes", "scans", "is_unique", "is_primary", "definition"],
  [
    [
      "public",
      "events",
      "events_pkey",
      "402653184",
      "88000",
      "true",
      "true",
      "CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)",
    ],
    [
      "public",
      "events",
      "events_payload_gin",
      "134217728",
      "0",
      "false",
      "false",
      "CREATE INDEX events_payload_gin ON public.events USING gin (payload)",
    ],
    [
      "public",
      "orders",
      "orders_pkey",
      "8388608",
      "310",
      "true",
      "true",
      "CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)",
    ],
    [
      "public",
      "orders",
      "orders_status_idx",
      "4194304",
      "0",
      "false",
      "false",
      "CREATE INDEX orders_status_idx ON public.orders USING btree (status)",
    ],
    [
      "public",
      "customers",
      "customers_email_key",
      "1048576",
      "40000",
      "true",
      "false",
      "CREATE UNIQUE INDEX customers_email_key ON public.customers USING btree (email)",
    ],
  ],
);

const graphColumns = (structure: TableStructure) =>
  structure.columns.map((c) => ({
    name: c.name,
    typeName: c.typeName,
    isPrimaryKey: c.isPrimaryKey,
    isNullable: c.isNullable,
  }));

export const PREVIEW_GRAPH: SchemaGraph = {
  schema: "public",
  tables: [
    { name: "customers", kind: "table", estimatedRows: 5200, columns: graphColumns(CUSTOMERS_STRUCTURE) },
    { name: "orders", kind: "table", estimatedRows: 200000, columns: graphColumns(ORDERS_STRUCTURE) },
    {
      name: "order_items",
      kind: "table",
      estimatedRows: 600000,
      columns: [
        { name: "order_id", typeName: "bigint", isPrimaryKey: true, isNullable: false },
        { name: "line", typeName: "integer", isPrimaryKey: true, isNullable: false },
        { name: "product_id", typeName: "bigint", isPrimaryKey: false, isNullable: false },
        { name: "quantity", typeName: "integer", isPrimaryKey: false, isNullable: false },
      ],
    },
    {
      name: "products",
      kind: "table",
      estimatedRows: 840,
      columns: [
        { name: "id", typeName: "bigint", isPrimaryKey: true, isNullable: false },
        { name: "sku", typeName: "text", isPrimaryKey: false, isNullable: false },
        { name: "name", typeName: "text", isPrimaryKey: false, isNullable: false },
        { name: "price", typeName: "numeric(10,2)", isPrimaryKey: false, isNullable: false },
      ],
    },
    { name: "users", kind: "table", estimatedRows: 3, columns: graphColumns(USERS_STRUCTURE) },
    {
      name: "teams",
      kind: "table",
      estimatedRows: 1,
      columns: [
        { name: "id", typeName: "integer", isPrimaryKey: true, isNullable: false },
        { name: "name", typeName: "text", isPrimaryKey: false, isNullable: false },
      ],
    },
    {
      name: "audit_log",
      kind: "table",
      estimatedRows: 12000,
      columns: [
        { name: "happened_at", typeName: "timestamp with time zone", isPrimaryKey: false, isNullable: false },
        { name: "message", typeName: "text", isPrimaryKey: false, isNullable: true },
      ],
    },
  ],
  foreignKeys: [
    {
      name: "orders_customer_fk",
      table: "orders",
      columns: ["customer_id"],
      referencedSchema: "public",
      referencedTable: "customers",
      referencedColumns: ["id"],
    },
    {
      name: "items_order_fk",
      table: "order_items",
      columns: ["order_id"],
      referencedSchema: "public",
      referencedTable: "orders",
      referencedColumns: ["id"],
    },
    {
      name: "items_product_fk",
      table: "order_items",
      columns: ["product_id"],
      referencedSchema: "public",
      referencedTable: "products",
      referencedColumns: ["id"],
    },
    {
      name: "users_team_fk",
      table: "users",
      columns: ["team_id"],
      referencedSchema: "public",
      referencedTable: "teams",
      referencedColumns: ["id"],
    },
  ],
};

export const PREVIEW_RELATIONS: RelationInfo[] = [
  { schema: "public", name: "customers", kind: "table", estimatedRows: 5200, comment: null },
  { schema: "public", name: "orders", kind: "table", estimatedRows: 200000, comment: "Customer orders" },
];

/** Answers for the statements the preview runs. */
export function previewResolve(sql: string): QueryResult | undefined {
  if (sql.startsWith("EXPLAIN")) return PLAN_RESULT;
  if (sql.includes("FROM pg_stat_activity")) return ACTIVITY_RESULT;
  if (sql.includes("FROM pg_stat_user_tables")) return TABLE_HEALTH_RESULT;
  if (sql.includes("FROM pg_stat_user_indexes")) return INDEX_USAGE_RESULT;
  if (sql.includes("FROM customers c")) return REVENUE_RESULT;
  if (sql.startsWith("SELECT (SELECT count(*)")) return textResult(["c0"], [["14"]]);
  if (sql.startsWith("SELECT count(*)") && sql.includes(`"public"."orders"`)) {
    return textResult(["count"], [["200000"]]);
  }
  if (sql.includes(`FROM "public"."orders"`)) {
    const sample = /^SELECT ("[a-z_]+") FROM/.exec(sql);
    if (sample) {
      const name = JSON.parse(sample[1] ?? '""') as string;
      const index = ORDERS_RESULT.columns.findIndex((c) => c.name === name);
      return {
        ...ORDERS_RESULT,
        columns: ORDERS_RESULT.columns.slice(index, index + 1),
        rows: ORDERS_RESULT.rows.map((row) => [row[index] ?? null]),
      };
    }
    return ORDERS_RESULT;
  }
  if (sql.includes(`FROM "public"."customers"`)) {
    const id = /"id" = '(\d+)'/.exec(sql)?.[1];
    return id
      ? { ...CUSTOMERS_RESULT, rows: CUSTOMERS_RESULT.rows.filter((r) => r[0] === id) }
      : CUSTOMERS_RESULT;
  }
  return undefined;
}
