import { describe, expect, it } from "vitest";

import { buildGridTheme, readToken } from "./gridTheme";
import {
  cellCopyText,
  cellDisplayText,
  cellStyle,
  clampPosition,
  defaultColumnWidth,
  editModeFor,
  headerTitle,
  movePosition,
  rowHeightFor,
  rowsTsv,
  sameSelection,
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
        { text: "1", raw: "1", isNull: false, isModified: false, isDefault: false },
        { text: "Ann", raw: "Ann", isNull: false, isModified: true, isDefault: false },
        { text: "NULL", raw: null, isNull: true, isModified: false, isDefault: false },
      ],
      state: "normal",
    },
    {
      cells: [
        { text: "2", raw: "2", isNull: false, isModified: false, isDefault: false },
        { text: "Bob", raw: "Bob", isNull: false, isModified: false, isDefault: false },
        { text: "{}", raw: "{}", isNull: false, isModified: false, isDefault: false },
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
    expect(toGridSelection([1, 1], [], visible)).toEqual({ rows: [1], focused: { row: 1, column: 2 } });
    expect(toGridSelection(undefined, [0, 1], visible)).toEqual({ rows: [0, 1], focused: null });
    expect(sameSelection({ rows: [1], focused: null }, { rows: [1], focused: null })).toBe(true);
    expect(sameSelection({ rows: [1], focused: { row: 0, column: 0 } }, { rows: [1], focused: null })).toBe(
      false,
    );
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
