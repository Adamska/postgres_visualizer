// Contract between the data grid component and the models that feed it.

import type { EditValue } from "@/core/changes/changeSet";
import type { RichValue } from "@/core/format/rich";
import type { JsonSegment } from "@/core/json/preview";
import type { FilterOperator } from "@/core/query/tableQuery";
import type { CellValue, ValueKind } from "@/lib/types";

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
  /** Coloured single-line preview when the value is JSON; `null` for plain values. */
  json: JsonSegment[] | null;
  /** Parsed value for boolean columns; `null` for other kinds, NULL and unparsable text. */
  boolean: boolean | null;
  /** Richer rendering (timestamps, UUIDs, enums, arrays, colours…); `null` for plain text. */
  rich: RichValue | null;
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

/** A rectangle of selected cells in content coordinates. */
export interface GridRange {
  rowStart: number;
  /** Exclusive. */
  rowEnd: number;
  /** Content column indices, in display order. */
  columns: number[];
}

export interface GridSelection {
  rows: number[];
  focused: GridCellPosition | null;
  /** The selected rectangle of cells, when there is one. */
  range: GridRange | null;
}

export const EMPTY_SELECTION: GridSelection = { rows: [], focused: null, range: null };

/** Screen-space rectangle (client coordinates). */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Filters offered from a cell's context menu. */
export type ValueFilter = Extract<
  FilterOperator,
  "equals" | "notEquals" | "greaterThan" | "lessThan" | "isNull" | "isNotNull"
>;

/** Callbacks from the grid to its owner. */
export interface GridActions {
  onSelectionChange?: (selection: GridSelection) => void;
  onSortRequest?: (column: GridColumn) => void;
  /** Inline edit finished, or "Set NULL"/"Set DEFAULT" chosen. */
  onCommitEdit?: (position: GridCellPosition, value: EditValue) => void;
  /** The user asked for the large editor or viewer (multi-line or JSON values). */
  onOpenEditor?: (position: GridCellPosition) => void;
  onDeleteRows?: (rows: number[]) => void;
  /** Follows the foreign key of a cell, in place or in a new tab. */
  onFollowForeignKey?: (position: GridCellPosition, newTab: boolean) => void;
  onToggleColumnVisibility?: (columnId: number) => void;
  onColumnResize?: (columnId: number, width: number) => void;
  /** A column was dragged; `order` holds every column id in the new display order. */
  onColumnMove?: (order: number[]) => void;
  /** Keep this many leading visible columns in place. */
  onFreezeColumns?: (count: number) => void;
  /** The header's menu button (or "Profile column") was used. */
  onColumnProfile?: (column: GridColumn, bounds: Bounds) => void;
  /** The pointer rests on a cell, or left the cells (`null`). */
  onCellHover?: (hover: { position: GridCellPosition; bounds: Bounds } | null) => void;
  /** Filters the rows on the value of a cell. */
  onFilterValue?: (position: GridCellPosition, filter: ValueFilter) => void;
}

export interface DataGridProps {
  content: GridContent;
  sort?: GridSortState | null;
  hiddenColumnIds?: ReadonlySet<number>;
  /** Column ids in display order; natural order when absent. */
  columnOrder?: readonly number[];
  /** Widths chosen by the user, by column id. */
  columnWidths?: ReadonlyMap<number, number>;
  /** Leading visible columns kept in place while scrolling sideways. */
  frozenColumns?: number;
  /** Cells containing this text (case-insensitive) are highlighted. */
  highlight?: string;
  /** When set, the grid moves focus there (e.g. after adding a row). */
  focusRequest?: GridCellPosition | null;
  fontSize?: number;
  actions?: GridActions;
  /** Read-only grids skip editing affordances entirely. */
  readOnly?: boolean;
  className?: string;
}
