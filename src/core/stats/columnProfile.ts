// Profile of one column computed from a sample of its values: nulls, distinct values, the most
// frequent values and a histogram for numbers and dates.

import type { CellValue, ValueKind } from "@/lib/types";

import { booleanValue } from "../format/values";
import { parseTemporal } from "../format/temporal";
import { numericValue } from "./selectionStats";

export interface HistogramBin {
  from: number;
  /** Exclusive, except for the last bin. */
  to: number;
  count: number;
}

export interface ValueCount {
  value: string;
  count: number;
}

export interface ColumnProfile {
  /** Values examined. */
  sampled: number;
  nulls: number;
  distinct: number;
  /** Most frequent non-null values, most frequent first. */
  top: ValueCount[];
  numeric: { min: number; max: number; mean: number; median: number; histogram: HistogramBin[] } | null;
  temporal: { min: string; max: string; histogram: HistogramBin[] } | null;
  text: { minLength: number; maxLength: number; averageLength: number } | null;
  boolean: { trueCount: number; falseCount: number } | null;
}

export const PROFILE_TOP_VALUES = 8;
export const PROFILE_BINS = 24;

const TEXTUAL_KINDS: ReadonlySet<ValueKind> = new Set(["text", "other"]);

/** Equal-width histogram; small integer ranges get one bin per value. */
export function histogram(values: readonly number[], bins = PROFILE_BINS, integers = false): HistogramBin[] {
  if (values.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const perValue = integers && max - min + 1 <= bins;
  const count = perValue ? max - min + 1 : bins;
  const width = perValue ? 1 : (max - min) / count;
  const result: HistogramBin[] = Array.from({ length: count }, (_, i) => ({
    from: min + i * width,
    to: perValue ? min + i * width + 1 : i === count - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(count - 1, Math.floor((value - min) / width));
    const bin = result[index];
    if (bin) bin.count += 1;
  }
  return result;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function profileColumn(values: readonly CellValue[], kind: ValueKind): ColumnProfile {
  const filled = values.filter((v): v is string => v !== null);
  const counts = new Map<string, number>();
  for (const value of filled) counts.set(value, (counts.get(value) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PROFILE_TOP_VALUES)
    .map(([value, count]) => ({ value, count }));

  const profile: ColumnProfile = {
    sampled: values.length,
    nulls: values.length - filled.length,
    distinct: counts.size,
    top,
    numeric: null,
    temporal: null,
    text: null,
    boolean: null,
  };
  if (filled.length === 0) return profile;

  if (kind === "integer" || kind === "decimal") {
    const numbers = filled.map(numericValue).filter((n): n is number => n !== null);
    if (numbers.length > 0) {
      const sorted = [...numbers].sort((a, b) => a - b);
      profile.numeric = {
        min: sorted[0] ?? 0,
        max: sorted.at(-1) ?? 0,
        mean: numbers.reduce((total, n) => total + n, 0) / numbers.length,
        median: median(sorted),
        histogram: histogram(numbers, PROFILE_BINS, kind === "integer"),
      };
    }
  } else if (kind === "date" || kind === "timestamp") {
    const times = filled
      .map((raw) => ({ raw, time: parseTemporal(raw, kind) }))
      .filter((t): t is { raw: string; time: number } => t.time !== null)
      .sort((a, b) => a.time - b.time);
    if (times.length > 0) {
      profile.temporal = {
        min: times[0]?.raw ?? "",
        max: times.at(-1)?.raw ?? "",
        histogram: histogram(times.map((t) => t.time)),
      };
    }
  } else if (kind === "boolean") {
    const parsed = filled.map(booleanValue);
    profile.boolean = {
      trueCount: parsed.filter((b) => b === true).length,
      falseCount: parsed.filter((b) => b === false).length,
    };
  }
  if (TEXTUAL_KINDS.has(kind)) {
    const lengths = filled.map((v) => Array.from(v).length);
    profile.text = {
      minLength: lengths.reduce((a, b) => Math.min(a, b), Infinity),
      maxLength: lengths.reduce((a, b) => Math.max(a, b), 0),
      averageLength: lengths.reduce((total, n) => total + n, 0) / lengths.length,
    };
  }
  return profile;
}
