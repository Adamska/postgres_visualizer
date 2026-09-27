// Custom Glide cell for values with a richer rendering: timestamps with a relative hint,
// colour-tagged UUIDs, enum pills, array chips, colour swatches, grouped numbers and image links.
// Editable cells get a plain text editor on the raw value.

import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";

import type { RichValue } from "@/core/format/rich";
import { relativeTime } from "@/core/format/temporal";

import type { GridPalette } from "./gridTheme";
import { RichCellEditor } from "./RichCellEditor";

export interface RichCellData {
  kind: "rich-value";
  raw: string;
  value: RichValue;
}

export type RichGridCell = CustomCell<RichCellData>;

export function isRichGridCell(cell: CustomCell): cell is RichGridCell {
  return (cell.data as Partial<RichCellData>).kind === "rich-value";
}

/** Colours for a hue-tagged value (enum pill, UUID dot), readable on the current surface. */
export function hueColors(hue: number, dark: boolean): { fill: string; text: string; dot: string } {
  return {
    fill: `hsla(${hue}, 70%, ${dark ? 55 : 50}%, ${dark ? 0.22 : 0.14})`,
    text: `hsl(${hue}, ${dark ? 75 : 60}%, ${dark ? 74 : 32}%)`,
    dot: `hsl(${hue}, 65%, ${dark ? 62 : 48}%)`,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws `text` cut with an ellipsis to fit `maxWidth`; returns the drawn width. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): number {
  if (maxWidth <= 0) return 0;
  let shown = text;
  if (ctx.measureText(shown).width > maxWidth) {
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (ctx.measureText(`${text.slice(0, middle)}…`).width <= maxWidth) low = middle;
      else high = middle - 1;
    }
    shown = `${text.slice(0, low)}…`;
  }
  ctx.fillText(shown, x, y);
  return ctx.measureText(shown).width;
}

/** Renderer for rich cells; the palette supplies the colours. */
export function richCellRenderer(palette: GridPalette): CustomRenderer<RichGridCell> {
  return {
    kind: GridCellKind.Custom,
    isMatch: isRichGridCell,
    needsHover: false,
    draw: (args, cell) => {
      const { ctx, theme, rect } = args;
      const value = cell.data.value;
      const padding = theme.cellHorizontalPadding;
      const left = rect.x + padding;
      const right = rect.x + rect.width - padding;
      const middle = rect.y + rect.height / 2 + 1;
      const font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.textDark;
      switch (value.kind) {
        case "timestamp": {
          const width = fitText(ctx, value.text, left, middle, right - left);
          const hint = `· ${relativeTime(value.time, Date.now())}`;
          const hintX = left + width + 6;
          if (hintX + ctx.measureText(hint).width <= right) {
            ctx.fillStyle = palette.fgSubtle;
            ctx.fillText(hint, hintX, middle);
          }
          break;
        }
        case "uuid": {
          const colors = hueColors(value.hue, palette.dark);
          ctx.fillStyle = colors.dot;
          ctx.beginPath();
          ctx.arc(left + 3.5, middle - 1, 3.5, 0, Math.PI * 2);
          ctx.fill();
          const start = left + 12;
          const head = value.text.slice(0, 8);
          ctx.fillStyle = theme.textDark;
          const headWidth = fitText(ctx, head, start, middle, right - start);
          ctx.fillStyle = palette.fgSubtle;
          fitText(ctx, value.text.slice(8), start + headWidth, middle, right - start - headWidth);
          break;
        }
        case "enum": {
          const colors = hueColors(value.hue, palette.dark);
          ctx.font = `600 ${Math.max(10, Number.parseInt(theme.baseFontStyle, 10) - 2)}px ${palette.fontSans}`;
          const textWidth = Math.min(ctx.measureText(value.text).width, right - left - 14);
          const height = Math.min(20, rect.height - 8);
          roundedRect(ctx, left, middle - height / 2 - 1, textWidth + 14, height, height / 2);
          ctx.fillStyle = colors.fill;
          ctx.fill();
          ctx.fillStyle = colors.text;
          fitText(ctx, value.text, left + 7, middle, textWidth);
          break;
        }
        case "array": {
          ctx.font = `${Math.max(10, Number.parseInt(theme.baseFontStyle, 10) - 1)}px ${theme.fontFamily}`;
          const height = Math.min(20, rect.height - 8);
          let x = left;
          if (value.items.length === 0) {
            ctx.fillStyle = palette.fgSubtle;
            ctx.fillText("empty", x, middle);
            break;
          }
          for (let i = 0; i < value.items.length; i++) {
            const item = value.items[i] ?? null;
            const label = item ?? "NULL";
            const width = ctx.measureText(label).width + 12;
            const rest = value.items.length - i;
            const moreWidth = rest > 1 ? ctx.measureText(`+${rest - 1}`).width + 6 : 0;
            if (x + width + moreWidth > right && i > 0) {
              ctx.fillStyle = palette.fgMuted;
              ctx.fillText(`+${rest}`, x, middle);
              break;
            }
            roundedRect(ctx, x, middle - height / 2 - 1, Math.min(width, right - x), height, 5);
            ctx.fillStyle = palette.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
            ctx.fill();
            ctx.fillStyle = item === null ? palette.fgSubtle : theme.textDark;
            fitText(ctx, label, x + 6, middle, Math.min(width, right - x) - 12);
            x += width + 4;
          }
          break;
        }
        case "color": {
          const size = 12;
          roundedRect(ctx, left, middle - size / 2 - 1, size, size, 3);
          ctx.fillStyle = value.color;
          ctx.fill();
          ctx.strokeStyle = palette.line;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = theme.textDark;
          fitText(ctx, value.text, left + size + 6, middle, right - left - size - 6);
          break;
        }
        case "number": {
          ctx.textAlign = "right";
          ctx.fillText(value.text, right, middle);
          break;
        }
        case "image": {
          // A small picture glyph, then the link.
          ctx.strokeStyle = palette.accent;
          ctx.lineWidth = 1.2;
          roundedRect(ctx, left, middle - 6, 13, 11, 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(left + 2, middle + 3);
          ctx.lineTo(left + 5.5, middle - 1);
          ctx.lineTo(left + 8, middle + 1.5);
          ctx.lineTo(left + 9.5, middle);
          ctx.lineTo(left + 11.5, middle + 3);
          ctx.stroke();
          ctx.fillStyle = palette.accent;
          fitText(ctx, value.text, left + 19, middle, right - left - 19);
          break;
        }
      }
      ctx.restore();
    },
    provideEditor: () => ({ editor: RichCellEditor, disablePadding: true }),
    onPaste: (value, data) => ({ ...data, raw: value }),
  };
}
