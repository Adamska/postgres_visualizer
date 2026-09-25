// Keymap and baseline editing extensions for the SQL editor.

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleLineComment,
} from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap, search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";

import type { RunScope } from "./types";

/** Callbacks the editor keymap dispatches to; read at key time so the latest props are used. */
export interface EditorCommandHandlers {
  onRun?: (scope: RunScope) => void;
  onSave?: () => void;
}

/** Holder for the handlers, updated by the component on every render. */
export interface EditorCommandHandlersRef {
  current: EditorCommandHandlers;
}

/**
 * App shortcuts, bound before the default keymap so they win:
 * Mod+Enter runs the current statement, Mod+Shift+Enter the whole script, Mod+S saves,
 * Mod+/ toggles `--` comments, Tab / Shift+Tab indent and outdent.
 */
export function editorKeymap(handlers: EditorCommandHandlersRef): Extension {
  return keymap.of([
    {
      key: "Mod-Enter",
      run: () => {
        handlers.current.onRun?.("current");
        return true;
      },
    },
    {
      key: "Mod-Shift-Enter",
      run: () => {
        handlers.current.onRun?.("all");
        return true;
      },
    },
    {
      key: "Mod-s",
      run: () => {
        handlers.current.onSave?.();
        return true;
      },
    },
    { key: "Mod-/", run: toggleLineComment },
    indentWithTab,
  ]);
}

/** Standard editing behaviour: history, brackets, selections, gutters, search and the default keys. */
export function baseExtensions(): Extension {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap]),
  ];
}
