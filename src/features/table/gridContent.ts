// Builds the grid snapshot from a result set, the table structure and staged changes.

import { isTableEditable, rowIdentity, type ChangeSet, type EditValue } from "@/core/changes/changeSet";
import { booleanValue, gridText } from "@/core/format/values";
import { previewSegments, segmentsText, type JsonSegment } from "@/core/json/preview";
import { jsonValueOf } from "@/core/json/tree";
import type { GridCell, GridColumn, GridContent, GridRow } from "@/features/grid/types";
import type { CellValue, QueryResult, TableStructure } from "@/lib/types";

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
      isForeignKey:
        structure?.foreignKeys.some((fk) => fk.columns.length === 1 && fk.columns[0] === column.name) ??
        false,
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

function valueCell(value: string, kind: GridColumn["kind"], isModified: boolean): GridCell {
  const json = jsonPreview(value, kind);
  return {
    text: json ? gridText(segmentsText(json), kind) : gridText(value, kind),
    raw: value,
    isNull: false,
    isModified,
    isDefault: false,
    json,
    boolean: kind === "boolean" ? booleanValue(value) : null,
  };
}

function plainCell(value: CellValue, kind: GridColumn["kind"]): GridCell {
  if (value === null) {
    return {
      text: "NULL",
      raw: null,
      isNull: true,
      isModified: false,
      isDefault: false,
      json: null,
      boolean: null,
    };
  }
  return valueCell(value, kind, false);
}

function editedCell(edit: EditValue, kind: GridColumn["kind"]): GridCell {
  switch (edit.kind) {
    case "text":
      return valueCell(edit.value, kind, true);
    case "null":
      return {
        text: "NULL",
        raw: null,
        isNull: true,
        isModified: true,
        isDefault: false,
        json: null,
        boolean: null,
      };
    case "default":
      return {
        text: "DEFAULT",
        raw: undefined,
        isNull: false,
        isModified: true,
        isDefault: true,
        json: null,
        boolean: null,
      };
  }
}

/** Rows for a read-only result. */
export function readOnlyRows(result: QueryResult): GridRow[] {
  return result.rows.map((row) => ({
    cells: result.columns.map((column, index) => plainCell(row[index] ?? null, column.kind)),
    state: "normal",
  }));
}

/** Rows for an editable table page: existing rows with staged edits, then pending inserts. */
export function editableRows(result: QueryResult, structure: TableStructure, changes: ChangeSet): GridRow[] {
  const names = result.columns.map((c) => c.name);
  const rows: GridRow[] = result.rows.map((row) => {
    const identity = rowIdentity(structure, row, names);
    const deleted = identity !== null && identity.key in changes.deletes;
    const staged = identity ? changes.updates[identity.key]?.columns : undefined;
    const cells = result.columns.map((column, index) => {
      const edit = staged?.[column.name];
      return edit ? editedCell(edit, column.kind) : plainCell(row[index] ?? null, column.kind);
    });
    return { cells, state: deleted ? "deleted" : staged ? "modified" : "normal" };
  });
  for (const insert of changes.inserts) {
    const cells = result.columns.map((column) => {
      const edit = insert.values[column.name];
      if (edit) return editedCell(edit, column.kind);
      const info = structure.columns.find((c) => c.name === column.name);
      if (info && (info.defaultValue !== null || info.isIdentity || info.isGenerated)) {
        return {
          text: "DEFAULT",
          raw: undefined,
          isNull: false,
          isModified: false,
          isDefault: true,
          json: null,
          boolean: null,
        };
      }
      return {
        text: "NULL",
        raw: null,
        isNull: true,
        isModified: false,
        isDefault: false,
        json: null,
        boolean: null,
      };
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
): GridContent {
  if (!result) return { columns: [], rows: [], version };
  const columns = gridColumns(result, structure);
  const rows =
    structure && changes && isTableEditable(structure)
      ? editableRows(result, structure, changes)
      : readOnlyRows(result);
  return { columns, rows, version };
}
