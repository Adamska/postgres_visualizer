// Builds the grid snapshot from a result set, the table structure and staged changes.

import { isTableEditable, rowIdentity, type ChangeSet, type EditValue } from "@/core/changes/changeSet";
import { richValue, type RichOptions } from "@/core/format/rich";
import { booleanValue, gridText } from "@/core/format/values";
import { previewSegments, segmentsText, type JsonSegment } from "@/core/json/preview";
import { jsonValueOf } from "@/core/json/tree";
import type { GridCell, GridColumn, GridContent, GridRow } from "@/features/grid/types";
import type { CellValue, QueryResult, TableStructure } from "@/lib/types";

/** Plain rendering everywhere; used where rich cells are not wanted. */
export const PLAIN_OPTIONS: RichOptions = { relativeTimes: false, groupDigits: false };

export function gridColumns(result: QueryResult, structure: TableStructure | null): GridColumn[] {
  const editable = structure ? isTableEditable(structure) : false;
  return result.columns.map((column, index) => {
    const info = structure?.columns.find((c) => c.name === column.name);
    return {
      id: index,
      name: column.name,
      typeName: info?.typeName ?? column.typeName,
      kind: info?.kind ?? column.kind,
      isPrimaryKey: info?.isPrimaryKey ?? false,
      isForeignKey: structure?.foreignKeys.some((fk) => fk.columns.includes(column.name)) ?? false,
      isNullable: info?.isNullable ?? true,
      isEditable: editable && info !== undefined && !info.isGenerated,
      enumValues: info?.enumValues ?? null,
    };
  });
}

/** Preview segments when the value gets the JSON treatment for this column kind. */
function jsonPreview(value: CellValue, kind: GridColumn["kind"]): JsonSegment[] | null {
  const parsed = jsonValueOf(value, kind);
  return parsed === undefined ? null : previewSegments(parsed);
}

const PLACEHOLDER = {
  isNull: false,
  isModified: false,
  isDefault: false,
  json: null,
  boolean: null,
  rich: null,
} as const;

function nullCell(isModified: boolean): GridCell {
  return { ...PLACEHOLDER, text: "NULL", raw: null, isNull: true, isModified };
}

function defaultCell(isModified: boolean): GridCell {
  return { ...PLACEHOLDER, text: "DEFAULT", raw: undefined, isDefault: true, isModified };
}

function valueCell(value: string, column: GridColumn, isModified: boolean, options: RichOptions): GridCell {
  const json = jsonPreview(value, column.kind);
  return {
    text: json ? gridText(segmentsText(json), column.kind) : gridText(value, column.kind),
    raw: value,
    isNull: false,
    isModified,
    isDefault: false,
    json,
    boolean: column.kind === "boolean" ? booleanValue(value) : null,
    rich: json ? null : richValue(value, column, options),
  };
}

function plainCell(value: CellValue, column: GridColumn, options: RichOptions): GridCell {
  return value === null ? nullCell(false) : valueCell(value, column, false, options);
}

function editedCell(edit: EditValue, column: GridColumn, options: RichOptions): GridCell {
  switch (edit.kind) {
    case "text":
      return valueCell(edit.value, column, true, options);
    case "null":
      return nullCell(true);
    case "default":
      return defaultCell(true);
  }
}

/** Rows for a read-only result. */
export function readOnlyRows(
  result: QueryResult,
  columns: readonly GridColumn[],
  options: RichOptions = PLAIN_OPTIONS,
): GridRow[] {
  return result.rows.map((row) => ({
    cells: columns.map((column, index) => plainCell(row[index] ?? null, column, options)),
    state: "normal",
  }));
}

/** Rows for an editable table page: existing rows with staged edits, then pending inserts. */
export function editableRows(
  result: QueryResult,
  structure: TableStructure,
  changes: ChangeSet,
  columns: readonly GridColumn[],
  options: RichOptions = PLAIN_OPTIONS,
): GridRow[] {
  const names = result.columns.map((c) => c.name);
  const rows: GridRow[] = result.rows.map((row) => {
    const identity = rowIdentity(structure, row, names);
    const deleted = identity !== null && identity.key in changes.deletes;
    const staged = identity ? changes.updates[identity.key]?.columns : undefined;
    const cells = columns.map((column, index) => {
      const edit = staged?.[column.name];
      return edit ? editedCell(edit, column, options) : plainCell(row[index] ?? null, column, options);
    });
    return { cells, state: deleted ? "deleted" : staged ? "modified" : "normal" };
  });
  for (const insert of changes.inserts) {
    const cells = columns.map((column) => {
      const edit = insert.values[column.name];
      if (edit) return editedCell(edit, column, options);
      const info = structure.columns.find((c) => c.name === column.name);
      const hasDefault = info && (info.defaultValue !== null || info.isIdentity || info.isGenerated);
      return hasDefault ? defaultCell(false) : nullCell(false);
    });
    rows.push({ cells, state: "inserted" });
  }
  return rows;
}

export function buildGridContent(
  result: QueryResult | null,
  structure: TableStructure | null,
  changes: ChangeSet | null,
  version: number,
  options: RichOptions = PLAIN_OPTIONS,
): GridContent {
  if (!result) return { columns: [], rows: [], version };
  const columns = gridColumns(result, structure);
  const rows =
    structure && changes && isTableEditable(structure)
      ? editableRows(result, structure, changes, columns, options)
      : readOnlyRows(result, columns, options);
  return { columns, rows, version };
}
