// Light and dark CodeMirror themes derived from the design tokens in `src/design/tokens.css`.

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export type EditorThemeMode = "light" | "dark";

/** Default font size in pixels. */
export const DEFAULT_FONT_SIZE = 13;

interface Palette {
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentSoft: string;
  danger: string;
  /** Keywords and parameters. */
  purple: string;
  /** Numbers. */
  blue: string;
  /** Quoted identifiers. */
  teal: string;
  /** Types and builtins. */
  amber: string;
}

/** Token values from `tokens.css`, used when the CSS variables are not available (e.g. in tests). */
const FALLBACK: Record<EditorThemeMode, Palette> = {
  light: {
    fg: "#1c1c1e",
    fgMuted: "#6e6e73",
    fgSubtle: "#a1a1a6",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfaceSunken: "#f0f0f3",
    line: "rgb(0 0 0 / 0.08)",
    lineStrong: "rgb(0 0 0 / 0.16)",
    accent: "#4f6bff",
    accentSoft: "rgb(79 107 255 / 0.12)",
    danger: "#e5484d",
    purple: "#7c3aed",
    blue: "#0b62d6",
    teal: "#0f766e",
    amber: "#b45309",
  },
  dark: {
    fg: "#f2f2f4",
    fgMuted: "#9c9ca3",
    fgSubtle: "#6a6a72",
    surface: "#1e1e21",
    surfaceRaised: "#26262a",
    surfaceSunken: "#121214",
    line: "rgb(255 255 255 / 0.08)",
    lineStrong: "rgb(255 255 255 / 0.16)",
    accent: "#6d84ff",
    accentSoft: "rgb(109 132 255 / 0.18)",
    danger: "#ff6369",
    purple: "#b794f6",
    blue: "#6cb6ff",
    teal: "#5eead4",
    amber: "#f5b352",
  },
};

const TOKEN_VARIABLES: Partial<Record<keyof Palette, string>> = {
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgSubtle: "--fg-subtle",
  surface: "--surface",
  surfaceRaised: "--surface-raised",
  surfaceSunken: "--surface-sunken",
  line: "--line",
  lineStrong: "--line-strong",
  accent: "--accent",
  accentSoft: "--accent-soft",
  danger: "--danger",
};

/** Resolves the palette from the document's CSS variables, falling back to the token defaults. */
function readPalette(mode: EditorThemeMode): Palette {
  const palette: Palette = { ...FALLBACK[mode] };
  if (typeof document === "undefined") return palette;
  const style = getComputedStyle(document.documentElement);
  for (const [key, variable] of Object.entries(TOKEN_VARIABLES) as [keyof Palette, string][]) {
    const value = style.getPropertyValue(variable).trim();
    if (value !== "") palette[key] = value;
  }
  return palette;
}

function highlightStyle(p: Palette): HighlightStyle {
  return HighlightStyle.define([
    { tag: tags.keyword, color: p.purple, fontWeight: "500" },
    { tag: [tags.bool, tags.null], color: p.purple },
    { tag: tags.string, color: p.danger },
    { tag: tags.number, color: p.blue },
    { tag: [tags.lineComment, tags.blockComment], color: p.fgMuted, fontStyle: "italic" },
    { tag: tags.special(tags.string), color: p.teal },
    { tag: tags.special(tags.name), color: p.purple },
    { tag: tags.typeName, color: p.amber },
    { tag: tags.standard(tags.name), color: p.blue },
    { tag: tags.operator, color: p.fgMuted },
    { tag: [tags.punctuation, tags.paren, tags.brace, tags.squareBracket], color: p.fg },
    { tag: tags.name, color: p.fg },
  ]);
}

function editorStyles(p: Palette, fontSize: number, dark: boolean): Extension {
  const popup = {
    backgroundColor: p.surfaceRaised,
    border: `1px solid ${p.lineStrong}`,
    borderRadius: "8px",
    boxShadow: "0 10px 30px -10px rgb(0 0 0 / 0.35), 0 1px 3px rgb(0 0 0 / 0.12)",
  };
  const control = {
    font: "inherit",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    color: p.fg,
    backgroundColor: p.surface,
    border: `1px solid ${p.lineStrong}`,
    borderRadius: "6px",
    padding: "2px 8px",
    margin: "0 4px 0 0",
  };
  return EditorView.theme(
    {
      "&": { height: "100%", color: p.fg, backgroundColor: p.surface, fontSize: `${fontSize}px` },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55", overflow: "auto" },
      ".cm-content": { padding: "8px 0", caretColor: p.fg },
      ".cm-line": { padding: "0 8px" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: p.fg, borderLeftWidth: "2px" },
      ".cm-activeLine": { backgroundColor: dark ? "rgb(255 255 255 / 0.035)" : "rgb(0 0 0 / 0.03)" },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: p.fgMuted },
      ".cm-gutters": {
        backgroundColor: p.surface,
        color: p.fgSubtle,
        border: "none",
        paddingLeft: "8px",
        minWidth: "3ch",
      },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 4px" },
      ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: p.accentSoft,
      },
      "&.cm-focused .cm-selectionBackground": { backgroundColor: p.accentSoft },
      ".cm-selectionMatch": { backgroundColor: p.accentSoft, outline: `1px solid ${p.accentSoft}` },
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor: "transparent",
        textDecoration: `underline ${p.accent}`,
        textUnderlineOffset: "2px",
      },
      ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
        backgroundColor: "transparent",
        textDecoration: `underline wavy ${p.danger}`,
      },
      ".cm-errorMarker": {
        textDecoration: `underline wavy ${p.danger}`,
        textDecorationSkipInk: "none",
        textUnderlineOffset: "3px",
      },
      ".cm-specialChar": { color: p.danger },
      ".cm-tooltip": { ...popup, fontFamily: "var(--font-sans)", color: p.fg },
      ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--font-mono)",
        fontSize: `${Math.max(11, fontSize - 1)}px`,
        maxHeight: "18em",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", borderRadius: "5px" },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: p.accent,
        color: "#ffffff",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
        color: "rgb(255 255 255 / 0.8)",
      },
      ".cm-completionIcon": { opacity: "0.7", width: "1.2em" },
      ".cm-completionDetail": { color: p.fgMuted, fontStyle: "normal", marginLeft: "0.75em" },
      ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "600" },
      ".cm-panels": { backgroundColor: p.surfaceSunken, color: p.fg, fontFamily: "var(--font-sans)" },
      ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${p.line}` },
      ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${p.line}` },
      ".cm-panel.cm-search": { padding: "6px 8px", fontSize: "12px" },
      ".cm-panel.cm-search label": { fontSize: "12px", color: p.fgMuted, marginRight: "6px" },
      ".cm-panel.cm-search input[type=checkbox]": { accentColor: p.accent, marginRight: "3px" },
      ".cm-panel.cm-search .cm-textfield": { ...control, height: "24px", fontFamily: "var(--font-mono)" },
      ".cm-panel.cm-search .cm-textfield:focus": {
        outline: "none",
        borderColor: p.accent,
        boxShadow: `0 0 0 2px ${p.accentSoft}`,
      },
      ".cm-panel.cm-search .cm-button": { ...control, backgroundImage: "none", cursor: "default" },
      ".cm-panel.cm-search .cm-button:active": { backgroundColor: p.surfaceSunken, backgroundImage: "none" },
      ".cm-panel.cm-search [name=close]": { color: p.fgMuted, fontSize: "16px", right: "6px", top: "4px" },
      ".cm-searchMatch": { backgroundColor: "rgb(224 138 30 / 0.28)", borderRadius: "2px" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgb(224 138 30 / 0.5)" },
      ".cm-placeholder": { color: p.fgSubtle },
    },
    { dark },
  );
}

/**
 * Builds the editor theme for `mode`, reading the design tokens from the document at call time.
 * Recreate it (and reconfigure the compartment) when the theme or the font size changes.
 */
export function createEditorTheme(mode: EditorThemeMode, fontSize: number = DEFAULT_FONT_SIZE): Extension {
  const palette = readPalette(mode);
  return [editorStyles(palette, fontSize, mode === "dark"), syntaxHighlighting(highlightStyle(palette))];
}
