// Custom Glide cell that draws JSON previews with per-token colours.

import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";

import type { JsonSegment, SegmentKind } from "@/core/json/preview";

import type { GridPalette } from "./gridTheme";

export interface JsonCellData {
  kind: "json-preview";
  raw: string;
  segments: JsonSegment[];
}

export type JsonGridCell = CustomCell<JsonCellData>;

export function isJsonGridCell(cell: CustomCell): cell is JsonGridCell {
  return (cell.data as Partial<JsonCellData>).kind === "json-preview";
}

/** A segment placed on a line: its text (possibly cut) and x offset from the line start. */
export interface PlacedSegment {
  kind: SegmentKind;
  text: string;
  x: number;
}

const ELLIPSIS = "…";

/**
 * Lays segments out left to right within `maxWidth`, cutting the first overflowing segment and
 * ending with an ellipsis. `measure` returns the width of a text run.
 */
export function layoutSegments(
  segments: readonly JsonSegment[],
  measure: (text: string) => number,
  maxWidth: number,
): PlacedSegment[] {
  const placed: PlacedSegment[] = [];
  const ellipsisWidth = measure(ELLIPSIS);
  let x = 0;
  for (const segment of segments) {
    const width = measure(segment.text);
    if (x + width <= maxWidth) {
      placed.push({ kind: segment.kind, text: segment.text, x });
      x += width;
      continue;
    }
    const room = maxWidth - x - ellipsisWidth;
    let cut = "";
    if (room > 0) {
      let low = 0;
      let high = segment.text.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (measure(segment.text.slice(0, middle)) <= room) low = middle;
        else high = middle - 1;
      }
      cut = segment.text.slice(0, low);
    }
    if (cut !== "") placed.push({ kind: segment.kind, text: cut, x });
    placed.push({ kind: "punct", text: ELLIPSIS, x: x + measure(cut) });
    return placed;
  }
  return placed;
}

/** Colour for a segment kind; `text` is the cell's regular text colour. */
export function segmentColor(kind: SegmentKind, palette: GridPalette, text: string): string {
  switch (kind) {
    case "key":
      return palette.syntaxKey;
    case "string":
      return palette.syntaxString;
    case "number":
      return palette.syntaxNumber;
    case "boolean":
      return palette.syntaxBoolean;
    case "null":
      return palette.fgSubtle;
    case "punct":
      return text === palette.fg ? palette.fgMuted : text;
  }
}

/** Renderer for JSON preview cells; the palette supplies the token colours. */
export function jsonCellRenderer(palette: GridPalette): CustomRenderer<JsonGridCell> {
  return {
    kind: GridCellKind.Custom,
    isMatch: isJsonGridCell,
    needsHover: false,
    draw: (args, cell) => {
      const { ctx, theme, rect } = args;
      const padding = theme.cellHorizontalPadding;
      const maxWidth = rect.width - padding * 2;
      if (maxWidth <= 0) return;
      ctx.save();
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      ctx.textBaseline = "middle";
      const placed = layoutSegments(cell.data.segments, (text) => ctx.measureText(text).width, maxWidth);
      const y = rect.y + rect.height / 2 + 1;
      for (const segment of placed) {
        ctx.fillStyle = segmentColor(segment.kind, palette, theme.textDark);
        ctx.fillText(segment.text, rect.x + padding + segment.x, y);
      }
      ctx.restore();
    },
    onPaste: (value, data) => ({ ...data, raw: value }),
  };
}
