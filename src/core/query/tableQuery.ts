// Describes what a table tab shows and renders it to SQL.

import type { TableRef } from "@/lib/types";

import { qualifiedName, quoteIdent, quoteLiteral } from "../sql/quote";

export type FilterOperator =
  | "equals"
  | "notEquals"
  | "lessThan"
  | "lessOrEqual"
  | "greaterThan"
  | "greaterOrEqual"
  | "like"
  | "notLike"
  | "ilike"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "isNull"
  | "isNotNull"
  | "isTrue"
  | "isFalse";

export const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "notEquals", label: "not equals", needsValue: true },
  { value: "lessThan", label: "less than", needsValue: true },
  { value: "lessOrEqual", label: "less or equal", needsValue: true },
  { value: "greaterThan", label: "greater than", needsValue: true },
  { value: "greaterOrEqual", label: "greater or equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "startsWith", label: "starts with", needsValue: true },
  { value: "endsWith", label: "ends with", needsValue: true },
  { value: "like", label: "LIKE", needsValue: true },
  { value: "notLike", label: "NOT LIKE", needsValue: true },
  { value: "ilike", label: "ILIKE", needsValue: true },
  { value: "in", label: "in list", needsValue: true },
  { value: "notIn", label: "not in list", needsValue: true },
  { value: "isNull", label: "is null", needsValue: false },
  { value: "isNotNull", label: "is not null", needsValue: false },
  { value: "isTrue", label: "is true", needsValue: false },
  { value: "isFalse", label: "is false", needsValue: false },
];

export function operatorNeedsValue(op: FilterOperator): boolean {
  return FILTER_OPERATORS.find((o) => o.value === op)?.needsValue ?? true;
}

export interface Filter {
  id: string;
  column: string;
  op: FilterOperator;
  value: string;
  enabled: boolean;
}

export interface SortDescriptor {
  column: string;
  ascending: boolean;
}

export interface TableQuery {
  table: TableRef;
  filters: Filter[];
  rawWhere: string;
  sort: SortDescriptor[];
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [50, 100, 200, 500, 1000];

export function newFilter(column: string, op: FilterOperator = "equals", value = ""): Filter {
  return { id: crypto.randomUUID(), column, op, value, enabled: true };
}

export function newTableQuery(table: TableRef, pageSize = 200, filters: Filter[] = []): TableQuery {
  return { table, filters, rawWhere: "", sort: [], page: 0, pageSize };
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const COMPARISONS: Partial<Record<FilterOperator, string>> = {
  equals: "=",
  notEquals: "<>",
  lessThan: "<",
  lessOrEqual: "<=",
  greaterThan: ">",
  greaterOrEqual: ">=",
};

/** SQL predicate for one filter. Text searches cast the column so any type can be searched. */
export function filterPredicate(filter: Filter): string {
  const column = quoteIdent(filter.column);
  const comparison = COMPARISONS[filter.op];
  if (comparison) return `${column} ${comparison} ${quoteLiteral(filter.value)}`;
  switch (filter.op) {
    case "isNull":
      return `${column} IS NULL`;
    case "isNotNull":
      return `${column} IS NOT NULL`;
    case "isTrue":
      return `${column} IS TRUE`;
    case "isFalse":
      return `${column} IS FALSE`;
    case "like":
      return `${column}::text LIKE ${quoteLiteral(filter.value)}`;
    case "notLike":
      return `${column}::text NOT LIKE ${quoteLiteral(filter.value)}`;
    case "ilike":
      return `${column}::text ILIKE ${quoteLiteral(filter.value)}`;
    case "contains":
      return `${column}::text ILIKE ${quoteLiteral(`%${escapeLike(filter.value)}%`)}`;
    case "startsWith":
      return `${column}::text ILIKE ${quoteLiteral(`${escapeLike(filter.value)}%`)}`;
    case "endsWith":
      return `${column}::text ILIKE ${quoteLiteral(`%${escapeLike(filter.value)}`)}`;
    case "in":
    case "notIn": {
      const items = filter.value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "")
        .map(quoteLiteral);
      const list = items.length === 0 ? "NULL" : items.join(", ");
      return `${column} ${filter.op === "in" ? "IN" : "NOT IN"} (${list})`;
    }
    default:
      return "TRUE";
  }
}

export function whereClause(query: TableQuery): string | null {
  const predicates = query.filters
    .filter((f) => f.enabled && (!operatorNeedsValue(f.op) || f.value !== ""))
    .map(filterPredicate);
  const raw = query.rawWhere.trim();
  if (raw !== "") predicates.push(`(${raw})`);
  return predicates.length === 0 ? null : predicates.join(" AND ");
}

export function hasActiveFilters(query: TableQuery): boolean {
  return whereClause(query) !== null;
}

/** Page query; falls back to the primary key ordering so paging is stable. */
export function pageSql(query: TableQuery, defaultOrder: string[]): string {
  let sql = `SELECT * FROM ${qualifiedName(query.table)}`;
  const where = whereClause(query);
  if (where) sql += `\nWHERE ${where}`;
  const order =
    query.sort.length === 0
      ? defaultOrder.map((column) => `${quoteIdent(column)} ASC`)
      : query.sort.map((s) => `${quoteIdent(s.column)} ${s.ascending ? "ASC" : "DESC"}`);
  if (order.length > 0) sql += `\nORDER BY ${order.join(", ")}`;
  sql += `\nLIMIT ${query.pageSize} OFFSET ${query.page * query.pageSize}`;
  return sql;
}

export function countSql(query: TableQuery): string {
  const where = whereClause(query);
  return `SELECT count(*) FROM ${qualifiedName(query.table)}${where ? ` WHERE ${where}` : ""}`;
}

/** Cycles ascending, descending, none for a column and resets the page. */
export function toggleSort(query: TableQuery, column: string): TableQuery {
  const current = query.sort[0];
  let sort: SortDescriptor[];
  if (current?.column === column) {
    sort = current.ascending ? [{ column, ascending: false }] : [];
  } else {
    sort = [{ column, ascending: true }];
  }
  return { ...query, sort, page: 0 };
}
