// Query tab behaviour: running statements on a dedicated session, history, completion.

import {
  completions as engineCompletions,
  referencedTables,
  tableKey,
  type Completion,
} from "@/core/completion/engine";
import { exportRows, type ExportFormat } from "@/core/exchange/export";
import { formatDuration, resultSummary } from "@/core/format/values";
import { classifyStatement, splitStatements, statementAt, type Statement } from "@/core/sql/splitter";
import { tokenize } from "@/core/sql/tokenizer";
import type { EditorErrorMarker, RunScope } from "@/features/editor/types";
import { backend } from "@/lib/backend";
import {
  toAppError,
  type AppError,
  type QueryHistoryEntry,
  type QueryResult,
  type SavedQuery,
} from "@/lib/types";

import { useSettings } from "../settings";
import { findTab, getState, mutateTab, pushToast, type QueryTab } from "../store";
import { allRelations, connectionParams, loadStructure } from "./connections";
import { loadPassword } from "./profiles";
import { recordHistory, saveQuery as storeSavedQuery } from "./storage";
import { persistWorkspace } from "./workspace";

export function queryTitle(tab: QueryTab): string {
  if (tab.customTitle) return tab.customTitle;
  const firstLine =
    tab.text
      .split(/\r?\n/)
      .find((line) => line.trim() !== "")
      ?.trim() ?? "";
  if (firstLine === "") return "Query";
  return firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
}

export function setQueryText(tabId: string, text: string): void {
  mutateTab(tabId, "query", (t) => {
    if (t.text === text) return;
    t.text = text;
    t.errorMarker = null;
  });
  persistWorkspace();
}

export function setQuerySelection(tabId: string, selection: { anchor: number; head: number }): void {
  mutateTab(tabId, "query", (t) => {
    t.selection = selection;
  });
}

/** Statements to run for a scope. */
export function statementsFor(tab: QueryTab, scope: RunScope): Statement[] {
  if (scope === "all") return splitStatements(tab.text);
  const from = Math.min(tab.selection.anchor, tab.selection.head);
  const to = Math.max(tab.selection.anchor, tab.selection.head);
  if (to > from) {
    const selected = tab.text.slice(from, to);
    return splitStatements(selected).map((s) => ({ ...s, start: s.start + from, end: s.end + from }));
  }
  const statement = statementAt(tab.text, from);
  return statement ? [statement] : [];
}

/** Maps a server error position (1-based, in characters) to an editor range over the offending token. */
export function errorMarkerFor(error: AppError, statement: Statement): EditorErrorMarker | null {
  if (error.position === null || error.position <= 0 || statement.end <= statement.start) return null;
  const offset = Math.min(error.position - 1, statement.text.length);
  const token = tokenize(statement.text).find(
    (t) => t.start <= offset && offset < t.end && t.kind !== "whitespace",
  );
  const from = statement.start + (token?.start ?? offset);
  const to = statement.start + (token?.end ?? Math.min(offset + 1, statement.text.length));
  return { from, to: Math.max(to, from + 1), message: error.message };
}

async function sessionFor(tab: QueryTab): Promise<string> {
  if (tab.sessionId) return tab.sessionId;
  const connection = getState().connections[tab.connectionId];
  if (!connection) throw toAppError({ kind: "connection", message: "Not connected." });
  const password = await loadPassword(connection.profile.id);
  const sessionId = await backend().connect(connectionParams(connection.profile, password));
  mutateTab(tab.id, "query", (t) => {
    t.sessionId = sessionId;
  });
  return sessionId;
}

export function runQuery(tabId: string, scope: RunScope): Promise<void> {
  const tab = findTab(tabId, "query");
  if (!tab || tab.running) return Promise.resolve();
  return execute(tabId, statementsFor(tab, scope));
}

export function explainQuery(tabId: string, analyze: boolean): Promise<void> {
  const tab = findTab(tabId, "query");
  const statement = tab ? statementsFor(tab, "current")[0] : undefined;
  if (!tab || tab.running || !statement) return Promise.resolve();
  const options = analyze ? "(ANALYZE, BUFFERS, FORMAT TEXT)" : "(FORMAT TEXT)";
  return execute(tabId, [{ ...statement, text: `EXPLAIN ${options} ${statement.text}` }]);
}

/** Runs a statement that is not part of the editor, such as COMMIT from the toolbar. */
export function runDetached(tabId: string, sql: string): Promise<void> {
  return execute(tabId, [{ text: sql, start: 0, end: 0 }]);
}

async function execute(tabId: string, statements: Statement[]): Promise<void> {
  const tab = findTab(tabId, "query");
  if (!tab || statements.length === 0) return;
  mutateTab(tabId, "query", (t) => {
    t.running = true;
    t.error = null;
    t.errorMarker = null;
    t.status = null;
  });
  const rowLimit = useSettings.getState().settings.queryRowLimit;
  const collected: QueryResult[] = [];
  const started = performance.now();
  let failure: AppError | null = null;
  try {
    const sessionId = await sessionFor(tab);
    for (const statement of statements) {
      const statementStart = performance.now();
      try {
        const result = await backend().executeSql(sessionId, statement.text, rowLimit);
        collected.push(result);
        trackTransaction(tabId, statement.text);
        void recordHistory(
          historyEntry(
            tab,
            statement.text,
            result.durationMs,
            true,
            result.columns.length > 0 ? result.rows.length : result.affectedRows,
          ),
        );
      } catch (error) {
        failure = toAppError(error);
        void recordHistory(
          historyEntry(tab, statement.text, performance.now() - statementStart, false, null),
        );
        if (failure.kind === "cancelled") await resetSession(tabId);
        const marker = errorMarkerFor(failure, statement);
        const inTransaction = findTab(tabId, "query")?.inTransaction ?? false;
        mutateTab(tabId, "query", (t) => {
          t.error = failure;
          t.errorMarker = marker;
          if (inTransaction && failure?.kind === "server") {
            t.status = "Transaction aborted. Run ROLLBACK to continue.";
          }
        });
        break;
      }
    }
  } catch (error) {
    failure = toAppError(error);
    mutateTab(tabId, "query", (t) => {
      t.error = failure;
    });
  }
  const elapsed = performance.now() - started;
  mutateTab(tabId, "query", (t) => {
    t.results = collected;
    t.selectedResult = Math.max(0, collected.length - 1);
    t.version += 1;
    t.running = false;
    t.gridSelection = { rows: [], focused: null };
    if (!failure) {
      const last = collected.at(-1);
      t.status =
        collected.length === 1 && last
          ? resultSummary(last)
          : `${collected.length} statements in ${formatDuration(elapsed)}`;
    }
  });
}

function historyEntry(
  tab: QueryTab,
  sql: string,
  durationMs: number,
  succeeded: boolean,
  rowCount: number | null,
): QueryHistoryEntry {
  return {
    id: crypto.randomUUID(),
    profileId: tab.connectionId,
    sql,
    executedAt: new Date().toISOString(),
    durationMs,
    succeeded,
    rowCount,
  };
}

function trackTransaction(tabId: string, sql: string): void {
  const kind = classifyStatement(sql);
  if (kind === "begin" || kind === "commit" || kind === "rollback") {
    mutateTab(tabId, "query", (t) => {
      t.inTransaction = kind === "begin";
    });
  }
}

async function resetSession(tabId: string): Promise<void> {
  const tab = findTab(tabId, "query");
  if (tab?.sessionId) {
    await backend()
      .disconnect(tab.sessionId)
      .catch(() => undefined);
  }
  mutateTab(tabId, "query", (t) => {
    t.sessionId = null;
    t.inTransaction = false;
  });
}

export async function cancelQuery(tabId: string): Promise<void> {
  const tab = findTab(tabId, "query");
  if (!tab?.sessionId) return;
  await backend()
    .cancelQuery(tab.sessionId)
    .catch(() => undefined);
}

export function selectResult(tabId: string, index: number): void {
  mutateTab(tabId, "query", (t) => {
    t.selectedResult = index;
    t.version += 1;
    t.gridSelection = { rows: [], focused: null };
  });
}

/** Completion provider for the editor, using the connection's schema cache. */
export function queryCompletions(tabId: string, prefix: string, qualifier: string | null): Completion[] {
  const tab = findTab(tabId, "query");
  const connection = tab ? getState().connections[tab.connectionId] : undefined;
  if (!tab || !connection) return [];
  const relations = allRelations(connection);
  for (const reference of referencedTables(tab.text, relations)) {
    if (!(tableKey(reference.table) in connection.structures)) {
      // Warm the cache so the next keystroke can offer the columns.
      void loadStructure(connection.id, reference.table).catch(() => undefined);
    }
  }
  const columns = Object.fromEntries(
    Object.entries(connection.structures).map(([key, s]) => [key, s.columns]),
  );
  return engineCompletions(
    {
      schemas: connection.schemas.map((s) => s.name),
      relations,
      functions: Object.values(connection.functions).flat(),
      columns,
    },
    tab.text,
    prefix,
    qualifier,
  );
}

export async function saveQuery(tabId: string, name: string): Promise<void> {
  const tab = findTab(tabId, "query");
  if (!tab) return;
  const now = new Date().toISOString();
  const query: SavedQuery = {
    id: crypto.randomUUID(),
    name,
    sql: tab.text,
    profileId: tab.connectionId,
    createdAt: now,
    updatedAt: now,
  };
  await storeSavedQuery(query);
  mutateTab(tabId, "query", (t) => {
    t.customTitle = name;
  });
  pushToast({ tone: "success", title: `Saved “${name}”` });
}

export function insertIntoQuery(tabId: string, sql: string): void {
  mutateTab(tabId, "query", (t) => {
    t.text = t.text.trim() === "" ? sql : `${t.text}\n\n${sql}`;
    t.errorMarker = null;
  });
}

export function exportQueryResult(tab: QueryTab, format: ExportFormat, selectionOnly: boolean): string {
  const result = tab.results[tab.selectedResult];
  if (!result) return "";
  const indexes =
    selectionOnly && tab.gridSelection.rows.length > 0
      ? tab.gridSelection.rows
      : result.rows.map((_, i) => i);
  const rows = indexes.flatMap((i) => {
    const row = result.rows[i];
    return row ? [row] : [];
  });
  return exportRows(result.columns, rows, format);
}
