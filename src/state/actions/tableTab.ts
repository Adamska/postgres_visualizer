// Table tab behaviour: paging, filters, staged edits and commits.

import {
  addInsert,
  changeStatements,
  editFromCell,
  emptyChangeSet,
  isDeleted,
  isTableEditable,
  removeInsert,
  rowIdentity,
  setInsertValue,
  setValue,
  stagedValue,
  toggleDelete as toggleDeleteIdentity,
  type EditValue,
  type RowIdentity,
} from "@/core/changes/changeSet";
import { exportRows, type ExportFormat } from "@/core/exchange/export";
import {
  countSql,
  newFilter,
  pageSql,
  toggleSort,
  type Filter,
  type TableQuery,
} from "@/core/query/tableQuery";
import { toAppError, type CellValue, type TableRef } from "@/lib/types";

import { findTab, getState, mutateTab, type TableTab } from "../store";
import { executeOn, executeTransactionOn, loadStructure } from "./connections";
import { persistWorkspace } from "./workspace";

export type RowSource = { kind: "existing"; index: number } | { kind: "inserted"; id: string };

export function rowSource(tab: TableTab, row: number): RowSource | null {
  if (!tab.result) return null;
  if (row < tab.result.rows.length) return { kind: "existing", index: row };
  const insert = tab.changes.inserts[row - tab.result.rows.length];
  return insert ? { kind: "inserted", id: insert.id } : null;
}

export function identityOf(tab: TableTab, index: number): RowIdentity | null {
  if (!tab.result || !tab.structure) return null;
  const row = tab.result.rows[index];
  if (!row) return null;
  return rowIdentity(
    tab.structure,
    row,
    tab.result.columns.map((c) => c.name),
  );
}

/** The value shown in a cell, taking staged edits into account; `undefined` means DEFAULT. */
export function cellValue(tab: TableTab, row: number, column: number): CellValue | undefined {
  const source = rowSource(tab, row);
  const name = tab.result?.columns[column]?.name;
  if (!source || name === undefined) return undefined;
  if (source.kind === "existing") {
    const identity = identityOf(tab, source.index);
    const staged = identity ? stagedValue(tab.changes, identity, name) : undefined;
    if (staged) return staged.kind === "text" ? staged.value : staged.kind === "null" ? null : undefined;
    return tab.result?.rows[source.index]?.[column] ?? null;
  }
  const edit = tab.changes.inserts.find((i) => i.id === source.id)?.values[name];
  if (!edit) return undefined;
  return edit.kind === "text" ? edit.value : edit.kind === "null" ? null : undefined;
}

export async function loadTable(tabId: string): Promise<void> {
  const tab = findTab(tabId, "table");
  if (!tab) return;
  mutateTab(tabId, "table", (t) => {
    t.loading = true;
    t.error = null;
  });
  try {
    const structure = await loadStructure(tab.connectionId, tab.query.table);
    const defaultOrder = structure.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    const result = await executeOn(tab.connectionId, pageSql(tab.query, defaultOrder));
    mutateTab(tabId, "table", (t) => {
      t.structure = structure;
      t.result = result;
      t.version += 1;
      t.loading = false;
    });
    void loadCount(tabId);
  } catch (error) {
    mutateTab(tabId, "table", (t) => {
      t.error = toAppError(error);
      t.loading = false;
    });
  }
}

async function loadCount(tabId: string): Promise<void> {
  const tab = findTab(tabId, "table");
  if (!tab) return;
  const sql = countSql(tab.query);
  try {
    const result = await executeOn(tab.connectionId, sql, 1);
    const raw = result.rows[0]?.[0];
    const count = raw === undefined || raw === null ? null : Number(raw);
    mutateTab(tabId, "table", (t) => {
      if (countSql(t.query) === sql) t.totalCount = Number.isFinite(count) ? count : null;
    });
  } catch {
    // Counting is best effort; the pager copes without a total.
  }
}

export function updateQuery(tabId: string, recipe: (query: TableQuery) => void): void {
  mutateTab(tabId, "table", (t) => {
    recipe(t.query);
  });
  persistWorkspace();
}

export async function goToPage(tabId: string, page: number): Promise<void> {
  updateQuery(tabId, (q) => {
    q.page = Math.max(0, page);
  });
  await loadTable(tabId);
}

export async function setPageSize(tabId: string, pageSize: number): Promise<void> {
  updateQuery(tabId, (q) => {
    q.pageSize = pageSize;
    q.page = 0;
  });
  await loadTable(tabId);
}

export async function sortBy(tabId: string, column: string): Promise<void> {
  const tab = findTab(tabId, "table");
  if (!tab) return;
  const next = toggleSort(tab.query, column);
  updateQuery(tabId, (q) => {
    q.sort = next.sort;
    q.page = 0;
  });
  await loadTable(tabId);
}

export async function applyFilters(tabId: string): Promise<void> {
  updateQuery(tabId, (q) => {
    q.page = 0;
  });
  await loadTable(tabId);
}

export function addFilter(tabId: string, column?: string): void {
  const tab = findTab(tabId, "table");
  if (!tab) return;
  const name = column ?? tab.structure?.columns[0]?.name ?? "";
  mutateTab(tabId, "table", (t) => {
    t.query.filters.push(newFilter(name));
    t.filterBarVisible = true;
  });
}

export function updateFilter(tabId: string, id: string, patch: Partial<Filter>): void {
  mutateTab(tabId, "table", (t) => {
    const filter = t.query.filters.find((f) => f.id === id);
    if (filter) Object.assign(filter, patch);
  });
}

export async function removeFilter(tabId: string, id: string): Promise<void> {
  updateQuery(tabId, (q) => {
    q.filters = q.filters.filter((f) => f.id !== id);
  });
  await applyFilters(tabId);
}

export async function clearFilters(tabId: string): Promise<void> {
  updateQuery(tabId, (q) => {
    q.filters = [];
    q.rawWhere = "";
  });
  await applyFilters(tabId);
}

export function setRawWhere(tabId: string, rawWhere: string): void {
  mutateTab(tabId, "table", (t) => {
    t.query.rawWhere = rawWhere;
  });
}

export function toggleFilterBar(tabId: string): void {
  mutateTab(tabId, "table", (t) => {
    t.filterBarVisible = !t.filterBarVisible;
  });
}

// Editing

export function setCell(tabId: string, row: number, column: number, value: EditValue): void {
  const tab = findTab(tabId, "table");
  if (!tab?.result || !tab.structure || !isTableEditable(tab.structure)) return;
  const name = tab.result.columns[column]?.name;
  if (name === undefined) return;
  const source = rowSource(tab, row);
  if (!source) return;
  mutateTab(tabId, "table", (t) => {
    if (source.kind === "existing") {
      const identity = identityOf(t, source.index);
      const original = t.result?.rows[source.index]?.[column];
      if (!identity || original === undefined || isDeleted(t.changes, identity)) return;
      t.changes = setValue(t.changes, identity, name, value, original);
    } else {
      t.changes = setInsertValue(t.changes, source.id, name, value);
    }
    t.version += 1;
  });
}

export function toggleDeleteRows(tabId: string, rows: number[]): void {
  const tab = findTab(tabId, "table");
  if (!tab?.structure || !isTableEditable(tab.structure)) return;
  mutateTab(tabId, "table", (t) => {
    for (const row of [...rows].sort((a, b) => b - a)) {
      const source = rowSource(t, row);
      if (!source) continue;
      if (source.kind === "existing") {
        const identity = identityOf(t, source.index);
        if (identity) t.changes = toggleDeleteIdentity(t.changes, identity);
      } else {
        t.changes = removeInsert(t.changes, source.id);
      }
    }
    t.version += 1;
  });
}

/** Appends an empty row and focuses its first editable, non-key column. */
export function addRow(tabId: string): void {
  const tab = findTab(tabId, "table");
  if (!tab?.result || !tab.structure || !isTableEditable(tab.structure)) return;
  mutateTab(tabId, "table", (t) => {
    const [changes] = addInsert(t.changes);
    t.changes = changes;
    t.version += 1;
    const row = (t.result?.rows.length ?? 0) + t.changes.inserts.length - 1;
    const structure = t.structure;
    const column = Math.max(
      0,
      t.result?.columns.findIndex((c) => {
        const info = structure?.columns.find((s) => s.name === c.name);
        return info && !info.isGenerated && !info.isPrimaryKey;
      }) ?? 0,
    );
    t.focusRequest = { row, column };
    t.selection = { rows: [row], focused: { row, column } };
  });
}

export function clearFocusRequest(tabId: string): void {
  mutateTab(tabId, "table", (t) => {
    t.focusRequest = null;
  });
}

/** Copies rows as pending inserts, leaving identity and generated columns to the server. */
export function duplicateRows(tabId: string, rows: number[]): void {
  const tab = findTab(tabId, "table");
  if (!tab?.result || !tab.structure || !isTableEditable(tab.structure)) return;
  const structure = tab.structure;
  const columns = tab.result.columns;
  mutateTab(tabId, "table", (t) => {
    for (const row of rows) {
      const values: Record<string, EditValue> = {};
      structure.columns.forEach((column) => {
        if (column.isGenerated || column.isIdentity || (column.isPrimaryKey && column.defaultValue !== null))
          return;
        const index = columns.findIndex((c) => c.name === column.name);
        if (index === -1) return;
        const value = cellValue(tab, row, index);
        if (value !== undefined) values[column.name] = editFromCell(value);
      });
      const [changes] = addInsert(t.changes, values);
      t.changes = changes;
    }
    t.version += 1;
  });
}

export function discardChanges(tabId: string): void {
  mutateTab(tabId, "table", (t) => {
    t.changes = emptyChangeSet();
    t.version += 1;
  });
}

export function pendingStatements(tab: TableTab): string[] {
  return tab.structure ? changeStatements(tab.changes, tab.structure) : [];
}

/** Applies the staged changes in one transaction and reloads the page. */
export async function commitChanges(tabId: string): Promise<boolean> {
  const tab = findTab(tabId, "table");
  if (!tab?.structure) return false;
  const statements = pendingStatements(tab);
  if (statements.length === 0) return true;
  mutateTab(tabId, "table", (t) => {
    t.committing = true;
    t.error = null;
  });
  try {
    await executeTransactionOn(tab.connectionId, statements);
    mutateTab(tabId, "table", (t) => {
      t.changes = emptyChangeSet();
      t.committing = false;
    });
    await loadTable(tabId);
    return true;
  } catch (error) {
    mutateTab(tabId, "table", (t) => {
      t.error = toAppError(error);
      t.committing = false;
    });
    return false;
  }
}

/** The table and filter to open when following the foreign key of a cell. */
export function foreignKeyTarget(
  tab: TableTab,
  row: number,
  column: number,
): { table: TableRef; filter: Filter } | null {
  const name = tab.result?.columns[column]?.name;
  if (!tab.structure || name === undefined) return null;
  const key = tab.structure.foreignKeys.find((fk) => fk.columns.length === 1 && fk.columns[0] === name);
  const referenced = key?.referencedColumns[0];
  const value = cellValue(tab, row, column);
  if (!key || referenced === undefined || value === null || value === undefined) return null;
  return {
    table: { schema: key.referencedSchema, name: key.referencedTable },
    filter: newFilter(referenced, "equals", value),
  };
}

export function exportTable(tab: TableTab, format: ExportFormat, selectionOnly: boolean): string {
  if (!tab.result) return "";
  const indexes =
    selectionOnly && tab.selection.rows.length > 0 ? tab.selection.rows : tab.result.rows.map((_, i) => i);
  const rows = indexes.flatMap((i) => {
    const row = tab.result?.rows[i];
    return row ? [row] : [];
  });
  return exportRows(tab.result.columns, rows, format, tab.query.table);
}

export function activeTableTab(): TableTab | undefined {
  const state = getState();
  return state.tabs.find((t): t is TableTab => t.id === state.activeTabId && t.kind === "table");
}
