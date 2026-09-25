// Maps CSV columns onto table columns and produces batched INSERT statements.

import type { TableStructure } from "@/lib/types";

import { qualifiedName, quoteIdent, quoteLiteral } from "../sql/quote";
import type { CsvDocument } from "./csv";

export interface ImportMapping {
  csvColumn: string;
  /** Target table column, or null to skip. */
  tableColumn: string | null;
}

export interface ImportPlan {
  mappings: ImportMapping[];
  nullRepresentation: string;
  batchSize: number;
}

export function automaticImportPlan(document: CsvDocument, structure: TableStructure): ImportPlan {
  const mappings = document.header.map((header) => {
    const match = structure.columns.find(
      (c) => !c.isGenerated && c.name.toLowerCase() === header.toLowerCase(),
    );
    return { csvColumn: header, tableColumn: match?.name ?? null };
  });
  return { mappings, nullRepresentation: "", batchSize: 500 };
}

export function importStatements(
  plan: ImportPlan,
  document: CsvDocument,
  structure: TableStructure,
): string[] {
  const active = plan.mappings.filter((m) => m.tableColumn !== null);
  if (active.length === 0) return [];
  const table = qualifiedName({ schema: structure.schema, name: structure.name });
  const indexes = active.map((m) => document.header.indexOf(m.csvColumn));
  const names = active.map((m) => quoteIdent(m.tableColumn ?? "")).join(", ");
  const batchSize = Math.max(1, plan.batchSize);

  const statements: string[] = [];
  let batch: string[] = [];
  const flush = (): void => {
    if (batch.length === 0) return;
    statements.push(`INSERT INTO ${table} (${names}) VALUES\n${batch.join(",\n")}`);
    batch = [];
  };
  for (const row of document.rows) {
    const values = indexes.map((index) => {
      const cell = index >= 0 ? row[index] : undefined;
      if (cell === undefined || cell === plan.nullRepresentation) return "NULL";
      return quoteLiteral(cell);
    });
    batch.push(`(${values.join(", ")})`);
    if (batch.length === batchSize) flush();
  }
  flush();
  return statements;
}
