// Maps the CSS design tokens to Glide's canvas theme and keeps it in sync with the app theme.

import type { Theme } from "@glideapps/glide-data-grid";
import { useEffect, useState } from "react";

import type { CellStyle } from "./gridModel";
import type { GridRowState } from "./types";

/** Token values the grid needs beyond Glide's own theme, for row and cell tints. */
export interface GridPalette {
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  accentSoft: string;
  dangerSoft: string;
  successSoft: string;
  fontSans: string;
  fontMono: string;
  syntaxKey: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxBoolean: string;
  success: string;
  danger: string;
}

/** A realised grid theme: Glide's theme plus the palette used for per-cell overrides. */
export interface GridTheme {
  theme: Partial<Theme>;
  palette: GridPalette;
}

const FALLBACKS: Record<string, string> = {
  "--surface": "#ffffff",
  "--surface-raised": "#ffffff",
  "--surface-sunken": "#f0f0f3",
  "--line": "rgb(0 0 0 / 0.08)",
  "--line-strong": "rgb(0 0 0 / 0.16)",
  "--fg": "#1c1c1e",
  "--fg-muted": "#6e6e73",
  "--fg-subtle": "#a1a1a6",
  "--accent": "#4f6bff",
  "--accent-fg": "#ffffff",
  "--accent-soft": "rgb(79 107 255 / 0.12)",
  "--danger-soft": "rgb(229 72 77 / 0.12)",
  "--success-soft": "rgb(47 158 99 / 0.14)",
  "--warning-soft": "rgb(224 138 30 / 0.16)",
  "--font-sans": "-apple-system, BlinkMacSystemFont, sans-serif",
  "--font-mono": "Menlo, monospace",
  "--syntax-key": "#3d3d45",
  "--syntax-string": "#1a7f4b",
  "--syntax-number": "#1d5bd6",
  "--syntax-boolean": "#8b3fc7",
  "--success": "#2f9e63",
  "--danger": "#e5484d",
};

/** Reads one custom property from `<html>`, falling back to the light-theme value. */
export function readToken(name: string, styles?: CSSStyleDeclaration): string {
  const value = styles?.getPropertyValue(name).trim() ?? "";
  return value !== "" ? value : (FALLBACKS[name] ?? "");
}

/** Builds the Glide theme and palette from a token lookup; pure so it can be tested. */
export function buildGridTheme(token: (name: string) => string, fontSize: number): GridTheme {
  const palette: GridPalette = {
    fg: token("--fg"),
    fgMuted: token("--fg-muted"),
    fgSubtle: token("--fg-subtle"),
    accentSoft: token("--accent-soft"),
    dangerSoft: token("--danger-soft"),
    successSoft: token("--success-soft"),
    fontSans: token("--font-sans"),
    fontMono: token("--font-mono"),
    syntaxKey: token("--syntax-key"),
    syntaxString: token("--syntax-string"),
    syntaxNumber: token("--syntax-number"),
    syntaxBoolean: token("--syntax-boolean"),
    success: token("--success"),
    danger: token("--danger"),
  };
  const theme: Partial<Theme> = {
    accentColor: token("--accent"),
    accentFg: token("--accent-fg"),
    accentLight: palette.accentSoft,
    textDark: palette.fg,
    textMedium: palette.fgMuted,
    textLight: palette.fgSubtle,
    textBubble: palette.fg,
    bgIconHeader: palette.fgMuted,
    fgIconHeader: token("--surface"),
    textHeader: palette.fgMuted,
    textHeaderSelected: token("--accent-fg"),
    bgCell: token("--surface"),
    bgCellMedium: token("--surface-sunken"),
    bgHeader: token("--surface-sunken"),
    bgHeaderHasFocus: token("--surface-sunken"),
    bgHeaderHovered: token("--line"),
    bgBubble: token("--surface-sunken"),
    bgBubbleSelected: token("--surface"),
    bgSearchResult: token("--warning-soft"),
    borderColor: token("--line"),
    horizontalBorderColor: token("--line"),
    headerBottomBorderColor: token("--line-strong"),
    drilldownBorder: "rgba(0, 0, 0, 0)",
    linkColor: token("--accent"),
    resizeIndicatorColor: token("--accent"),
    cellHorizontalPadding: 8,
    cellVerticalPadding: 3,
    headerIconSize: 14,
    headerFontStyle: `500 ${Math.max(fontSize - 1, 10)}px`,
    baseFontStyle: `${fontSize}px`,
    markerFontStyle: `${Math.max(fontSize - 2, 9)}px`,
    fontFamily: palette.fontSans,
    editorFontSize: `${fontSize}px`,
    lineHeight: 1.4,
  };
  return { theme, palette };
}

/** Reads the current tokens from the document. */
export function readGridTheme(fontSize: number): GridTheme {
  const styles = typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement);
  return buildGridTheme((name) => readToken(name, styles), fontSize);
}

/** Grid theme that re-reads the tokens whenever `<html data-theme>` changes. */
export function useGridTheme(fontSize: number): GridTheme {
  const [gridTheme, setGridTheme] = useState(() => readGridTheme(fontSize));

  useEffect(() => {
    setGridTheme(readGridTheme(fontSize));
    const observer = new MutationObserver(() => setGridTheme(readGridTheme(fontSize)));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, [fontSize]);

  return gridTheme;
}

/** Per-cell theme overrides, one shared object per style so `getCellContent` stays cheap. */
export type CellThemes = Record<CellStyle, Partial<Theme> | undefined>;

export function buildCellThemes(palette: GridPalette, fontSize: number): CellThemes {
  const mono: Partial<Theme> = { fontFamily: palette.fontMono };
  const placeholder: Partial<Theme> = {
    ...mono,
    textDark: palette.fgSubtle,
    baseFontStyle: `italic ${fontSize}px`,
  };
  return {
    normal: mono,
    null: placeholder,
    default: placeholder,
    modified: { ...mono, bgCell: palette.accentSoft },
    deleted: { ...mono, textDark: palette.fgMuted },
    inserted: mono,
  };
}

/** Row-level tints, one shared object per row state. */
export type RowThemes = Record<GridRowState, Partial<Theme> | undefined>;

export function buildRowThemes(palette: GridPalette): RowThemes {
  return {
    normal: undefined,
    modified: undefined,
    inserted: { bgCell: palette.successSoft },
    deleted: { bgCell: palette.dangerSoft, textDark: palette.fgMuted, textLight: palette.fgSubtle },
  };
}
