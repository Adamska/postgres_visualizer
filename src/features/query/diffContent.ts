// Grid snapshot of a result diff: added rows read as inserted, removed as deleted, changed cells
// as modified with their previous value alongside.

import type { ResultDiff } from "@/core/diff/resultDiff";
import { gridText } from "@/core/format/values";
import type { GridCell, GridColumn, GridContent, GridRowState } from "@/features/grid/types";
import type { ResultColumn } from "@/lib/types";

const ROW_STATES: Record<ResultDiff["rows"][number]["state"], GridRowState> = {
  added: "inserted",
  removed: "deleted",
  changed: "modified",
  same: "normal",
};

export function diffGridContent(
  diff: ResultDiff,
  columns: readonly ResultColumn[],
  version: number,
): GridContent {
  const gridColumns: GridColumn[] = diff.columns.map((name, id) => {
    const column = columns.find((c) => c.name === name);
    return {
      id,
      name,
      typeName: column?.typeName ?? "",
      kind: column?.kind ?? "text",
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isEditable: false,
      enumValues: null,
    };
  });
  const rows = diff.rows.map((row) => ({
    state: ROW_STATES[row.state],
    cells: gridColumns.map((column, index): GridCell => {
      const value = row.values[index] ?? null;
      const changed = index in row.previous;
      const text = gridText(value, column.kind);
      const previous = changed ? gridText(row.previous[index] ?? null, column.kind) : null;
      return {
        text: previous === null ? text : `${text}  ←  ${previous}`,
        raw: value,
        isNull: value === null && !changed,
        isModified: changed,
        isDefault: false,
        json: null,
        boolean: null,
        rich: null,
      };
    }),
  }));
  return { columns: gridColumns, rows, version };
}
