// Turns a query result into chart data: picks sensible axes, builds the series and computes
// round axis ticks.

import type { CellValue, ResultColumn, ValueKind } from "@/lib/types";

import { parseTemporal } from "../format/temporal";
import { numericValue } from "../stats/selectionStats";

export type ChartType = "bar" | "line" | "area" | "scatter";

export interface ChartSpec {
  type: ChartType;
  /** Column index of the x axis. */
  x: number;
  /** Column indices of the plotted measures. */
  y: number[];
}

export type AxisKind = "time" | "number" | "category";

export interface ChartPoint {
  /** Position on the x axis: ms for time, the value for numbers, the label for categories. */
  x: number | string;
  /** Text of the x value as returned by the server. */
  label: string;
  /** One value per series; `null` when missing or not numeric. */
  values: (number | null)[];
}

export interface ChartData {
  xKind: AxisKind;
  xName: string;
  series: string[];
  points: ChartPoint[];
  /** Rows left out (categories beyond the cap, unparsable x values). */
  omitted: number;
}

/** Most measures plotted at once; more would need hues beyond the validated palette. */
export const MAX_SERIES = 5;
/** Scatter plots validate only the first three palette slots against every pair. */
export const MAX_SCATTER_SERIES = 3;
/** Categories shown by a bar chart before the rest is left out. */
export const MAX_CATEGORIES = 60;

const NUMERIC: ReadonlySet<ValueKind> = new Set(["integer", "decimal"]);
const TEMPORAL: ReadonlySet<ValueKind> = new Set(["date", "timestamp"]);
const CATEGORICAL: ReadonlySet<ValueKind> = new Set(["text", "enumeration", "boolean", "uuid", "other"]);

function isIdentifier(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "id" || lower.endsWith("_id");
}

/** Numeric columns, measures first and identifier-like columns last. */
function measures(columns: readonly ResultColumn[], exclude: number): number[] {
  const numeric = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => index !== exclude && NUMERIC.has(column.kind));
  const plain = numeric.filter(({ column }) => !isIdentifier(column.name));
  return (plain.length > 0 ? plain : numeric).map(({ index }) => index);
}

export function maxSeries(type: ChartType): number {
  return type === "scatter" ? MAX_SCATTER_SERIES : MAX_SERIES;
}

/** A reasonable first chart for a result, or `null` when nothing is plottable. */
export function suggestChart(columns: readonly ResultColumn[]): ChartSpec | null {
  const temporal = columns.findIndex((c) => TEMPORAL.has(c.kind));
  if (temporal !== -1) {
    // One measure to start with: several rarely share a scale.
    const y = measures(columns, temporal).slice(0, 1);
    if (y.length > 0) return { type: "line", x: temporal, y };
  }
  const category = columns.findIndex((c) => CATEGORICAL.has(c.kind));
  if (category !== -1) {
    const y = measures(columns, category).slice(0, 1);
    if (y.length > 0) return { type: "bar", x: category, y };
  }
  const numeric = measures(columns, -1);
  const [x, ...rest] = numeric;
  if (x !== undefined && rest.length > 0) return { type: "scatter", x, y: rest.slice(0, 1) };
  return null;
}

export function axisKindOf(kind: ValueKind): AxisKind {
  if (TEMPORAL.has(kind)) return "time";
  if (NUMERIC.has(kind)) return "number";
  return "category";
}

/** Columns that can serve as measures. */
export function measureColumns(columns: readonly ResultColumn[]): number[] {
  return columns.map((c, i) => (NUMERIC.has(c.kind) ? i : -1)).filter((i) => i !== -1);
}

export function buildChartData(
  columns: readonly ResultColumn[],
  rows: readonly CellValue[][],
  spec: ChartSpec,
): ChartData {
  const xColumn = columns[spec.x];
  const xKind = xColumn ? axisKindOf(xColumn.kind) : "category";
  const series = spec.y.map((index) => columns[index]?.name ?? "");
  const points: ChartPoint[] = [];
  let omitted = 0;
  for (const row of rows) {
    const raw = row[spec.x] ?? null;
    const label = raw ?? "NULL";
    let x: number | string | null = label;
    if (xKind === "time") x = raw === null || !xColumn ? null : parseTemporal(raw, xColumn.kind);
    else if (xKind === "number") x = raw === null ? null : numericValue(raw);
    if (x === null) {
      omitted += 1;
      continue;
    }
    const values = spec.y.map((index) => {
      const value = row[index];
      return value === null || value === undefined ? null : numericValue(value);
    });
    points.push({ x, label, values });
  }
  if (xKind !== "category" && spec.type !== "scatter") {
    points.sort((a, b) => (a.x as number) - (b.x as number));
  }
  if (xKind === "category" && points.length > MAX_CATEGORIES) {
    omitted += points.length - MAX_CATEGORIES;
    points.length = MAX_CATEGORIES;
  }
  return { xKind, xName: xColumn?.name ?? "", series, points, omitted };
}

function niceStep(rough: number): number {
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const fraction = rough / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/** Round ticks covering [min, max]; the returned domain is widened to the outer ticks. */
export function niceTicks(
  min: number,
  max: number,
  count = 5,
): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0], min: 0, max: 1 };
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.5;
    return niceTicks(min - pad, max + pad, count);
  }
  const step = niceStep((max - min) / Math.max(1, count));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    // Avoid binary drift such as 0.30000000000000004.
    ticks.push(Number(value.toPrecision(12)));
  }
  return { ticks, min: start, max: end };
}

/** Compact tick label: 1.2k, 3.5M, 0.25. */
export function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${Number((value / 1e9).toPrecision(3))}B`;
  if (abs >= 1e6) return `${Number((value / 1e6).toPrecision(3))}M`;
  if (abs >= 1e3) return `${Number((value / 1e3).toPrecision(3))}k`;
  return value.toLocaleString("en-US", { maximumFractionDigits: abs < 1 ? 3 : 2 });
}

/**
 * Whether the plotted series differ so much in magnitude that the smaller ones flatten out on a
 * shared axis (a factor of 20 between their largest values).
 */
export function mixedScales(data: ChartData): boolean {
  const peaks = data.series.map((_, s) =>
    data.points.reduce((max, p) => Math.max(max, Math.abs(p.values[s] ?? 0)), 0),
  );
  const positive = peaks.filter((p) => p > 0);
  if (positive.length < 2) return false;
  return Math.max(...positive) / Math.min(...positive) >= 20;
}

/** Extent of every series value; bars and areas always include zero. */
export function valueExtent(data: ChartData, includeZero: boolean): [number, number] {
  let min = includeZero ? 0 : Infinity;
  let max = includeZero ? 0 : -Infinity;
  for (const point of data.points) {
    for (const value of point.values) {
      if (value === null) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return Number.isFinite(min) ? [min, max] : [0, 1];
}
