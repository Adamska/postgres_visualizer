// Custom Glide cell that draws booleans as coloured TRUE / FALSE labels.

import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";

import { booleanLabel } from "@/core/format/values";

import type { GridPalette } from "./gridTheme";

export interface BooleanCellData {
  kind: "boolean-badge";
  raw: string;
  value: boolean;
}

export type BooleanGridCell = CustomCell<BooleanCellData>;

export function isBooleanGridCell(cell: CustomCell): cell is BooleanGridCell {
  return (cell.data as Partial<BooleanCellData>).kind === "boolean-badge";
}

/** TRUE reads as green, FALSE as red, the way state indicators usually do. */
export function booleanColor(value: boolean, palette: GridPalette): string {
  return value ? palette.success : palette.danger;
}

/** Renderer for boolean cells; the palette supplies the two colours. */
export function booleanCellRenderer(palette: GridPalette): CustomRenderer<BooleanGridCell> {
  return {
    kind: GridCellKind.Custom,
    isMatch: isBooleanGridCell,
    needsHover: false,
    draw: (args, cell) => {
      const { ctx, theme, rect } = args;
      ctx.save();
      ctx.font = `600 ${theme.baseFontStyle} ${theme.fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = booleanColor(cell.data.value, palette);
      ctx.fillText(
        booleanLabel(cell.data.value),
        rect.x + theme.cellHorizontalPadding,
        rect.y + rect.height / 2 + 1,
      );
      ctx.restore();
    },
    onPaste: (value, data) => ({ ...data, raw: value }),
  };
}
