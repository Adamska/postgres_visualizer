// Display formatting for cell values.

import type { CellValue, ValueKind } from "@/lib/types";

export const NULL_PLACEHOLDER = "NULL";
export const GRID_DISPLAY_LIMIT = 300;

/** Single-line text for grid cells. */
export function gridText(value: CellValue, kind: ValueKind): string {
  if (value === null) return NULL_PLACEHOLDER;
  let line = value.length > GRID_DISPLAY_LIMIT ? `${value.slice(0, GRID_DISPLAY_LIMIT)}…` : value;
  if (kind === "json" || kind === "text" || kind === "array" || kind === "composite" || kind === "other") {
    line = line.replace(/\r?\n/g, "⏎ ");
  }
  return line;
}

/** Full text for the inspector, pretty-printing JSON when possible. */
export function detailText(value: CellValue, kind: ValueKind): string {
  if (value === null) return NULL_PLACEHOLDER;
  if (kind === "json") return prettyJson(value) ?? value;
  return value;
}

export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export function isRightAligned(kind: ValueKind): boolean {
  return kind === "integer" || kind === "decimal";
}

/** Kinds whose values are usually multi-line or structured, edited in the large editor. */
export function prefersLargeEditor(kind: ValueKind): boolean {
  return kind === "json" || kind === "array" || kind === "composite";
}

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(count: number, noun = "row"): string {
  return `${numberFormat.format(count)} ${count === 1 ? noun : `${noun}s`}`;
}

export function compactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Short summary line for a result. */
export function resultSummary(result: {
  columns: unknown[];
  rows: unknown[];
  affectedRows: number | null;
  durationMs: number;
  truncated: boolean;
}): string {
  const elapsed = formatDuration(result.durationMs);
  if (result.columns.length > 0) {
    const count = formatCount(result.rows.length);
    return result.truncated ? `${count} (limited) in ${elapsed}` : `${count} in ${elapsed}`;
  }
  if (result.affectedRows !== null) {
    return `${formatCount(result.affectedRows)} affected in ${elapsed}`;
  }
  return `Done in ${elapsed}`;
}
