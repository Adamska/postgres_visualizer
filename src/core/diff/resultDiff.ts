// Compares two result sets row by row, matching rows on key columns: which rows were added,
// removed or changed, and which cells changed.

import type { CellValue, QueryResult } from "@/lib/types";

export type DiffRowState = "added" | "removed" | "changed" | "same";

export interface DiffRow {
  state: DiffRowState;
  /** Values in the newer result, or the older one for removed rows. */
  values: CellValue[];
  /** Previous values of changed cells, by column index. */
  previous: Record<number, CellValue>;
}

export interface ResultDiff {
  /** Column names shared by both results, in the newer result's order. */
  columns: string[];
  rows: DiffRow[];
  added: number;
  removed: number;
  changed: number;
  same: number;
  /** Keys that appear several times in one side; such rows are matched in order. */
  duplicateKeys: number;
}

const SEPARATOR = "\u0001";

function keyOf(row: readonly CellValue[], indices: readonly number[]): string {
  return indices.map((i) => (row[i] === null ? "\u0000" : (row[i] ?? ""))).join(SEPARATOR);
}

/**
 * Diffs `before` against `after` on the named key columns (every shared column when empty).
 * Rows keep the order of `after`, with removed rows placed after the row that preceded them.
 */
export function diffResults(
  before: QueryResult,
  after: QueryResult,
  keyColumns: readonly string[],
): ResultDiff {
  const columns = after.columns
    .map((c) => c.name)
    .filter((name) => before.columns.some((c) => c.name === name));
  const beforeIndex = columns.map((name) => before.columns.findIndex((c) => c.name === name));
  const afterIndex = columns.map((name) => after.columns.findIndex((c) => c.name === name));
  const keys = keyColumns.length > 0 ? keyColumns.filter((k) => columns.includes(k)) : columns;
  const keyPositions = keys.map((k) => columns.indexOf(k));

  const project = (row: readonly CellValue[], indices: readonly number[]) =>
    indices.map((i) => row[i] ?? null);
  const beforeRows = before.rows.map((row) => project(row, beforeIndex));
  const afterRows = after.rows.map((row) => project(row, afterIndex));

  const pending = new Map<string, number[]>();
  let duplicateKeys = 0;
  beforeRows.forEach((row, index) => {
    const key = keyOf(row, keyPositions);
    const list = pending.get(key);
    if (list) {
      list.push(index);
      duplicateKeys += 1;
    } else {
      pending.set(key, [index]);
    }
  });

  const matched = new Map<number, number>(); // after index → before index
  afterRows.forEach((row, index) => {
    const list = pending.get(keyOf(row, keyPositions));
    const partner = list?.shift();
    if (partner !== undefined) matched.set(index, partner);
  });
  const matchedBefore = new Set(matched.values());

  const rows: DiffRow[] = [];
  const counts = { added: 0, removed: 0, changed: 0, same: 0 };
  const flushRemoved = (upTo: number, from: number) => {
    for (let i = from; i < upTo; i++) {
      if (matchedBefore.has(i)) continue;
      rows.push({ state: "removed", values: beforeRows[i] ?? [], previous: {} });
      counts.removed += 1;
    }
  };
  let cursor = 0;
  afterRows.forEach((row, index) => {
    const partner = matched.get(index);
    if (partner === undefined) {
      rows.push({ state: "added", values: row, previous: {} });
      counts.added += 1;
      return;
    }
    flushRemoved(partner, cursor);
    cursor = Math.max(cursor, partner + 1);
    const old = beforeRows[partner] ?? [];
    const previous: Record<number, CellValue> = {};
    row.forEach((value, column) => {
      if (value !== (old[column] ?? null)) previous[column] = old[column] ?? null;
    });
    const changed = Object.keys(previous).length > 0;
    rows.push({ state: changed ? "changed" : "same", values: row, previous });
    counts[changed ? "changed" : "same"] += 1;
  });
  flushRemoved(beforeRows.length, cursor);
  return { columns, rows, ...counts, duplicateKeys };
}
