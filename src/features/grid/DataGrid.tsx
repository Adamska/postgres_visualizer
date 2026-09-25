// Canvas data grid built on Glide Data Grid, implementing the `DataGridProps` contract.

import "@glideapps/glide-data-grid/dist/index.css";

import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell as GlideCell,
  type GridColumn as GlideColumn,
  type GridSelection as GlideSelection,
  type Item,
  type Rectangle,
  type Theme,
} from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { copyText } from "@/lib/files";

import { CellContextMenu, type MenuContext, type MenuTarget } from "./CellContextMenu";
import { HeaderTooltip, type HeaderHover } from "./HeaderTooltip";
import {
  BASE_FONT_SIZE,
  HEADER_HEIGHT,
  ROW_MARKER_WIDTH,
  canSetNull,
  cellDisplayText,
  cellStyle,
  columnWidths,
  contentAlignFor,
  editModeFor,
  gridColumnOf,
  headerTitle,
  rowHeightFor,
  rowsForDeletion,
  sameSelection,
  toGridSelection,
  visibleColumns,
} from "./gridModel";
import { buildCellThemes, buildRowThemes, useGridTheme } from "./gridTheme";
import type { DataGridProps, GridSelection } from "./types";

const EMPTY_SELECTION: GlideSelection = { columns: CompactSelection.empty(), rows: CompactSelection.empty() };

const HEADER_ICONS = {
  key: ({ fgColor }: { fgColor: string; bgColor: string }) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${fgColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.65-8.65M21 3l-3 3m-1 1-2-2"/></svg>`,
};

/** Data grid used for table pages and query results. */
export function DataGrid({
  content,
  sort = null,
  hiddenColumnIds,
  focusRequest = null,
  fontSize = BASE_FONT_SIZE,
  actions,
  readOnly = false,
  className,
}: DataGridProps) {
  const ref = useRef<DataEditorRef>(null);
  const { theme, palette } = useGridTheme(fontSize);
  const cellThemes = useMemo(() => buildCellThemes(palette, fontSize), [palette, fontSize]);
  const rowThemes = useMemo(() => buildRowThemes(palette), [palette]);
  const visible = useMemo(
    () => visibleColumns(content.columns, hiddenColumnIds),
    [content.columns, hiddenColumnIds],
  );
  const [widths, setWidths] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [selection, setSelection] = useState<GlideSelection>(EMPTY_SELECTION);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [hover, setHover] = useState<HeaderHover | null>(null);
  const lastReported = useRef<GridSelection>({ rows: [], focused: null });

  const glideColumns = useMemo<GlideColumn[]>(() => {
    const sizes = columnWidths(visible, widths);
    return visible.map(({ column }, index) => ({
      id: String(column.id),
      title: headerTitle(column, sort),
      width: sizes[index] ?? 160,
      icon: column.isPrimaryKey ? "key" : undefined,
      hasMenu: false,
    }));
  }, [visible, widths, sort]);

  // Reset selection when the content changes shape (new result set).
  const rowCount = content.rows.length;
  useEffect(() => {
    setSelection((current) => {
      const cell = current.current?.cell;
      if (cell && (cell[1] >= rowCount || cell[0] >= visible.length)) return EMPTY_SELECTION;
      return current;
    });
  }, [rowCount, visible.length]);

  const getCellContent = useCallback(
    ([col, row]: Item): GlideCell => {
      const entry = visible[col];
      const gridRow = content.rows[row];
      const cell = entry ? gridRow?.cells[entry.index] : undefined;
      if (!entry || !gridRow || !cell) {
        return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false };
      }
      const mode = editModeFor(entry.column, gridRow, readOnly);
      const style = cellStyle(cell, gridRow.state);
      return {
        kind: GridCellKind.Text,
        data: cell.raw ?? "",
        displayData: cellDisplayText(cell),
        allowOverlay: mode === "inline",
        readonly: mode !== "inline",
        contentAlign: contentAlignFor(entry.column.kind),
        themeOverride: cellThemes[style],
      };
    },
    [visible, content, readOnly, cellThemes],
  );

  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined => {
      const state = content.rows[row]?.state ?? "normal";
      return rowThemes[state];
    },
    [content, rowThemes],
  );

  const reportSelection = useCallback(
    (next: GlideSelection) => {
      const mapped = toGridSelection(next.current?.cell, next.rows.toArray(), visible);
      if (!sameSelection(mapped, lastReported.current)) {
        lastReported.current = mapped;
        actions?.onSelectionChange?.(mapped);
      }
    },
    [actions, visible],
  );

  const onGridSelectionChange = useCallback(
    (next: GlideSelection) => {
      setSelection(next);
      reportSelection(next);
    },
    [reportSelection],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      const entry = visible[col];
      if (!entry || newValue.kind !== GridCellKind.Text) return;
      const previous = content.rows[row]?.cells[entry.index];
      if (previous && (previous.raw ?? "") === newValue.data) return;
      actions?.onCommitEdit?.({ row, column: entry.index }, { kind: "text", value: newValue.data });
    },
    [visible, content, actions],
  );

  const onCellActivated = useCallback(
    ([col, row]: Item) => {
      const entry = visible[col];
      const gridRow = content.rows[row];
      if (!entry || !gridRow) return;
      if (editModeFor(entry.column, gridRow, readOnly) === "large") {
        actions?.onOpenEditor?.({ row, column: entry.index });
      }
    },
    [visible, content, readOnly, actions],
  );

  const onDelete = useCallback(
    (current: GlideSelection): boolean => {
      const markerRows = current.rows.toArray();
      const cell = current.current?.cell;
      if (markerRows.length > 0 && !readOnly) {
        actions?.onDeleteRows?.(rowsForDeletion(markerRows, null));
        return false;
      }
      if (cell) {
        const entry = visible[cell[0]];
        const gridRow = content.rows[cell[1]];
        if (entry && canSetNull(entry.column, gridRow, readOnly)) {
          actions?.onCommitEdit?.({ row: cell[1], column: entry.index }, { kind: "null" });
        }
      }
      return false;
    },
    [visible, content, readOnly, actions],
  );

  const onKeyDown = useCallback(
    (event: {
      key: string;
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      preventDefault: () => void;
      cancel: () => void;
    }) => {
      const cell = selection.current?.cell;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || !cell) return;
      const entry = visible[cell[0]];
      const gridRow = content.rows[cell[1]];
      if (!entry || !gridRow) return;
      const position = { row: cell[1], column: entry.index };
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        editModeFor(entry.column, gridRow, readOnly) !== "none"
      ) {
        event.cancel();
        actions?.onOpenEditor?.(position);
      } else if (
        event.key.toLowerCase() === "n" &&
        event.shiftKey &&
        canSetNull(entry.column, gridRow, readOnly)
      ) {
        event.cancel();
        actions?.onCommitEdit?.(position, { kind: "null" });
      }
    },
    [selection, visible, content, readOnly, actions],
  );

  const onCellContextMenu = useCallback(
    ([col, row]: Item) => {
      const entry = visible[col];
      const gridRow = content.rows[row];
      if (!entry || !gridRow) {
        setMenuTarget(null);
        return;
      }
      const alreadySelected = selection.rows.hasIndex(row) || selection.current?.cell[1] === row;
      if (!alreadySelected) {
        const next: GlideSelection = {
          ...EMPTY_SELECTION,
          current: { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 }, rangeStack: [] },
        };
        setSelection(next);
        reportSelection(next);
      }
      setMenuTarget({
        kind: "cell",
        position: { row, column: entry.index },
        column: entry.column,
        row: gridRow,
      });
    },
    [visible, content, selection, reportSelection],
  );

  const onHeaderContextMenu = useCallback(
    (col: number) => {
      const entry = visible[col];
      setMenuTarget(entry ? { kind: "header", column: entry.column } : null);
    },
    [visible],
  );

  const onHeaderClicked = useCallback(
    (col: number) => {
      const entry = visible[col];
      if (entry) actions?.onSortRequest?.(entry.column);
    },
    [visible, actions],
  );

  const onColumnResize = useCallback(
    (column: GlideColumn, newSize: number) => {
      const id = Number(column.id);
      setWidths((current) => new Map(current).set(id, newSize));
      actions?.onColumnResize?.(id, newSize);
    },
    [actions],
  );

  const onItemHovered = useCallback(
    (args: { kind: string; location: Item; bounds?: Rectangle }) => {
      const entry = args.kind === "header" ? visible[args.location[0]] : undefined;
      setHover(entry && args.bounds ? { column: entry.column, bounds: args.bounds } : null);
    },
    [visible],
  );

  useEffect(() => {
    if (!focusRequest) return;
    const col = gridColumnOf(visible, focusRequest.column);
    if (col === -1) return;
    const next: GlideSelection = {
      ...EMPTY_SELECTION,
      current: {
        cell: [col, focusRequest.row],
        range: { x: col, y: focusRequest.row, width: 1, height: 1 },
        rangeStack: [],
      },
    };
    setSelection(next);
    reportSelection(next);
    ref.current?.scrollTo(col, focusRequest.row, "both", 0, 0, { vAlign: "center" });
    ref.current?.focus();
  }, [focusRequest, visible, reportSelection]);

  const menuContext: MenuContext = {
    target: menuTarget,
    content,
    visible,
    hiddenColumnIds,
    selectedRows: selection.rows.toArray(),
    readOnly,
    actions,
    copy: (text) => void copyText(text),
  };

  return (
    <CellContextMenu context={menuContext} onOpenChange={(open) => !open && setMenuTarget(null)}>
      <div className={cn("relative h-full w-full overflow-hidden", className)} data-testid="data-grid">
        <DataEditor
          ref={ref}
          columns={glideColumns}
          rows={rowCount}
          getCellContent={getCellContent}
          getRowThemeOverride={getRowThemeOverride}
          onCellEdited={onCellEdited}
          onCellActivated={onCellActivated}
          onDelete={onDelete}
          onKeyDown={onKeyDown}
          onCellContextMenu={onCellContextMenu}
          onHeaderContextMenu={onHeaderContextMenu}
          onHeaderClicked={onHeaderClicked}
          onColumnResize={onColumnResize}
          onItemHovered={onItemHovered}
          gridSelection={selection}
          onGridSelectionChange={onGridSelectionChange}
          getCellsForSelection
          rowMarkers={{ kind: "number", width: ROW_MARKER_WIDTH }}
          rowHeight={rowHeightFor(fontSize)}
          headerHeight={HEADER_HEIGHT}
          theme={theme}
          headerIcons={HEADER_ICONS}
          rangeSelect="rect"
          columnSelect="none"
          rowSelect="multi"
          rowSelectionMode="multi"
          smoothScrollX
          smoothScrollY
          width="100%"
          height="100%"
        />
        <HeaderTooltip hover={hover} />
      </div>
    </CellContextMenu>
  );
}
