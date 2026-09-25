// Local modifications to one table, kept until the user commits or discards them.

import type { CellValue, TableStructure } from "@/lib/types";

import { qualifiedName, quoteIdent, renderLiteral } from "../sql/quote";
import { withoutKey } from "@/lib/records";

/** A value staged for a cell: text, SQL NULL, or the server default. */
export type EditValue = { kind: "text"; value: string } | { kind: "null" } | { kind: "default" };

export const NULL_EDIT: EditValue = { kind: "null" };
export const DEFAULT_EDIT: EditValue = { kind: "default" };

export function textEdit(value: string): EditValue {
  return { kind: "text", value };
}

export function editFromCell(value: CellValue): EditValue {
  return value === null ? NULL_EDIT : textEdit(value);
}

export function editToCell(edit: EditValue): CellValue | undefined {
  switch (edit.kind) {
    case "text":
      return edit.value;
    case "null":
      return null;
    case "default":
      return undefined;
  }
}

export function sameEdit(a: EditValue, b: EditValue): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "text" && b.kind === "text" ? a.value === b.value : true;
}

export function renderEdit(edit: EditValue): string {
  switch (edit.kind) {
    case "text":
      return renderLiteral(edit.value);
    case "null":
      return "NULL";
    case "default":
      return "DEFAULT";
  }
}

/** Identifies a persisted row by its primary key values. */
export interface RowIdentity {
  key: string;
  values: { column: string; value: CellValue }[];
}

export function rowIdentity(
  structure: TableStructure,
  row: CellValue[],
  columnNames: string[],
): RowIdentity | null {
  const keyColumns = structure.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  if (keyColumns.length === 0) return null;
  const values: { column: string; value: CellValue }[] = [];
  for (const column of keyColumns) {
    const index = columnNames.indexOf(column);
    if (index === -1 || index >= row.length) return null;
    values.push({ column, value: row[index] ?? null });
  }
  return { key: JSON.stringify(values.map((v) => v.value)), values };
}

export function identityPredicate(identity: RowIdentity): string {
  return identity.values
    .map(({ column, value }) =>
      value === null ? `${quoteIdent(column)} IS NULL` : `${quoteIdent(column)} = ${renderLiteral(value)}`,
    )
    .join(" AND ");
}

export interface PendingInsert {
  id: string;
  values: Record<string, EditValue>;
}

export interface ChangeSet {
  /** Keyed by `RowIdentity.key`. */
  updates: Record<string, { identity: RowIdentity; columns: Record<string, EditValue> }>;
  inserts: PendingInsert[];
  deletes: Record<string, RowIdentity>;
}

export function emptyChangeSet(): ChangeSet {
  return { updates: {}, inserts: [], deletes: {} };
}

export function isChangeSetEmpty(changes: ChangeSet): boolean {
  return (
    Object.keys(changes.updates).length === 0 &&
    changes.inserts.length === 0 &&
    Object.keys(changes.deletes).length === 0
  );
}

export function changeCount(changes: ChangeSet): number {
  const updates = Object.values(changes.updates).reduce((sum, u) => sum + Object.keys(u.columns).length, 0);
  return updates + changes.inserts.length + Object.keys(changes.deletes).length;
}

/** Stages a value; staging the original value removes the edit. Returns a new change set. */
export function setValue(
  changes: ChangeSet,
  identity: RowIdentity,
  column: string,
  value: EditValue,
  original: CellValue,
): ChangeSet {
  const entry = changes.updates[identity.key];
  const columns = withoutKey(entry?.columns ?? {}, column);
  if (!sameEdit(value, editFromCell(original))) columns[column] = value;
  const updates = withoutKey(changes.updates, identity.key);
  if (Object.keys(columns).length > 0) updates[identity.key] = { identity, columns };
  return { ...changes, updates };
}

export function stagedValue(
  changes: ChangeSet,
  identity: RowIdentity,
  column: string,
): EditValue | undefined {
  return changes.updates[identity.key]?.columns[column];
}

export function toggleDelete(changes: ChangeSet, identity: RowIdentity): ChangeSet {
  if (identity.key in changes.deletes) {
    return { ...changes, deletes: withoutKey(changes.deletes, identity.key) };
  }
  return {
    ...changes,
    deletes: { ...changes.deletes, [identity.key]: identity },
    updates: withoutKey(changes.updates, identity.key),
  };
}

/** Shallow copy of a record without one key. */
export function isDeleted(changes: ChangeSet, identity: RowIdentity): boolean {
  return identity.key in changes.deletes;
}

export function addInsert(
  changes: ChangeSet,
  values: Record<string, EditValue> = {},
): [ChangeSet, PendingInsert] {
  const insert: PendingInsert = { id: crypto.randomUUID(), values };
  return [{ ...changes, inserts: [...changes.inserts, insert] }, insert];
}

export function setInsertValue(
  changes: ChangeSet,
  insertId: string,
  column: string,
  value: EditValue,
): ChangeSet {
  return {
    ...changes,
    inserts: changes.inserts.map((i) =>
      i.id === insertId ? { ...i, values: { ...i.values, [column]: value } } : i,
    ),
  };
}

export function removeInsert(changes: ChangeSet, insertId: string): ChangeSet {
  return { ...changes, inserts: changes.inserts.filter((i) => i.id !== insertId) };
}

/** Statements applying the change set: deletes, updates, then inserts, in a stable order. */
export function changeStatements(changes: ChangeSet, structure: TableStructure): string[] {
  const table = qualifiedName({ schema: structure.schema, name: structure.name });
  const statements: string[] = [];

  for (const identity of Object.values(changes.deletes).sort((a, b) => a.key.localeCompare(b.key))) {
    statements.push(`DELETE FROM ${table} WHERE ${identityPredicate(identity)}`);
  }

  for (const update of Object.values(changes.updates).sort((a, b) =>
    a.identity.key.localeCompare(b.identity.key),
  )) {
    const assignments = Object.entries(update.columns)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([column, value]) => `${quoteIdent(column)} = ${renderEdit(value)}`);
    if (assignments.length === 0) continue;
    statements.push(
      `UPDATE ${table} SET ${assignments.join(", ")} WHERE ${identityPredicate(update.identity)}`,
    );
  }

  for (const insert of changes.inserts) {
    const provided = structure.columns
      .filter((c) => !c.isGenerated)
      .flatMap((c) => {
        const value = insert.values[c.name];
        return value && value.kind !== "default" ? [[c.name, value] as const] : [];
      });
    if (provided.length === 0) {
      statements.push(`INSERT INTO ${table} DEFAULT VALUES`);
    } else {
      const names = provided.map(([name]) => quoteIdent(name)).join(", ");
      const values = provided.map(([, value]) => renderEdit(value)).join(", ");
      statements.push(`INSERT INTO ${table} (${names}) VALUES (${values})`);
    }
  }
  return statements;
}

export function isTableEditable(structure: TableStructure): boolean {
  const writableKind = structure.kind !== "view" && structure.kind !== "materializedView";
  return writableKind && structure.columns.some((c) => c.isPrimaryKey);
}

export function readOnlyReason(structure: TableStructure): string | null {
  if (structure.kind === "view") return "Views are read-only.";
  if (structure.kind === "materializedView") return "Materialized views are read-only.";
  if (!structure.columns.some((c) => c.isPrimaryKey)) {
    return "This table has no primary key, so rows cannot be edited safely.";
  }
  return null;
}
