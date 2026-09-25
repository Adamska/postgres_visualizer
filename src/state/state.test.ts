import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newProfile } from "@/core/connection/url";
import { installBackend } from "@/lib/backend";
import { createMockBackend, USERS, type MockBackend } from "@/test/mockBackend";

import { startApp } from "./actions/app";
import { connect, disconnect } from "./actions/connections";
import { deleteProfile, saveProfile } from "./actions/profiles";
import {
  errorMarkerFor,
  queryCompletions,
  runQuery,
  setQuerySelection,
  setQueryText,
  statementsFor,
} from "./actions/queryTab";
import {
  addRow,
  cellValue,
  commitChanges,
  discardChanges,
  duplicateRows,
  exportTable,
  foreignKeyTarget,
  loadTable,
  pendingStatements,
  setCell,
  sortBy,
  toggleDeleteRows,
} from "./actions/tableTab";
import {
  closeTab,
  flushWorkspace,
  openQuery,
  openStructure,
  openTable,
  selectTabByNumber,
  selectTabByOffset,
} from "./actions/workspace";
import { flushHistory } from "./actions/storage";
import { useSettings } from "./settings";
import { findTab, getState, resetStore } from "./store";

let backend: MockBackend;
let restore: () => void;

beforeEach(() => {
  resetStore();
  backend = createMockBackend();
  restore = installBackend(backend);
});

afterEach(() => {
  restore();
});

async function connected() {
  const profile = newProfile({ name: "Mock" });
  await saveProfile(profile, "secret");
  const ok = await connect(profile);
  expect(ok).toBe(true);
  return profile;
}

describe("profiles and connections", () => {
  it("saves profiles with their password and connects", async () => {
    const profile = await connected();
    expect(getState().profiles.map((p) => p.name)).toEqual(["Mock"]);
    expect(backend.passwords[profile.id]).toBe("secret");
    const connection = getState().connections[profile.id];
    expect(connection?.status).toBe("connected");
    expect(connection?.schemas.map((s) => s.name)).toEqual(["public", "pg_catalog"]);
    expect(connection?.relations.public?.map((r) => r.name)).toEqual(["users", "teams", "active_users"]);
    await deleteProfile(profile.id);
    expect(getState().profiles).toEqual([]);
    expect(backend.passwords[profile.id]).toBeUndefined();
  });

  it("reports failures without keeping the connection", async () => {
    const profile = newProfile({ name: "Broken" });
    await saveProfile(profile, "wrong");
    expect(await connect(profile)).toBe(false);
    expect(getState().connections[profile.id]).toBeUndefined();
    expect(getState().toasts[0]?.message).toBe("password authentication failed");
  });
});

describe("tabs and workspace", () => {
  it("opens, reuses, cycles and closes tabs", async () => {
    const profile = await connected();
    const first = openTable(profile.id, USERS);
    expect(openTable(profile.id, USERS)).toBe(first);
    const filtered = openTable(profile.id, USERS, [
      { id: "f", column: "id", op: "equals", value: "1", enabled: true },
    ]);
    expect(filtered).not.toBe(first);
    const query = openQuery(null, "select 1");
    expect(getState().tabs).toHaveLength(3);
    expect(getState().activeTabId).toBe(query);
    selectTabByOffset(1);
    expect(getState().activeTabId).toBe(first);
    selectTabByNumber(2);
    expect(getState().activeTabId).toBe(filtered);
    await closeTab(filtered);
    expect(getState().tabs).toHaveLength(2);
    expect(getState().activeTabId).toBe(query);
    await disconnect(profile.id);
    expect(getState().tabs).toEqual([]);
    expect(getState().connections).toEqual({});
  });

  it("restores the workspace at start", async () => {
    const profile = await connected();
    openTable(profile.id, USERS);
    openQuery(null, "select 42", "Answer");
    openStructure(profile.id, USERS);
    await flushWorkspace();
    const documents = backend.documents;
    resetStore();
    useSettings.setState({ settings: { ...useSettings.getState().settings, restoreWorkspace: true } });
    backend.documents = documents;
    await startApp();
    const state = getState();
    expect(state.ready).toBe(true);
    expect(Object.keys(state.connections)).toEqual([profile.id]);
    expect(state.tabs.map((t) => t.kind)).toEqual(["table", "query", "structure"]);
    const query = state.tabs[1];
    expect(query?.kind === "query" && query.text).toBe("select 42");
    expect(state.activeTabId).toBe(state.tabs[2]?.id);
  });
});

describe("table tab", () => {
  it("loads, stages edits, renders SQL and commits", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    let tab = findTab(tabId, "table");
    expect(tab?.result?.rows).toHaveLength(3);
    expect(tab?.structure?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)).toEqual(["id"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(findTab(tabId, "table")?.totalCount).toBe(3);

    setCell(tabId, 0, 1, { kind: "text", value: "new@example.com" });
    setCell(tabId, 2, 4, { kind: "null" });
    toggleDeleteRows(tabId, [1]);
    addRow(tabId);
    tab = findTab(tabId, "table");
    expect(tab?.focusRequest).toEqual({ row: 3, column: 1 });
    setCell(tabId, 3, 1, { kind: "text", value: "dee@example.com" });
    tab = findTab(tabId, "table");
    expect(cellValue(tab!, 0, 1)).toBe("new@example.com");
    expect(cellValue(tab!, 2, 4)).toBeNull();
    expect(cellValue(tab!, 3, 0)).toBeUndefined();
    expect(pendingStatements(tab!)).toEqual([
      `DELETE FROM "public"."users" WHERE "id" = '2'`,
      `UPDATE "public"."users" SET "email" = 'new@example.com' WHERE "id" = '1'`,
      `UPDATE "public"."users" SET "team_id" = NULL WHERE "id" = '3'`,
      `INSERT INTO "public"."users" ("email") VALUES ('dee@example.com')`,
    ]);

    expect(await commitChanges(tabId)).toBe(true);
    tab = findTab(tabId, "table");
    expect(pendingStatements(tab!)).toEqual([]);
    expect(backend.executed).toContain(
      `UPDATE "public"."users" SET "email" = 'new@example.com' WHERE "id" = '1'`,
    );

    setCell(tabId, 0, 1, { kind: "text", value: "x" });
    setCell(tabId, 0, 1, { kind: "text", value: "ann@example.com" });
    expect(pendingStatements(findTab(tabId, "table")!)).toEqual([]);
    duplicateRows(tabId, [0]);
    expect(pendingStatements(findTab(tabId, "table")!)[0]).toMatch(
      /^INSERT INTO "public"."users" \("email", "is_active", "profile", "team_id"\)/,
    );
    discardChanges(tabId);
    expect(pendingStatements(findTab(tabId, "table")!)).toEqual([]);
  });

  it("follows foreign keys, sorts and exports", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, USERS);
    await loadTable(tabId);
    const tab = findTab(tabId, "table")!;
    expect(foreignKeyTarget(tab, 0, 4)).toEqual({
      table: { schema: "public", name: "teams" },
      filter: expect.objectContaining({ column: "id", value: "1" }) as unknown,
    });
    expect(foreignKeyTarget(tab, 1, 4)).toBeNull();
    await sortBy(tabId, "email");
    expect(findTab(tabId, "table")?.query.sort).toEqual([{ column: "email", ascending: true }]);
    expect(backend.executed.at(-2)).toContain('ORDER BY "email" ASC');
    const csv = exportTable({ ...tab, selection: { rows: [1], focused: null } }, "csv", true);
    expect(csv).toBe("id,email,is_active,profile,team_id\n2,bob@example.com,false,,\n");
  });

  it("keeps views read-only", async () => {
    const profile = await connected();
    const tabId = openTable(profile.id, { schema: "public", name: "active_users" });
    await loadTable(tabId);
    addRow(tabId);
    expect(pendingStatements(findTab(tabId, "table")!)).toEqual([]);
  });
});

describe("query tab", () => {
  it("selects statements by caret or selection", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "select 1;\nselect 2;\n\nselect 3")!;
    setQuerySelection(tabId, { anchor: 12, head: 12 });
    expect(statementsFor(findTab(tabId, "query")!, "current").map((s) => s.text)).toEqual(["select 2"]);
    setQuerySelection(tabId, { anchor: 0, head: 19 });
    expect(statementsFor(findTab(tabId, "query")!, "current").map((s) => s.text)).toEqual([
      "select 1",
      "select 2",
    ]);
    expect(statementsFor(findTab(tabId, "query")!, "all")).toHaveLength(3);
  });

  it("runs on a dedicated session, records history and tracks transactions", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "BEGIN;\nSELECT * FROM users;\nUPDATE users SET a = 1;")!;
    await runQuery(tabId, "all");
    const tab = findTab(tabId, "query")!;
    expect(tab.results).toHaveLength(3);
    expect(tab.inTransaction).toBe(true);
    expect(tab.selectedResult).toBe(2);
    expect(tab.sessionId).toBe("session-2");
    expect(tab.status).toMatch(/^3 statements in/);
    await flushHistory();
    const history = backend.documents.history as { sql: string }[];
    expect(history.map((h) => h.sql)).toEqual(["UPDATE users SET a = 1", "SELECT * FROM users", "BEGIN"]);
    setQueryText(tabId, "COMMIT;");
    await runQuery(tabId, "all");
    expect(findTab(tabId, "query")?.inTransaction).toBe(false);
    await closeTab(tabId);
    expect(backend.closed).toContain("session-2");
  });

  it("maps errors to editor markers", () => {
    const statement = { text: "select * from nowhere", start: 10, end: 31 };
    const error = {
      kind: "server" as const,
      message: "relation does not exist",
      detail: null,
      hint: null,
      sqlState: "42P01",
      position: 15,
    };
    expect(errorMarkerFor(error, statement)).toEqual({
      from: 24,
      to: 31,
      message: "relation does not exist",
    });
    expect(errorMarkerFor({ ...error, position: null }, statement)).toBeNull();
  });

  it("stops on failure and clears the marker on edit", async () => {
    restore();
    backend = createMockBackend({
      executeError: {
        kind: "server",
        message: "syntax error",
        detail: null,
        hint: null,
        sqlState: "42601",
        position: 1,
      },
    });
    restore = installBackend(backend);
    const profile = await connected();
    const tabId = openQuery(profile.id, "selec 1;\nselect 2")!;
    await runQuery(tabId, "all");
    let tab = findTab(tabId, "query")!;
    expect(tab.error?.message).toBe("syntax error");
    expect(tab.errorMarker).toEqual({ from: 0, to: 5, message: "syntax error" });
    expect(tab.results).toEqual([]);
    setQueryText(tabId, "select 1");
    tab = findTab(tabId, "query")!;
    expect(tab.errorMarker).toBeNull();
  });

  it("completes columns of referenced tables", async () => {
    const profile = await connected();
    const tabId = openQuery(profile.id, "select u. from users u")!;
    queryCompletions(tabId, "", "u");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryCompletions(tabId, "", "u").map((c) => c.text)).toEqual([
      "email",
      "id",
      "is_active",
      "profile",
      "team_id",
    ]);
    const tables = queryCompletions(tabId, "us", null);
    expect(tables[0]?.kind).not.toBe("keyword");
    expect(tables.some((c) => c.text === "users" && c.kind === "table")).toBe(true);
  });
});
