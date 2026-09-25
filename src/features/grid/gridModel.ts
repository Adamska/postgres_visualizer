// Pure helpers behind the data grid: column sizing, visibility, selection mapping and clipboard text.

import { toTsv } from "@/core/exchange/export";
import { isRightAligned, prefersLargeEditor } from "@/core/format/values";
import type { CellValue, ValueKind } from "@/lib/types";

import type {
  GridCell,
  GridCellPosition,
  GridColumn,
  GridContent,
  GridRow,
  GridRowState,
  GridSelection,
  GridSortState,
} from "./types";

/** Widest a column is sized by default; the user can still drag it wider. */
export const MAX_COLUMN_WIDTH = 420;
/** Narrowest a column can be dragged. */
export const MIN_COLUMN_WIDTH = 60;
/** Width of the row-number column on the left. */
export const ROW_MARKER_WIDTH = 44;
/** Font size the row height is designed for. */
export const BASE_FONT_SIZE = 13;
/** Row height at `BASE_FONT_SIZE`. */
export const BASE_ROW_HEIGHT = 28;
/** Height of the header row. */
export const HEADER_HEIGHT = 32;

/** Default width in pixels for a column of the given kind; long names get a little extra room. */
export function defaultColumnWidth(kind: ValueKind, name = ""): number {
  const byName = name.length * 8 + 36;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(kindWidth(kind), byName));
}

function kindWidth(kind: ValueKind): number {
  switch (kind) {
    case "boolean":
    case "integer":
      return 90;
    case "uuid":
      return 260;
    case "timestamp":
      return 200;
    default:
      return 160;
  }
}

/** Row height that keeps the 28px-at-13px proportion for other font sizes. */
export function rowHeightFor(fontSize: number): number {
  return Math.round((BASE_ROW_HEIGHT * fontSize) / BASE_FONT_SIZE);
}

/** A column shown by the grid, with its index into `GridContent.columns`. */
export interface VisibleColumn {
  column: GridColumn;
  index: number;
}

/** The columns that are not hidden, in content order. */
export function visibleColumns(
  columns: readonly GridColumn[],
  hidden?: ReadonlySet<number> | null,
): VisibleColumn[] {
  const out: VisibleColumn[] = [];
  columns.forEach((column, index) => {
    if (!hidden?.has(column.id)) out.push({ column, index });
  });
  return out;
}

/** The hidden columns, in content order. */
export function hiddenColumns(
  columns: readonly GridColumn[],
  hidden?: ReadonlySet<number> | null,
): GridColumn[] {
  return hidden ? columns.filter((column) => hidden.has(column.id)) : [];
}

/** Grid column index for a content column index, or -1 when that column is hidden. */
export function gridColumnOf(visible: readonly VisibleColumn[], contentIndex: number): number {
  return visible.findIndex((entry) => entry.index === contentIndex);
}

/** Header text with the sort indicator appended when the column is sorted. */
export function headerTitle(column: GridColumn, sort: GridSortState | null | undefined): string {
  if (sort?.columnId === column.id) return `${column.name} ${sort.ascending ? "↑" : "↓"}`;
  return column.name;
}

/** Column widths for the visible columns: user overrides first, then the kind default. */
export function columnWidths(
  visible: readonly VisibleColumn[],
  overrides: ReadonlyMap<number, number>,
): number[] {
  return visible.map(
    ({ column }) => overrides.get(column.id) ?? defaultColumnWidth(column.kind, column.name),
  );
}

/** Text drawn in a cell; NULL and DEFAULT get their placeholders regardless of `text`. */
export function cellDisplayText(cell: GridCell): string {
  if (cell.isDefault) return "DEFAULT";
  if (cell.isNull) return "NULL";
  return cell.text;
}

/** Text put on the clipboard for a cell: the raw value, with NULL and DEFAULT as empty strings. */
export function cellCopyText(cell: GridCell): string {
  return cell.raw ?? "";
}

/** Which visual treatment a cell gets; the row state wins over cell flags. */
export type CellStyle = "normal" | "null" | "default" | "modified" | "deleted" | "inserted";

export function cellStyle(cell: GridCell, rowState: GridRowState): CellStyle {
  if (rowState === "deleted") return "deleted";
  if (cell.isDefault) return "default";
  if (cell.isNull) return "null";
  if (cell.isModified) return "modified";
  if (rowState === "inserted") return "inserted";
  return "normal";
}

export function contentAlignFor(kind: ValueKind): "left" | "right" {
  return isRightAligned(kind) ? "right" : "left";
}

/** What activating a cell does: nothing, Glide's inline editor, or the owner's large editor. */
export type EditMode = "none" | "inline" | "large";

export function editModeFor(column: GridColumn, row: GridRow | undefined, readOnly: boolean): EditMode {
  if (readOnly || !column.isEditable || row === undefined || row.state === "deleted") return "none";
  const hasEnum = column.enumValues !== null && column.enumValues.length > 0;
  return prefersLargeEditor(column.kind) || hasEnum ? "large" : "inline";
}

/**
 * What activating a cell (double-click, Enter) does: editing, the large editor, the read-only
 * viewer for JSON, or flipping an editable boolean.
 */
export type ActivationMode = EditMode | "view" | "toggle";

export function activationFor(
  column: GridColumn,
  row: GridRow | undefined,
  cell: GridCell | undefined,
  readOnly: boolean,
): ActivationMode {
  const mode = editModeFor(column, row, readOnly);
  if (mode === "inline" && cell?.json) return "large";
  if (mode === "inline" && cell?.boolean !== null && cell?.boolean !== undefined) return "toggle";
  if (mode === "none" && cell?.json && row?.state !== "deleted") return "view";
  return mode;
}

export function canSetNull(column: GridColumn, row: GridRow | undefined, readOnly: boolean): boolean {
  return column.isNullable && editModeFor(column, row, readOnly) !== "none";
}

/** A rectangle of grid cells; `x`/`width` are grid (visible) column indices, `y`/`height` rows. */
export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Content positions covered by a rectangle, row-major. */
export function positionsInRect(rect: CellRect, visible: readonly VisibleColumn[]): GridCellPosition[] {
  const out: GridCellPosition[] = [];
  for (let row = rect.y; row < rect.y + rect.height; row++) {
    for (let col = rect.x; col < rect.x + rect.width; col++) {
      const entry = visible[col];
      if (entry) out.push({ row, column: entry.index });
    }
  }
  return out;
}

/** Column names and raw values for a rectangle of cells. */
export function selectionValues(
  content: GridContent,
  visible: readonly VisibleColumn[],
  rect: CellRect,
): { names: string[]; rows: CellValue[][] } {
  const entries = visible.slice(rect.x, rect.x + rect.width);
  const names = entries.map((entry) => entry.column.name);
  const rows: CellValue[][] = [];
  for (let row = rect.y; row < rect.y + rect.height; row++) {
    const gridRow = content.rows[row];
    if (!gridRow) continue;
    rows.push(entries.map((entry) => gridRow.cells[entry.index]?.raw ?? null));
  }
  return { names, rows };
}

/** TSV for a rectangle of cells; NULL copies as an empty string. */
export function selectionTsv(
  content: GridContent,
  visible: readonly VisibleColumn[],
  rect: CellRect,
  includeHeader = false,
): string {
  const { names, rows } = selectionValues(content, visible, rect);
  if (names.length === 0 || rows.length === 0) return "";
  const text = toTsv(names, rows);
  return includeHeader ? text : text.slice(text.indexOf("\n") + 1);
}

/** TSV with a header for whole rows across the visible columns. */
export function rowsTsv(
  content: GridContent,
  visible: readonly VisibleColumn[],
  rows: readonly number[],
): string {
  const names = visible.map((entry) => entry.column.name);
  const values = rows.flatMap((row) => {
    const gridRow = content.rows[row];
    return gridRow ? [visible.map((entry) => gridRow.cells[entry.index]?.raw ?? null)] : [];
  });
  if (names.length === 0 || values.length === 0) return "";
  return toTsv(names, values);
}

/** Maps Glide's selection (grid coordinates) to the contract's selection (content coordinates). */
export function toGridSelection(
  current: readonly [col: number, row: number] | undefined,
  selectedRows: readonly number[],
  visible: readonly VisibleColumn[],
): GridSelection {
  const entry = current ? visible[current[0]] : undefined;
  const focused = current && entry ? { row: current[1], column: entry.index } : null;
  const rows = selectedRows.length > 0 ? [...selectedRows] : focused ? [focused.row] : [];
  return { rows, focused };
}

export function sameSelection(a: GridSelection, b: GridSelection): boolean {
  if (a.rows.length !== b.rows.length || a.rows.some((row, i) => row !== b.rows[i])) return false;
  if (a.focused === null || b.focused === null) return a.focused === b.focused;
  return a.focused.row === b.focused.row && a.focused.column === b.focused.column;
}

/** Rows a delete acts on: the marker selection, else the focused row. */
export function rowsForDeletion(selectedRows: readonly number[], focusedRow: number | null): number[] {
  if (selectedRows.length > 0) return [...selectedRows];
  return focusedRow === null ? [] : [focusedRow];
}

/** Clamps a grid position into the grid; `null` when the grid has no cells. */
export function clampPosition(
  position: { col: number; row: number },
  rowCount: number,
  columnCount: number,
): { col: number; row: number } | null {
  if (rowCount <= 0 || columnCount <= 0) return null;
  return {
    col: Math.min(Math.max(position.col, 0), columnCount - 1),
    row: Math.min(Math.max(position.row, 0), rowCount - 1),
  };
}

/** Moves a grid position by a delta, staying inside the grid. */
export function movePosition(
  position: { col: number; row: number },
  dx: number,
  dy: number,
  rowCount: number,
  columnCount: number,
): { col: number; row: number } {
  return clampPosition({ col: position.col + dx, row: position.row + dy }, rowCount, columnCount) ?? position;
}
