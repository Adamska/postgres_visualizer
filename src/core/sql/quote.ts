// Quoting helpers for generated SQL.

import type { TableRef } from "@/lib/types";

import { isKeyword } from "./tokenizer";

/** Always double-quotes an identifier. */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Quotes only when needed, for SQL shown to users. */
export function quoteIdentIfNeeded(identifier: string): string {
  const simple = /^[a-z_][a-z0-9_]*$/.test(identifier) && !isKeyword(identifier);
  return simple ? identifier : quoteIdent(identifier);
}

/** Quotes a text literal; `standard_conforming_strings` is on so backslashes are literal. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Renders a cell value as a literal. */
export function renderLiteral(value: string | null): string {
  return value === null ? "NULL" : quoteLiteral(value);
}

export function qualifiedName(table: TableRef): string {
  return `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
}

/** Display form, omitting the `public` schema. */
export function displayName(table: TableRef): string {
  return table.schema === "public" ? table.name : `${table.schema}.${table.name}`;
}

export function sameTable(a: TableRef, b: TableRef): boolean {
  return a.schema === b.schema && a.name === b.name;
}
