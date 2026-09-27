import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newProfile } from "@/core/connection/url";
import { newFilter } from "@/core/query/tableQuery";
import { installBackend } from "@/lib/backend";
import type { ConnectionProfile, QueryResult } from "@/lib/types";
import { createMockBackend, USERS, USERS_STRUCTURE, type MockBackend } from "@/test/mockBackend";

import { isCommandAvailable } from "./actions/commands";
import { connect, READ_ONLY_SQL } from "./actions/connections";
import { loadDiagram, moveDiagramTable, resetDiagramLayout } from "./actions/diagramTab";
import { flushLayouts, resetLayouts, storedLayout } from "./actions/layouts";
import { clearPasswordCache, loadProfiles, saveProfile } from "./actions/profiles";
import {
  explainQuery,
  formatQuery,
  pinResult,
  runQuery,
  runStatements,
  setCompare,
  statementsFor,
  unpinResult,
} from "./actions/queryTab";
import { incomingCountSql, loadRelated } from "./actions/related";
import { refreshServerTab, setServerPane, signalBackend } from "./actions/serverTab";
import {
  addFilterAndApply,
  filterByValue,
  followForeignKey,
  goBack,
  goForward,
  isTabEditable,
  loadColumnSample,
  loadTable,
  rowRecord,
  setCell,
  setSearch,
  updateLayout,
} from "./actions/tableTab";
import { deleteSavedView, loadSavedViews, openSavedView, saveView } from "./actions/views";
import { openDiagram, openQuery, openServer, openTable } from "./actions/workspace";
import { toggleHidden } from "@/features/grid/columnLayout";
import { findTab, getState, resetStore } from "./store";

let backend: MockBackend;
let restore: () => void;

const result = (names: string[], rows: (string | null)[][]): QueryResult => ({
  columns: names.map((name) => ({ name, typeOid: 25, typeName: "text", kind: "text" })),
  rows,
  affectedRows: null,
  durationMs: 1,
  truncated: false,
});

beforeEach(() => {
  resetStore();
  resetLayouts();
  clearPasswordCache();
  backend = createMockBackend();
  restore = installBackend(backend);
});

afterEach(() => restore());

async function connected(overrides: Partial<ConnectionProfile> = {}) {
  const profile = newProfile({ name: "Mock", ...overrides });
  await saveProfile(profile, "secret");
  expect(await connect(profile)).toBe(true);
  return profile;
}

describe("statement safety", () => {
  it("asks before UPDATE or DELETE without WHERE", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "DELETE FROM users")!;
    await runQuery(tabId, "all");
    const dialog = getState().dialog;
    expect(dialog?.kind).toBe("confirmRun");
    expect(backend.executed).not.toContain("DELETE FROM users");
    if (dialog?.kind !== "confirmRun") return;
    expect(dialog.warnings[0]?.kind).toBe("noWhere");
    await runStatements(tabId, dialog.statements, true);
    expect(backend.executed).toContain("DELETE FROM users");
  });

  it("asks before any write on production", async () => {
    const profile = await connected({ environment: "production" });
    const tabId = openQuery(profile.id, "INSERT INTO users (email) VALUES ('x')")!;
    await runQuery(tabId, "all");
    expect(getState().dialog?.kind).toBe("confirmRun");
    openQuery(profile.id, "SELECT 1");
    await runQuery(getState().activeTabId!, "all");
    expect(backend.executed).toContain("SELECT 1");
  });

  it("opens read-only sessions and refuses writes", async () => {
    const profile = await connected({ readOnly: true });
    expect(backend.executed).toContain(READ_ONLY_SQL);
    const tabId = openQuery(profile.id, "UPDATE users SET email = 'x' WHERE id = 1")!;
    await runQuery(tabId, "all");
    expect(findTab(tabId, "query")?.error?.message).toBe("This connection is read-only.");
    expect(backend.executed.filter((sql) => sql.startsWith("UPDATE"))).toEqual([]);
    const tableTab = openTable(profile.id, USERS);
    await loadTable(tableTab);
    expect(isTabEditable(findTab(tableTab, "table")!)).toBe(false);
    setCell(tableTab, 0, 1, { kind: "text", value: "changed" });
    expect(findTab(tableTab, "table")?.changes.updates).toEqual({});
  });
});

describe("table navigation", () => {
  it("follows foreign keys in place and goes back and forward", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    expect(isCommandAvailable("nav.back")).toBe(false);
    await followForeignKey(tabId, 0, 4, false);
    let tab = findTab(tabId, "table")!;
    expect(tab.query.table.name).toBe("teams");
    expect(tab.query.filters.map((f) => [f.column, f.value])).toEqual([["id", "1"]]);
    expect(tab.history.back).toHaveLength(1);
    expect(isCommandAvailable("nav.back")).toBe(true);
    expect(await goBack(tabId)).toBe(true);
    tab = findTab(tabId, "table")!;
    expect(tab.query.table.name).toBe("users");
    expect(tab.history.forward).toHaveLength(1);
    expect(await goForward(tabId)).toBe(true);
    expect(findTab(tabId, "table")?.query.table.name).toBe("teams");
    expect(await goForward(tabId)).toBe(false);
  });

  it("opens a new tab instead when edits are pending", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    setCell(tabId, 0, 1, { kind: "text", value: "changed@example.com" });
    await followForeignKey(tabId, 0, 4, false);
    expect(getState().tabs).toHaveLength(2);
    expect(findTab(tabId, "table")?.query.table.name).toBe("users");
    await followForeignKey(tabId, 0, 4, true);
    expect(getState().tabs).toHaveLength(3);
  });

  it("searches every column, filters on cell values and samples columns", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    await setSearch(tabId, "ann");
    expect(backend.executed.some((sql) => sql.includes(`ROW("users".*)::text ILIKE '%ann%'`))).toBe(true);
    await filterByValue(tabId, 1, 2, "equals");
    expect(findTab(tabId, "table")?.query.filters.map((f) => [f.column, f.op, f.value])).toEqual([
      ["is_active", "equals", "false"],
    ]);
    await addFilterAndApply(tabId, newFilter("profile", "isNull"));
    expect(findTab(tabId, "table")?.query.filters).toHaveLength(2);
    const sample = await loadColumnSample(tabId, "email");
    expect(sample).toHaveLength(3);
    expect(backend.executed.at(-1)).toMatch(/^SELECT "email" FROM "public"."users"\nWHERE .*\nLIMIT 20000$/s);
    expect(rowRecord(findTab(tabId, "table")!, 0).email).toBe("ann@example.com");
  });
});

describe("layouts and saved views", () => {
  it("remembers column layouts per table", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    updateLayout(tabId, (layout) => toggleHidden(layout, "profile"));
    await flushLayouts();
    expect(storedLayout(profile.id, USERS).hidden).toEqual(["profile"]);
    const other = openTable(profile.id, USERS, [newFilter("id", "equals", "1")]);
    expect(findTab(other, "table")?.layout.hidden).toEqual(["profile"]);
  });

  it("saves, reopens and deletes views", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS, [newFilter("email", "contains", "example")]);
    updateLayout(tabId, (layout) => toggleHidden(layout, "profile"));
    const view = await saveView(tabId, "Examples", null);
    expect(view?.filters[0]?.value).toBe("example");
    expect(getState().savedViews).toHaveLength(1);
    resetStore();
    await loadProfiles();
    await connect(profile);
    await loadSavedViews();
    expect(getState().savedViews[0]?.name).toBe("Examples");
    await openSavedView(getState().savedViews[0]!);
    const opened = getState().tabs[0];
    expect(opened?.kind === "table" && opened.query.filters[0]?.value).toBe("example");
    expect(opened?.kind === "table" && opened.layout.hidden).toEqual(["profile"]);
    await deleteSavedView(view!.id);
    expect(getState().savedViews).toEqual([]);
  });
});

describe("query results", () => {
  it("pins results and compares against them", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "SELECT * FROM users")!;
    await runQuery(tabId, "all");
    pinResult(tabId);
    const pin = findTab(tabId, "query")!.pinned[0]!;
    expect(pin.result.rows).toHaveLength(3);
    setCompare(tabId, pin.id, ["id"]);
    expect(findTab(tabId, "query")?.compare).toEqual({ pinnedId: pin.id, keyColumns: ["id"] });
    await runQuery(tabId, "all");
    expect(findTab(tabId, "query")?.compare).toBeNull();
    unpinResult(tabId, pin.id);
    expect(findTab(tabId, "query")?.pinned).toEqual([]);
  });

  it("explains as JSON and opens the plan view", async () => {
    const plan = JSON.stringify([
      { Plan: { "Node Type": "Seq Scan", "Relation Name": "users", "Total Cost": 1 } },
    ]);
    backend.resolve = (sql) =>
      sql.startsWith("EXPLAIN (FORMAT JSON)")
        ? {
            ...result(["QUERY PLAN"], [[plan]]),
            columns: [{ name: "QUERY PLAN", typeOid: 114, typeName: "json", kind: "json" }],
          }
        : undefined;
    const profile = await connected();
    const tabId = openQuery(profile.id, "SELECT * FROM users")!;
    await explainQuery(tabId, false);
    expect(backend.executed).toContain("EXPLAIN (FORMAT JSON) SELECT * FROM users");
    expect(findTab(tabId, "query")?.resultView).toBe("plan");
    await runQuery(tabId, "all");
    expect(findTab(tabId, "query")?.resultView).toBe("grid");
  });

  it("formats the script or the selection", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "select a,b from t")!;
    formatQuery(tabId);
    expect(findTab(tabId, "query")?.text).toBe("SELECT\n  a,\n  b\nFROM\n  t");
    expect(statementsFor(findTab(tabId, "query")!, "all")).toHaveLength(1);
  });
});

describe("related records", () => {
  it("loads referenced rows and counts referencing ones", async () => {
    backend.resolve = (sql) =>
      sql.startsWith("SELECT (SELECT count(*)") ? result(["c0"], [["12"]]) : undefined;
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    const related = await loadRelated(profile.id, USERS_STRUCTURE, rowRecord(findTab(tabId, "table")!, 0), 0);
    expect(related.outgoing[0]?.table.name).toBe("teams");
    expect(related.outgoing[0]?.result?.rows[0]).toEqual(["1", "Core"]);
    expect(related.incoming[0]).toMatchObject({ table: { name: "orders" }, count: 12, result: null });
    expect(related.incoming[0]?.filters.map((f) => [f.column, f.value])).toEqual([["user_id", "1"]]);
    expect(
      incomingCountSql([
        { table: { schema: "public", name: "orders" }, columns: ["user_id"], values: ["1"] },
      ]),
    ).toBe(`SELECT (SELECT count(*) FROM "public"."orders" WHERE "user_id" = '1') AS "c0"`);
    // NULL keys have nothing to follow.
    const none = await loadRelated(profile.id, USERS_STRUCTURE, { team_id: null, id: null }, 0);
    expect(none).toEqual({ outgoing: [], incoming: [] });
  });
});

describe("diagram and server tabs", () => {
  it("loads the schema graph and remembers dragged tables", async () => {
    const profile = await connected();
    const tabId = openDiagram(profile.id, "public");
    expect(openDiagram(profile.id, "public")).toBe(tabId);
    await loadDiagram(tabId);
    expect(findTab(tabId, "diagram")?.graph?.tables.map((t) => t.name)).toEqual(["teams", "users"]);
    moveDiagramTable(tabId, "users", { x: 10.4, y: 20.6 });
    expect(findTab(tabId, "diagram")?.positions).toEqual({ users: { x: 10, y: 21 } });
    resetDiagramLayout(tabId);
    expect(findTab(tabId, "diagram")?.positions).toEqual({});
  });

  it("loads sessions, statistics and signals backends", async () => {
    backend.resolve = (sql) => {
      if (sql.includes("FROM pg_stat_activity")) {
        return result(
          ["pid", "state", "backend_type", "is_self", "query"],
          [["42", "active", "client backend", "false", "select 1"]],
        );
      }
      if (sql.includes("FROM pg_stat_user_tables")) {
        return result(["schema", "name", "live_rows"], [["public", "users", "3"]]);
      }
      if (sql.includes("FROM pg_stat_user_indexes")) return result(["name", "scans"], [["users_pkey", "5"]]);
      if (sql.startsWith("SELECT pg_terminate_backend(42)")) return result(["ok"], [["true"]]);
      return undefined;
    };
    const profile = await connected();
    const tabId = openServer(profile.id);
    await refreshServerTab(tabId);
    expect(findTab(tabId, "server")?.activity?.rows[0]?.pid).toBe(42);
    await setServerPane(tabId, "tables");
    expect(findTab(tabId, "server")?.tables?.tables[0]?.name).toBe("users");
    expect(openServer(profile.id, "indexes")).toBe(tabId);
    await refreshServerTab(tabId);
    expect(findTab(tabId, "server")?.indexes?.[0]?.name).toBe("users_pkey");
    await signalBackend(tabId, 42, true);
    expect(backend.executed).toContain("SELECT pg_terminate_backend(42)");
    expect(getState().toasts.at(-1)?.title).toBe("Terminated session 42");
  });
});
