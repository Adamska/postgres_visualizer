import { describe, expect, it } from "vitest";

import type { QueryResult, ResultColumn } from "@/lib/types";

import { buildChartData, formatTick, mixedScales, niceTicks, suggestChart, valueExtent } from "./chart/chart";
import { groupConnections } from "./connection/groups";
import { newProfile } from "./connection/url";
import { layoutDiagram } from "./diagram/layout";
import { diffResults } from "./diff/resultDiff";
import { hotspots, nodeShare, parsePlan } from "./explain/plan";
import { groupDigits, hueOf, parseArrayLiteral, richValue, type RichColumn } from "./format/rich";
import { parseTemporal, relativeTime } from "./format/temporal";
import {
  formatBytes,
  formatElapsed,
  parseActivity,
  parsePidList,
  parseIndexUsage,
  parseTableHealth,
  sortActivity,
  summarizeActivity,
} from "./monitor/monitor";
import {
  columnSampleSql,
  lookupSql,
  newTableQuery,
  normalizeTableQuery,
  pageSql,
  type TableQuery,
} from "./query/tableQuery";
import { fuzzyFilter, fuzzyMatch } from "./search/fuzzy";
import { formatSql } from "./sql/format";
import { isReadOnlyStatement, lacksWhere, reviewStatements, statementVerb } from "./sql/safety";
import { histogram, profileColumn } from "./stats/columnProfile";
import { formatStat, numericValue, selectionStats } from "./stats/selectionStats";

const column = (name: string, kind: ResultColumn["kind"]): ResultColumn => ({
  name,
  kind,
  typeName: kind,
  typeOid: 0,
});

const result = (columns: ResultColumn[], rows: (string | null)[][]): QueryResult => ({
  columns,
  rows,
  affectedRows: null,
  durationMs: 1,
  truncated: false,
});

describe("fuzzy search", () => {
  it("prefers substrings, then word starts", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch("xyz", "orders")).toBeNull();
    expect(fuzzyMatch("ord", "orders")?.indices).toEqual([0, 1, 2]);
    const ranked = fuzzyFilter(
      ["product_order_history", "order_items", "customers", "orders"],
      "ordit",
      (name) => [name],
    ).map((r) => r.item);
    expect(ranked[0]).toBe("order_items");
    expect(ranked).not.toContain("customers");
    expect(fuzzyMatch("ord", "Connect to Supabase prod")).toBeNull();
    expect(fuzzyMatch("oed", "Open ER diagram")).not.toBeNull();
    const exact = fuzzyFilter(["orders_archive", "orders"], "orders", (n) => [n]).map((r) => r.item);
    expect(exact).toEqual(["orders", "orders_archive"]);
  });

  it("scores secondary keys lower than titles", () => {
    const items = [
      { title: "Refresh", detail: "users" },
      { title: "users", detail: "public" },
    ];
    const ranked = fuzzyFilter(items, "users", (i) => [i.title, i.detail]);
    expect(ranked.map((r) => r.item.title)).toEqual(["users", "Refresh"]);
    expect(ranked[1]?.key).toBe(1);
  });
});

describe("selection stats", () => {
  it("sums numbers and counts nulls and distinct values", () => {
    const stats = selectionStats([
      { value: "10", kind: "integer" },
      { value: "2.5", kind: "decimal" },
      { value: null, kind: "integer" },
      { value: "10", kind: "integer" },
    ]);
    expect(stats).toMatchObject({ count: 4, filled: 3, nulls: 1, distinct: 2 });
    expect(stats.numeric).toEqual({ sum: 22.5, average: 7.5, min: 2.5, max: 10 });
    expect(stats.temporal).toBeNull();
  });

  it("finds the date range and skips maths on text", () => {
    const dates = selectionStats([
      { value: "2024-03-01 10:00:00+00", kind: "timestamp" },
      { value: "2023-12-31 23:00:00+00", kind: "timestamp" },
    ]);
    expect(dates.temporal).toEqual({ min: "2023-12-31 23:00:00+00", max: "2024-03-01 10:00:00+00" });
    const text = selectionStats([{ value: "a", kind: "text" }]);
    expect(text.numeric).toBeNull();
    expect(numericValue("NaN")).toBeNull();
    expect(numericValue("-1.5e3")).toBe(-1500);
    expect(formatStat(1234567.891)).toBe("1,234,567.89");
    expect(formatStat(0.123456)).toBe("0.1235");
  });
});

describe("temporal values", () => {
  it("parses ISO output with and without zones", () => {
    expect(parseTemporal("2024-01-05 10:00:00+00", "timestamp")).toBe(Date.UTC(2024, 0, 5, 10));
    expect(parseTemporal("2024-01-05 10:00:00.5-02:30", "timestamp")).toBe(
      Date.UTC(2024, 0, 5, 12, 30, 0, 500),
    );
    expect(parseTemporal("2024-01-05", "date")).toBe(new Date(2024, 0, 5).getTime());
    expect(parseTemporal("12:30:15", "time")).toBe((12 * 3600 + 30 * 60 + 15) * 1000);
    expect(parseTemporal("infinity", "timestamp")).toBeNull();
  });

  it("describes a time relative to now", () => {
    const now = Date.UTC(2024, 0, 10);
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeTime(now + 2 * 86_400_000, now)).toBe("in 2 d");
    expect(relativeTime(now - 400 * 86_400_000, now)).toBe("1 y ago");
  });
});

describe("rich values", () => {
  const col = (kind: RichColumn["kind"], overrides: Partial<RichColumn> = {}): RichColumn => ({
    name: "value",
    kind,
    isPrimaryKey: false,
    isForeignKey: false,
    enumValues: null,
    ...overrides,
  });
  const options = { relativeTimes: true, groupDigits: true };

  it("parses array literals", () => {
    expect(parseArrayLiteral("{}")).toEqual([]);
    expect(parseArrayLiteral('{a,"b c",NULL,"NULL","x\\"y"}')).toEqual(["a", "b c", null, "NULL", 'x"y']);
    expect(parseArrayLiteral("{{1,2},{3,4}}")).toBeNull();
    expect(parseArrayLiteral("[0:1]={1,2}")).toBeNull();
  });

  it("classifies values by column", () => {
    expect(richValue("2024-01-05 10:00:00+00", col("timestamp"), options)?.kind).toBe("timestamp");
    expect(richValue("2024-01-05", col("date"), { ...options, relativeTimes: false })).toBeNull();
    const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    expect(richValue(uuid, col("uuid"), options)).toEqual({ kind: "uuid", text: uuid, hue: hueOf(uuid) });
    expect(richValue("#ff8800", col("text"), options)).toEqual({
      kind: "color",
      text: "#ff8800",
      color: "#ff8800",
    });
    expect(richValue("https://x.io/a.png?s=1", col("text"), options)?.kind).toBe("image");
    expect(richValue("paid", col("enumeration"), options)?.kind).toBe("enum");
    expect(richValue("1234567", col("integer"), options)).toEqual({ kind: "number", text: "1,234,567" });
    expect(richValue("1234567", col("integer", { name: "customer_id" }), options)).toBeNull();
    expect(richValue("123", col("integer"), options)).toBeNull();
    expect(richValue("{1,2}", col("array"), options)).toEqual({ kind: "array", items: ["1", "2"] });
    expect(groupDigits("-9876543.21")).toBe("-9,876,543.21");
    expect(hueOf("x")).toBe(hueOf("x"));
  });
});

describe("column profile", () => {
  it("builds histograms", () => {
    expect(histogram([])).toEqual([]);
    expect(histogram([5, 5])).toEqual([{ from: 5, to: 5, count: 2 }]);
    const perValue = histogram([1, 2, 2, 3], 24, true);
    expect(perValue.map((b) => b.count)).toEqual([1, 2, 1]);
    const bins = histogram([0, 10, 5], 2);
    expect(bins).toEqual([
      { from: 0, to: 5, count: 1 },
      { from: 5, to: 10, count: 2 },
    ]);
  });

  it("profiles numbers, dates, booleans and text", () => {
    const numbers = profileColumn(["1", "2", "2", null, "10"], "integer");
    expect(numbers).toMatchObject({ sampled: 5, nulls: 1, distinct: 3 });
    expect(numbers.top[0]).toEqual({ value: "2", count: 2 });
    expect(numbers.numeric).toMatchObject({ min: 1, max: 10, mean: 3.75, median: 2 });
    const dates = profileColumn(["2024-02-01", "2024-01-01"], "date");
    expect(dates.temporal).toMatchObject({ min: "2024-01-01", max: "2024-02-01" });
    expect(profileColumn(["true", "false", "true"], "boolean").boolean).toEqual({
      trueCount: 2,
      falseCount: 1,
    });
    expect(profileColumn(["ab", "abcd"], "text").text).toEqual({
      minLength: 2,
      maxLength: 4,
      averageLength: 3,
    });
    expect(profileColumn([null], "text").distinct).toBe(0);
  });
});

describe("explain plans", () => {
  const plan = JSON.stringify([
    {
      Plan: {
        "Node Type": "Hash Join",
        "Join Type": "Inner",
        "Startup Cost": 1,
        "Total Cost": 100,
        "Plan Rows": 10,
        "Plan Width": 8,
        "Actual Startup Time": 0.1,
        "Actual Total Time": 9,
        "Actual Rows": 5000,
        "Actual Loops": 1,
        "Hash Cond": "(o.customer_id = c.id)",
        Plans: [
          {
            "Node Type": "Seq Scan",
            "Relation Name": "orders",
            Alias: "o",
            "Total Cost": 60,
            "Plan Rows": 5000,
            "Actual Total Time": 6,
            "Actual Rows": 5000,
            "Actual Loops": 1,
            Filter: "(total > 10)",
            "Rows Removed by Filter": 90000,
          },
          {
            "Node Type": "Hash",
            "Total Cost": 20,
            "Plan Rows": 100,
            "Actual Total Time": 1,
            "Actual Rows": 100,
            "Actual Loops": 1,
            "Hash Batches": 4,
          },
        ],
      },
      "Planning Time": 0.2,
      "Execution Time": 9.5,
    },
  ]);

  it("parses nodes, exclusive time and warnings", () => {
    const parsed = parsePlan(plan);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.analyzed).toBe(true);
    expect(parsed.executionTime).toBe(9.5);
    expect(parsed.nodes.map((n) => n.title)).toEqual(["Hash Join", "Seq Scan on orders o", "Hash"]);
    expect(parsed.root.exclusiveTime).toBeCloseTo(2);
    expect(parsed.root.exclusiveCost).toBe(20);
    expect(parsed.root.warnings[0]).toMatch(/underestimated 500×/);
    expect(parsed.nodes[1]?.warnings[0]).toMatch(/discards 90,000 rows/);
    expect(parsed.nodes[2]?.warnings).toEqual(["Hash spilled to disk in 4 batches"]);
    expect(parsed.root.details).toContainEqual(["Hash Cond", "(o.customer_id = c.id)"]);
    expect(nodeShare(parsed.nodes[1]!, parsed)).toBeCloseTo(6 / 9);
    expect(hotspots(parsed).map((n) => n.id)).toEqual([1, 0, 2]);
  });

  it("rejects text that is not a plan", () => {
    expect(parsePlan("Seq Scan on users")).toBeNull();
    expect(parsePlan("[1]")).toBeNull();
    const estimated = parsePlan(JSON.stringify([{ Plan: { "Node Type": "Result", "Total Cost": 1 } }]));
    expect(estimated?.analyzed).toBe(false);
    expect(estimated?.root.exclusiveTime).toBeNull();
  });
});

describe("charts", () => {
  const sales = result(
    [column("day", "date"), column("region", "text"), column("revenue", "decimal"), column("id", "integer")],
    [
      ["2024-01-02", "EU", "20", "1"],
      ["2024-01-01", "US", "10.5", "2"],
      [null, "EU", "3", "3"],
    ],
  );

  it("suggests an axis and measures", () => {
    expect(suggestChart(sales.columns)).toEqual({ type: "line", x: 0, y: [2] });
    expect(suggestChart([column("region", "text"), column("n", "integer")])).toEqual({
      type: "bar",
      x: 0,
      y: [1],
    });
    expect(suggestChart([column("a", "decimal"), column("b", "decimal")])).toEqual({
      type: "scatter",
      x: 0,
      y: [1],
    });
    expect(suggestChart([column("a", "text")])).toBeNull();
  });

  it("builds sorted series and nice ticks", () => {
    const data = buildChartData(sales.columns, sales.rows, { type: "line", x: 0, y: [2] });
    expect(data.xKind).toBe("time");
    expect(data.omitted).toBe(1);
    expect(data.points.map((p) => p.values[0])).toEqual([10.5, 20]);
    expect(valueExtent(data, true)).toEqual([0, 20]);
    expect(niceTicks(0, 97)).toEqual({ ticks: [0, 20, 40, 60, 80, 100], min: 0, max: 100 });
    expect(niceTicks(0.1, 0.3, 2).ticks).toEqual([0.1, 0.2, 0.3]);
    expect(niceTicks(5, 5).ticks.length).toBeGreaterThan(1);
    expect(formatTick(12_500)).toBe("12.5k");
    expect(formatTick(2_000_000)).toBe("2M");
    expect(formatTick(5000)).toBe("5k");
    const mixed = buildChartData(
      [column("name", "text"), column("n", "integer"), column("amount", "decimal")],
      [["a", "3", "9000"]],
      { type: "bar", x: 0, y: [1, 2] },
    );
    expect(mixedScales(mixed)).toBe(true);
    expect(mixedScales(data)).toBe(false);
  });
});

describe("diagram layout", () => {
  it("puts referenced tables left of the tables pointing at them", () => {
    const nodes = ["customers", "orders", "items", "logs"].map((key) => ({ key, width: 200, height: 100 }));
    const layout = layoutDiagram(nodes, [
      { from: "orders", to: "customers" },
      { from: "items", to: "orders" },
      { from: "items", to: "items" },
    ]);
    const x = (key: string) => layout.positions[key]?.x ?? -1;
    expect(x("customers")).toBe(0);
    expect(x("orders")).toBeGreaterThan(x("customers"));
    expect(x("items")).toBeGreaterThan(x("orders"));
    expect(layout.positions.logs?.y).toBeGreaterThan(100);
    // A lookup table referenced only by a deep table sits right next to it.
    const lookup = layoutDiagram(
      ["a", "b", "c", "lookup"].map((key) => ({ key, width: 100, height: 50 })),
      [
        { from: "b", to: "a" },
        { from: "c", to: "b" },
        { from: "c", to: "lookup" },
      ],
    );
    expect(lookup.positions.lookup?.x).toBe(lookup.positions.b?.x);
    expect(layout.width).toBeGreaterThan(600);
  });

  it("survives cycles", () => {
    const nodes = ["a", "b"].map((key) => ({ key, width: 100, height: 50 }));
    const layout = layoutDiagram(nodes, [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
    expect(Object.keys(layout.positions).sort()).toEqual(["a", "b"]);
  });
});

describe("statement safety", () => {
  it("finds the verb through CTEs and EXPLAIN", () => {
    expect(statementVerb("with x as (select 1) delete from t")).toBe("delete");
    expect(statementVerb("explain delete from t")).toBe("select");
    expect(statementVerb("explain (analyze, buffers) delete from t")).toBe("delete");
    expect(statementVerb("select * into copy from t")).toBe("create");
    expect(statementVerb("set search_path = x")).toBe("session");
    expect(statementVerb("vacuum t")).toBe("other");
  });

  it("flags UPDATE and DELETE without WHERE", () => {
    expect(lacksWhere("delete from t")).toBe(true);
    expect(lacksWhere("update t set a = (select b from u where u.id = 1)")).toBe(true);
    expect(lacksWhere("update t set a = 1 where id = 2")).toBe(false);
    expect(lacksWhere("select 1")).toBe(false);
    expect(reviewStatements(["select 1", "delete from public.users"], false)).toEqual([
      { index: 1, kind: "noWhere", message: "DELETE without WHERE affects every row of public.users." },
    ]);
  });

  it("flags writes on production and guards read-only connections", () => {
    const warnings = reviewStatements(
      ["insert into t values (1)", "drop table t", "select 1", "begin"],
      true,
    );
    expect(warnings.map((w) => [w.index, w.kind])).toEqual([
      [0, "write"],
      [1, "destructive"],
    ]);
    expect(isReadOnlyStatement("select 1")).toBe(true);
    expect(isReadOnlyStatement("show search_path")).toBe(true);
    expect(isReadOnlyStatement("set default_transaction_read_only = off")).toBe(false);
    expect(isReadOnlyStatement("begin read write")).toBe(false);
    expect(isReadOnlyStatement("update t set a = 1 where id = 1")).toBe(false);
  });
});

describe("result diff", () => {
  const columns = [column("id", "integer"), column("name", "text")];

  it("matches rows on key columns", () => {
    const before = result(columns, [
      ["1", "ann"],
      ["2", "bob"],
      ["3", "cy"],
    ]);
    const after = result(columns, [
      ["1", "ann"],
      ["3", "cyrus"],
      ["4", "dee"],
    ]);
    const diff = diffResults(before, after, ["id"]);
    expect(diff).toMatchObject({ added: 1, removed: 1, changed: 1, same: 1, duplicateKeys: 0 });
    expect(diff.rows.map((r) => [r.state, r.values[0]])).toEqual([
      ["same", "1"],
      ["removed", "2"],
      ["changed", "3"],
      ["added", "4"],
    ]);
    expect(diff.rows[2]?.previous).toEqual({ 1: "cy" });
  });

  it("compares whole rows without keys and only shared columns", () => {
    const before = result(columns, [["1", "ann"]]);
    const after = result([column("name", "text"), column("extra", "text")], [["ann", "x"]]);
    const diff = diffResults(before, after, []);
    expect(diff.columns).toEqual(["name"]);
    expect(diff.same).toBe(1);
  });
});

describe("monitoring", () => {
  it("parses sessions and summarises them", () => {
    const activity = parseActivity(
      result(
        [
          "pid",
          "state",
          "backend_type",
          "query_ms",
          "blocked_by",
          "is_self",
          "max_connections",
          "query",
          "wait_event_type",
        ].map((name) => column(name, "text")),
        [
          ["10", "idle", "client backend", "5000", "{}", "false", "100", "select 1", null],
          ["11", "active", "client backend", "900", "{12}", "true", "100", "update t", "Lock"],
          ["12", "idle in transaction", "client backend", "20", "{}", "false", "100", "begin", null],
          ["13", null, "checkpointer", null, "{}", "false", "100", "", null],
        ],
      ),
    );
    expect(activity.maxConnections).toBe(100);
    expect(activity.rows[1]).toMatchObject({ pid: 11, blockedBy: [12], isSelf: true });
    expect(summarizeActivity(activity.rows)).toEqual({
      total: 3,
      active: 1,
      idle: 1,
      idleInTransaction: 1,
      waiting: 1,
      blocked: 1,
    });
    expect(sortActivity(activity.rows).map((r) => r.pid)).toEqual([11, 12, 10, 13]);
    expect(parsePidList("{1, 2,x}")).toEqual([1, 2]);
  });

  it("flags unhealthy tables and unused indexes", () => {
    const names = [
      "schema",
      "name",
      "live_rows",
      "dead_rows",
      "seq_scan",
      "idx_scan",
      "last_analyze",
      "stats_reset",
    ];
    const health = parseTableHealth(
      result(
        names.map((n) => column(n, "text")),
        [
          ["public", "events", "50000", "20000", "400", "3", null, "2024-01-01"],
          ["public", "ok", "10", "0", "1", "1", "2024-01-01", "2024-01-01"],
        ],
      ),
    );
    expect(health.statsReset).toBe("2024-01-01");
    expect(health.tables[0]?.issues).toEqual([
      "29% dead rows: needs VACUUM",
      "Mostly read by sequential scans",
      "Never analyzed",
    ]);
    expect(health.tables[1]?.issues).toEqual([]);
    const indexes = parseIndexUsage(
      result(
        ["name", "scans", "is_unique", "is_primary", "bytes"].map((n) => column(n, "text")),
        [
          ["a_idx", "0", "false", "false", "8192"],
          ["a_key", "0", "true", "false", "8192"],
        ],
      ),
    );
    expect(indexes.map((i) => i.unused)).toEqual([true, false]);
    expect(formatBytes(1536)).toBe("1.5 kB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatElapsed(65_000)).toBe("1 min 5 s");
    expect(formatElapsed(null)).toBe("");
  });
});

describe("table query extras", () => {
  const users = { schema: "public", name: "users" };

  it("searches whole rows and samples columns", () => {
    const query = { ...newTableQuery(users), search: "50%" };
    expect(pageSql(query, [])).toBe(
      `SELECT * FROM "public"."users"\nWHERE ROW("users".*)::text ILIKE '%50\\%%'\nLIMIT 200 OFFSET 0`,
    );
    expect(columnSampleSql(query, "email", 10)).toBe(
      `SELECT "email" FROM "public"."users"\nWHERE ROW("users".*)::text ILIKE '%50\\%%'\nLIMIT 10`,
    );
    expect(lookupSql(users, ["a", "b"], ["1", "x'y"], 1)).toBe(
      `SELECT * FROM "public"."users" WHERE "a" = '1' AND "b" = 'x''y' LIMIT 1`,
    );
    const legacy: Omit<TableQuery, "search"> = {
      table: users,
      filters: [],
      rawWhere: "",
      sort: [],
      page: 0,
      pageSize: 50,
    };
    expect(normalizeTableQuery(legacy).search).toBe("");
  });
});

describe("sql formatting", () => {
  it("formats PostgreSQL and keeps surrounding whitespace", () => {
    expect(formatSql("select a,b from t where x=1 and y::int>2")).toBe(
      "SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y::INT > 2",
    );
    expect(formatSql("  select 1;\n")).toBe("  SELECT\n  1;\n");
    expect(formatSql("   ")).toBe("   ");
  });
});

describe("connection groups", () => {
  it("groups open and saved connections, ungrouped first", () => {
    const profile = (id: string, name: string, group: string | null) => newProfile({ id, name, group });
    const profiles = [
      profile("a", "Shop", "Production"),
      profile("b", "Local", null),
      profile("c", "Shop", "Dev"),
      profile("d", "Api", "Dev"),
      profile("e", "Blog", " Dev "),
    ];
    const groups = groupConnections(profiles, ["c", "a", "zz"]);
    expect(groups.map((g) => g.name)).toEqual(["", "Dev", "Production"]);
    expect(groups[1]?.open).toEqual(["c"]);
    expect(groups[1]?.closed.map((p) => p.id)).toEqual(["d", "e"]);
    expect(groups[2]).toMatchObject({ open: ["a"], closed: [] });
  });
});
