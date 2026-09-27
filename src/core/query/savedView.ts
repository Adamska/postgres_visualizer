// Saved views: a table's filters, search, sort and hidden columns kept under a name.

import type { TableRef } from "@/lib/types";

import { sameTable } from "../sql/quote";
import { newTableQuery, type Filter, type SortDescriptor, type TableQuery } from "./tableQuery";

export interface SavedView {
  id: string;
  name: string;
  profileId: string;
  table: TableRef;
  filters: Filter[];
  rawWhere: string;
  search: string;
  sort: SortDescriptor[];
  /** Names of the hidden columns. */
  hiddenColumns: string[];
  createdAt: string;
  updatedAt: string;
}

/** A view capturing the current state of a table tab. */
export function viewFromQuery(
  query: TableQuery,
  profileId: string,
  name: string,
  hiddenColumns: string[],
  existing?: SavedView,
): SavedView {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    profileId,
    table: query.table,
    filters: query.filters.map((f) => ({ ...f })),
    rawWhere: query.rawWhere,
    search: query.search,
    sort: query.sort.map((s) => ({ ...s })),
    hiddenColumns: [...hiddenColumns],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** The query a view opens with; filters get fresh ids so tabs never share them. */
export function queryFromView(view: SavedView, pageSize: number): TableQuery {
  return {
    ...newTableQuery(view.table, pageSize),
    filters: view.filters.map((f) => ({ ...f, id: crypto.randomUUID() })),
    rawWhere: view.rawWhere,
    search: view.search,
    sort: view.sort.map((s) => ({ ...s })),
  };
}

export function viewsForTable(views: readonly SavedView[], profileId: string, table: TableRef): SavedView[] {
  return views
    .filter((v) => v.profileId === profileId && sameTable(v.table, table))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Whether a tab still shows exactly what a view describes. */
export function matchesView(view: SavedView, query: TableQuery, hiddenColumns: readonly string[]): boolean {
  const filters = (list: readonly Filter[]) =>
    JSON.stringify(list.map((f) => [f.column, f.op, f.value, f.enabled]));
  return (
    sameTable(view.table, query.table) &&
    filters(view.filters) === filters(query.filters) &&
    view.rawWhere === query.rawWhere &&
    view.search === query.search &&
    JSON.stringify(view.sort) === JSON.stringify(query.sort) &&
    [...view.hiddenColumns].sort().join("\u0001") === [...hiddenColumns].sort().join("\u0001")
  );
}
