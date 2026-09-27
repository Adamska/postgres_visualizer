// Aggregates shown for the selected cells, the way spreadsheets show them in the status bar.

import type { CellValue, ValueKind } from "@/lib/types";

import { parseTemporal } from "../format/temporal";

export interface SelectedValue {
  value: CellValue | undefined;
  kind: ValueKind;
}

export interface SelectionStats {
  /** Cells in the selection. */
  count: number;
  /** Cells that are neither NULL nor DEFAULT. */
  filled: number;
  nulls: number;
  distinct: number;
  /** Present when every filled cell is a number. */
  numeric: { sum: number; average: number; min: number; max: number } | null;
  /** Present when every filled cell is a date or timestamp: the raw earliest and latest values. */
  temporal: { min: string; max: string } | null;
}

const NUMERIC_KINDS: ReadonlySet<ValueKind> = new Set(["integer", "decimal"]);
const TEMPORAL_KINDS: ReadonlySet<ValueKind> = new Set(["date", "timestamp"]);

/** Parses a PostgreSQL numeric text; `null` for NaN, infinities and anything else. */
export function numericValue(text: string): number | null {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function selectionStats(values: readonly SelectedValue[]): SelectionStats {
  const filled = values.filter(
    (v): v is { value: string; kind: ValueKind } => v.value !== null && v.value !== undefined,
  );
  const nulls = values.filter((v) => v.value === null).length;
  const distinct = new Set(filled.map((v) => v.value)).size;

  let numeric: SelectionStats["numeric"] = null;
  if (filled.length > 0 && filled.every((v) => NUMERIC_KINDS.has(v.kind))) {
    const numbers = filled.map((v) => numericValue(v.value));
    if (numbers.every((n): n is number => n !== null)) {
      const sum = numbers.reduce((total, n) => total + n, 0);
      numeric = {
        sum,
        average: sum / numbers.length,
        min: numbers.reduce((a, b) => Math.min(a, b), Infinity),
        max: numbers.reduce((a, b) => Math.max(a, b), -Infinity),
      };
    }
  }

  let temporal: SelectionStats["temporal"] = null;
  if (filled.length > 0 && filled.every((v) => TEMPORAL_KINDS.has(v.kind))) {
    const parsed = filled.map((v) => ({ raw: v.value, time: parseTemporal(v.value, v.kind) }));
    if (parsed.every((p) => p.time !== null)) {
      const sorted = [...parsed].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      temporal = { min: sorted[0]?.raw ?? "", max: sorted.at(-1)?.raw ?? "" };
    }
  }

  return { count: values.length, filled: filled.length, nulls, distinct, numeric, temporal };
}

/** Compact number for the status bar: grouped digits, at most 4 decimals. */
export function formatStat(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const digits = abs !== 0 && abs < 1 ? 4 : Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
