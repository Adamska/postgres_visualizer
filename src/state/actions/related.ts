// Records related to a row: the rows its foreign keys point at, and the rows of other tables
// pointing at it.

import { newFilter, type Filter } from "@/core/query/tableQuery";
import { qualifiedName, quoteIdent, quoteLiteral } from "@/core/sql/quote";
import type {
  CellValue,
  ForeignKeyInfo,
  QueryResult,
  ReferencingKey,
  TableRef,
  TableStructure,
} from "@/lib/types";

import { executeOn } from "./connections";
import { keyValues } from "./tableTab";

export interface OutgoingRelation {
  key: ForeignKeyInfo;
  table: TableRef;
  filters: Filter[];
  /** The referenced row; `null` when it does not exist (or could not be read). */
  result: QueryResult | null;
}

export interface IncomingRelation {
  key: ReferencingKey;
  table: TableRef;
  filters: Filter[];
  count: number | null;
  /** The first referencing rows, when requested. */
  result: QueryResult | null;
}

export interface RelatedRecords {
  outgoing: OutgoingRelation[];
  incoming: IncomingRelation[];
}

function predicate(columns: readonly string[], values: readonly string[]): string {
  return columns.map((column, i) => `${quoteIdent(column)} = ${quoteLiteral(values[i] ?? "")}`).join(" AND ");
}

/** One statement counting the referencing rows of every incoming key. */
export function incomingCountSql(
  keys: readonly { table: TableRef; columns: string[]; values: string[] }[],
): string {
  const counts = keys.map(
    (key, i) =>
      `(SELECT count(*) FROM ${qualifiedName(key.table)} WHERE ${predicate(key.columns, key.values)}) AS ${quoteIdent(`c${i}`)}`,
  );
  return `SELECT ${counts.join(", ")}`;
}

/**
 * Loads the related records of a row. `sampleRows` referencing rows are fetched per incoming key
 * (0 to only count them).
 */
export async function loadRelated(
  connectionId: string,
  structure: TableStructure,
  record: Record<string, CellValue | undefined>,
  sampleRows: number,
): Promise<RelatedRecords> {
  const outgoing: OutgoingRelation[] = [];
  for (const key of structure.foreignKeys) {
    const values = keyValues(record, key.columns);
    if (!values) continue;
    const table = { schema: key.referencedSchema, name: key.referencedTable };
    const filters = key.referencedColumns.map((column, i) => newFilter(column, "equals", values[i] ?? ""));
    let result: QueryResult | null = null;
    try {
      const found = await executeOn(
        connectionId,
        `SELECT * FROM ${qualifiedName(table)} WHERE ${predicate(key.referencedColumns, values)} LIMIT 1`,
        1,
      );
      result = found.rows.length > 0 ? found : null;
    } catch {
      result = null;
    }
    outgoing.push({ key, table, filters, result });
  }

  const pending = structure.referencedBy.flatMap((key) => {
    const values = keyValues(record, key.referencedColumns);
    if (!values) return [];
    const table = { schema: key.schema, name: key.table };
    return [{ key, table, columns: key.columns, values }];
  });
  let counts: (number | null)[] = pending.map(() => null);
  if (pending.length > 0) {
    try {
      const result = await executeOn(connectionId, incomingCountSql(pending), 1);
      counts = pending.map((_, i) => {
        const raw = result.rows[0]?.[i];
        return raw === undefined || raw === null ? null : Number(raw);
      });
    } catch {
      // Counts are informative; the links still work without them.
    }
  }
  const incoming: IncomingRelation[] = [];
  for (const [i, entry] of pending.entries()) {
    const count = counts[i] ?? null;
    let result: QueryResult | null = null;
    if (sampleRows > 0 && count !== 0) {
      try {
        result = await executeOn(
          connectionId,
          `SELECT * FROM ${qualifiedName(entry.table)} WHERE ${predicate(entry.columns, entry.values)} LIMIT ${sampleRows}`,
          sampleRows,
        );
      } catch {
        result = null;
      }
    }
    incoming.push({
      key: entry.key,
      table: entry.table,
      filters: entry.columns.map((column, j) => newFilter(column, "equals", entry.values[j] ?? "")),
      count,
      result,
    });
  }
  return { outgoing, incoming };
}
