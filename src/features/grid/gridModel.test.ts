import { describe, expect, it } from "vitest";

import { buildGridTheme, readToken } from "./gridTheme";
import { booleanColor } from "./booleanCell";
import { layoutSegments, segmentColor } from "./jsonCell";
import {
  activationFor,
  cellCopyText,
  cellDisplayText,
  cellStyle,
  clampPosition,
  defaultColumnWidth,
  editModeFor,
  headerTitle,
  matchingCells,
  movedOrder,
  movePosition,
  rowHeightFor,
  rowsTsv,
  sameSelection,
  selectedCells,
  selectionTsv,
  toGridSelection,
  visibleColumns,
} from "./gridModel";
import type { GridColumn, GridContent } from "./types";

const column = (id: number, name: string, extra: Partial<GridColumn> = {}): GridColumn => ({
  id,
  name,
  typeName: "text",
  kind: "text",
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: true,
  isEditable: true,
  enumValues: null,
  ...extra,
});

const content: GridContent = {
  columns: [
    column(0, "id", { kind: "integer", isPrimaryKey: true }),
    column(1, "name"),
    column(2, "meta", { kind: "json" }),
  ],
  rows: [
    {
      cells: [
        {
          text: "1",
          raw: "1",
          isNull: false,
          isModified: false,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
        {
          text: "Ann",
          raw: "Ann",
          isNull: false,
          isModified: true,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
        {
          text: "NULL",
          raw: null,
          isNull: true,
          isModified: false,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
      ],
      state: "normal",
    },
    {
      cells: [
        {
          text: "2",
          raw: "2",
          isNull: false,
          isModified: false,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
        {
          text: "Bob",
          raw: "Bob",
          isNull: false,
          isModified: false,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
        {
          text: "{}",
          raw: "{}",
          isNull: false,
          isModified: false,
          isDefault: false,
          json: null,
          boolean: null,
          rich: null,
        },
      ],
      state: "deleted",
    },
  ],
  version: 1,
};

describe("grid model", () => {
  it("sizes columns by kind and name", () => {
    expect(defaultColumnWidth("integer")).toBe(90);
    expect(defaultColumnWidth("uuid")).toBe(260);
    expect(defaultColumnWidth("text", "a_really_long_column_name_that_goes_on_and_on_forever_and_ever")).toBe(
      420,
    );
    expect(rowHeightFor(13)).toBe(28);
    expect(rowHeightFor(16)).toBe(34);
  });

  it("maps visible columns and header titles", () => {
    const visible = visibleColumns(content.columns, new Set([1]));
    expect(visible.map((v) => v.index)).toEqual([0, 2]);
    expect(headerTitle(content.columns[1]!, { columnId: 1, ascending: false })).toBe("name ↓");
    expect(headerTitle(content.columns[1]!, null)).toBe("name");
  });

  it("formats cells and styles", () => {
    const cell = content.rows[0]!.cells[2]!;
    expect(cellDisplayText(cell)).toBe("NULL");
    expect(cellCopyText(cell)).toBe("");
    expect(cellStyle(cell, "normal")).toBe("null");
    expect(cellStyle(content.rows[0]!.cells[1]!, "normal")).toBe("modified");
    expect(cellStyle(content.rows[1]!.cells[1]!, "deleted")).toBe("deleted");
  });

  it("decides how cells are edited", () => {
    expect(editModeFor(content.columns[1]!, content.rows[0], false)).toBe("inline");
    expect(editModeFor(content.columns[2]!, content.rows[0], false)).toBe("large");
    expect(editModeFor(content.columns[1]!, content.rows[1], false)).toBe("none");
    expect(editModeFor(content.columns[1]!, content.rows[0], true)).toBe("none");
    expect(editModeFor(column(3, "mood", { enumValues: ["a"] }), content.rows[0], false)).toBe("large");
  });

  it("orders, moves and searches columns", () => {
    const ordered = visibleColumns(content.columns, new Set([1]), [2, 0]);
    expect(ordered.map((v) => v.column.name)).toEqual(["meta", "id"]);
    const all = visibleColumns(content.columns);
    expect(movedOrder(content.columns, all, null, 0, 2)).toEqual([1, 2, 0]);
    expect(movedOrder(content.columns, all, null, 2, 0)).toEqual([2, 0, 1]);
    expect(movedOrder(content.columns, ordered, [2, 0, 1], 1, 0)).toEqual([0, 2, 1]);
    expect(matchingCells(content, all, "BO")).toEqual([{ x: 1, y: 1, width: 1, height: 1 }]);
    expect(matchingCells(content, all, " ")).toEqual([]);
  });

  it("builds TSV for selections and rows", () => {
    const visible = visibleColumns(content.columns);
    expect(selectionTsv(content, visible, { x: 0, y: 0, width: 3, height: 2 })).toBe("1\tAnn\t\n2\tBob\t{}");
    expect(rowsTsv(content, visible, [0])).toBe("id\tname\tmeta\n1\tAnn\t");
    expect(selectionTsv(content, visible, { x: 0, y: 0, width: 3, height: 1 }, true)).toBe(
      "id\tname\tmeta\n1\tAnn\t",
    );
  });

  it("maps selections and positions", () => {
    const visible = visibleColumns(content.columns, new Set([0]));
    expect(toGridSelection([1, 1], [], visible)).toEqual({
      rows: [1],
      focused: { row: 1, column: 2 },
      range: null,
    });
    expect(toGridSelection([0, 0], [], visible, { x: 0, y: 0, width: 2, height: 2 }).range).toEqual({
      rowStart: 0,
      rowEnd: 2,
      columns: [1, 2],
    });
    expect(toGridSelection(undefined, [0, 1], visible)).toEqual({ rows: [0, 1], focused: null, range: null });
    const none = { rows: [1], focused: null, range: null };
    expect(sameSelection(none, { ...none })).toBe(true);
    expect(sameSelection({ ...none, focused: { row: 0, column: 0 } }, none)).toBe(false);
    expect(sameSelection({ ...none, range: { rowStart: 0, rowEnd: 1, columns: [0] } }, none)).toBe(false);
    expect(selectedCells({ ...none, range: { rowStart: 0, rowEnd: 2, columns: [2] } }, 3)).toEqual([
      { row: 0, column: 2 },
      { row: 1, column: 2 },
    ]);
    expect(selectedCells({ rows: [0, 1], focused: null, range: null }, 2)).toHaveLength(4);
    expect(selectedCells(none, 2)).toEqual([]);
    expect(clampPosition({ col: 5, row: -1 }, 2, 3)).toEqual({ col: 2, row: 0 });
    expect(clampPosition({ col: 0, row: 0 }, 0, 3)).toBeNull();
    expect(movePosition({ col: 0, row: 0 }, -1, 1, 2, 3)).toEqual({ col: 0, row: 1 });
  });

  it("builds the Glide theme from tokens", () => {
    const { theme, palette } = buildGridTheme(
      (name) => (name === "--accent" ? "#123456" : readToken(name)),
      13,
    );
    expect(theme.accentColor).toBe("#123456");
    expect(theme.bgCell).toBe("#ffffff");
    expect(palette.fg).toBe("#1c1c1e");
    expect(theme.baseFontStyle).toBe("13px");
  });
});

describe("json cells", () => {
  const jsonCell = {
    text: "{ a: 1 }",
    raw: '{"a":1}',
    isNull: false,
    isModified: false,
    isDefault: false,
    json: [{ kind: "punct" as const, text: "{ a: 1 }" }],
    boolean: null,
    rich: null,
  };
  const plainCell = content.rows[1]!.cells[1]!;

  it("opens the viewer for JSON cells that cannot be edited", () => {
    expect(activationFor(content.columns[1]!, content.rows[0], jsonCell, true)).toBe("view");
    expect(activationFor(content.columns[1]!, content.rows[0], plainCell, true)).toBe("none");
    expect(activationFor(content.columns[1]!, content.rows[0], jsonCell, false)).toBe("large");
    expect(activationFor(content.columns[1]!, content.rows[0], plainCell, false)).toBe("inline");
    expect(activationFor(content.columns[1]!, content.rows[1], jsonCell, false)).toBe("none");
  });

  it("toggles editable booleans and views read-only ones", () => {
    const flag = { ...plainCell, raw: "true", text: "TRUE", boolean: true };
    const booleanColumn = column(4, "active", { kind: "boolean" });
    expect(activationFor(booleanColumn, content.rows[0], flag, false)).toBe("toggle");
    expect(activationFor(booleanColumn, content.rows[0], flag, true)).toBe("none");
    expect(activationFor(booleanColumn, content.rows[0], { ...flag, boolean: null }, false)).toBe("inline");
    const { palette } = buildGridTheme((name) => readToken(name), 13);
    expect(booleanColor(true, palette)).toBe("#2f9e63");
    expect(booleanColor(false, palette)).toBe("#e5484d");
  });

  it("lays segments out and cuts the overflow with an ellipsis", () => {
    const measure = (text: string) => text.length * 10;
    const segments = [
      { kind: "punct" as const, text: "{ " },
      { kind: "key" as const, text: "name" },
      { kind: "punct" as const, text: ": " },
      { kind: "string" as const, text: '"Ann"' },
      { kind: "punct" as const, text: " }" },
    ];
    expect(layoutSegments(segments, measure, 1000).map((s) => s.x)).toEqual([0, 20, 60, 80, 130]);
    const cut = layoutSegments(segments, measure, 100);
    expect(cut.map((s) => s.text)).toEqual(["{ ", "name", ": ", '"', "…"]);
    expect(cut.at(-1)?.x).toBe(90);
    expect(layoutSegments(segments, measure, 15).map((s) => s.text)).toEqual(["…"]);
  });

  it("colours segments from the palette", () => {
    const { palette } = buildGridTheme((name) => readToken(name), 13);
    expect(segmentColor("string", palette, palette.fg)).toBe("#1a7f4b");
    expect(segmentColor("punct", palette, palette.fg)).toBe(palette.fgMuted);
    expect(segmentColor("punct", palette, "#999")).toBe("#999");
  });
});
