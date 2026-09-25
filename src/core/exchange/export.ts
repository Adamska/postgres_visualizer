// Result exports: CSV, JSON and SQL inserts.

import type { CellValue, ResultColumn, TableRef, ValueKind } from "@/lib/types";

import { qualifiedName, quoteIdent, renderLiteral } from "../sql/quote";
import { encodeCsv } from "./csv";

export type ExportFormat = "csv" | "json" | "sql";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string }[] = [
  { value: "csv", label: "CSV", extension: "csv" },
  { value: "json", label: "JSON", extension: "json" },
  { value: "sql", label: "SQL INSERT", extension: "sql" },
];

export function exportRows(
  columns: ResultColumn[],
  rows: CellValue[][],
  format: ExportFormat,
  table: TableRef = { schema: "public", name: "table" },
): string {
  switch (format) {
    case "csv":
      return encodeCsv(
        columns.map((c) => c.name),
        rows,
      );
    case "json":
      return exportJson(columns, rows);
    case "sql":
      return exportSqlInserts(columns, rows, table);
  }
}

function jsonValue(value: CellValue, kind: ValueKind): string {
  if (value === null) return "null";
  switch (kind) {
    case "integer":
    case "decimal":
      return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value) ? value : JSON.stringify(value);
    case "boolean":
      if (value === "t" || value === "true") return "true";
      if (value === "f" || value === "false") return "false";
      return JSON.stringify(value);
    case "json":
      return isValidJson(value) ? value : JSON.stringify(value);
    default:
      return JSON.stringify(value);
  }
}

export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** JSON array of objects; numbers, booleans and JSON columns are emitted natively. */
export function exportJson(columns: ResultColumn[], rows: CellValue[][]): string {
  const lines = rows.map((row) => {
    const pairs = columns.map(
      (column, index) => `${JSON.stringify(column.name)}: ${jsonValue(row[index] ?? null, column.kind)}`,
    );
    return `  {${pairs.join(", ")}}`;
  });
  return `[\n${lines.join(",\n")}\n]\n`;
}

export function exportSqlInserts(columns: ResultColumn[], rows: CellValue[][], table: TableRef): string {
  const names = columns.map((c) => quoteIdent(c.name)).join(", ");
  const statements = rows.map(
    (row) => `INSERT INTO ${qualifiedName(table)} (${names}) VALUES (${row.map(renderLiteral).join(", ")});`,
  );
  return statements.length === 0 ? "" : `${statements.join("\n")}\n`;
}

/** Tab separated values with a header, for the clipboard. */
export function toTsv(columns: string[], rows: CellValue[][]): string {
  const escape = (value: CellValue): string => (value ?? "").replace(/\t/g, " ").replace(/\n/g, " ");
  return [columns.join("\t"), ...rows.map((row) => row.map(escape).join("\t"))].join("\n");
}
