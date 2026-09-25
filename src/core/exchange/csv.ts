// RFC 4180 style CSV reading and writing.

import type { CellValue } from "@/lib/types";

export interface CsvOptions {
  delimiter: string;
  hasHeader: boolean;
  nullRepresentation: string;
}

export const DEFAULT_CSV_OPTIONS: CsvOptions = { delimiter: ",", hasHeader: true, nullRepresentation: "" };

function field(text: string, delimiter: string): string {
  const needsQuotes = text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function encodeCsv(columns: string[], rows: CellValue[][], options: Partial<CsvOptions> = {}): string {
  const { delimiter, hasHeader, nullRepresentation } = { ...DEFAULT_CSV_OPTIONS, ...options };
  const lines: string[] = [];
  if (hasHeader) lines.push(columns.map((c) => field(c, delimiter)).join(delimiter));
  for (const row of rows) {
    lines.push(
      row.map((value) => (value === null ? nullRepresentation : field(value, delimiter))).join(delimiter),
    );
  }
  return `${lines.join("\n")}\n`;
}

export interface CsvDocument {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string, options: Partial<CsvOptions> = {}): CsvDocument {
  const { delimiter, hasHeader } = { ...DEFAULT_CSV_OPTIONS, ...options };
  const records = parseRecords(text, delimiter).filter(
    (record) => !(record.length === 1 && record[0] === ""),
  );
  if (records.length === 0) return { header: [], rows: [] };
  if (hasHeader) {
    const [header = [], ...rows] = records;
    return { header, rows };
  }
  const width = Math.max(1, ...records.map((r) => r.length));
  return { header: Array.from({ length: width }, (_, i) => `column${i + 1}`), rows: records };
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  const counts = candidates.map((c) => [c, firstLine.split(c).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ",";
}

function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const c = text[index] ?? "";
    if (inQuotes) {
      if (c === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 2;
        } else {
          inQuotes = false;
          index += 1;
        }
      } else {
        value += c;
        index += 1;
      }
      continue;
    }
    if (c === '"' && value === "") {
      inQuotes = true;
      index += 1;
    } else if (c === delimiter) {
      record.push(value);
      value = "";
      index += 1;
    } else if (c === "\r" || c === "\n") {
      index += c === "\r" && text[index + 1] === "\n" ? 2 : 1;
      record.push(value);
      records.push(record);
      record = [];
      value = "";
    } else {
      value += c;
      index += 1;
    }
  }
  if (value !== "" || record.length > 0) {
    record.push(value);
    records.push(record);
  }
  return records;
}
