// Contract between the data grid component and the models that feed it.

import type { CellValue, ValueKind } from "@/lib/types";
import type { EditValue } from "@/core/changes/changeSet";

/** One column of the grid. `id` is the column index in the underlying result set. */
export interface GridColumn {
  id: number;
  name: string;
  typeName: string;
  kind: ValueKind;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  /** False for generated columns, views and query results. */
  isEditable: boolean;
  /** Allowed values for enum columns, shown as a picker. */
  enumValues: string[] | null;
}

export type GridRowState = "normal" | "modified" | "inserted" | "deleted";

/** What one cell shows. */
export interface GridCell {
  /** Display text (already formatted; NULL shown as "NULL"). */
  text: string;
  /** Raw value used for copying and editing; `null` for SQL NULL, undefined for DEFAULT. */
  raw: CellValue | undefined;
  isNull: boolean;
  isModified: boolean;
  isDefault: boolean;
}

export interface GridRow {
  cells: GridCell[];
  state: GridRowState;
}

/** Immutable snapshot rendered by the grid; `version` changes whenever rows or columns change. */
export interface GridContent {
  columns: GridColumn[];
  rows: GridRow[];
  version: number;
}

export const EMPTY_GRID: GridContent = { columns: [], rows: [], version: 0 };

export interface GridCellPosition {
  row: number;
  column: number;
}

export interface GridSortState {
  columnId: number;
  ascending: boolean;
}

export interface GridSelection {
  rows: number[];
  focused: GridCellPosition | null;
}

/** Callbacks from the grid to its owner. */
export interface GridActions {
  onSelectionChange?: (selection: GridSelection) => void;
  onSortRequest?: (column: GridColumn) => void;
  /** Inline edit finished, or "Set NULL"/"Set DEFAULT" chosen. */
  onCommitEdit?: (position: GridCellPosition, value: EditValue) => void;
  /** The user asked for the large editor (multi-line or JSON values). */
  onOpenEditor?: (position: GridCellPosition) => void;
  onDeleteRows?: (rows: number[]) => void;
  onFollowForeignKey?: (position: GridCellPosition) => void;
  onToggleColumnVisibility?: (columnId: number) => void;
  onColumnResize?: (columnId: number, width: number) => void;
}

export interface DataGridProps {
  content: GridContent;
  sort?: GridSortState | null;
  hiddenColumnIds?: ReadonlySet<number>;
  /** When set, the grid moves focus there (e.g. after adding a row). */
  focusRequest?: GridCellPosition | null;
  fontSize?: number;
  actions?: GridActions;
  /** Read-only grids skip editing affordances entirely. */
  readOnly?: boolean;
  className?: string;
}
