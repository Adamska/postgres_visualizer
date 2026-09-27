// Contract for the SQL editor component.

import type { Completion } from "@/core/completion/engine";

export type RunScope = "current" | "all";

export interface EditorErrorMarker {
  /** UTF-16 offset into the document. */
  from: number;
  /** UTF-16 offset (exclusive). */
  to: number;
  message: string;
}

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Caret / selection as UTF-16 offsets. */
  selection?: { anchor: number; head: number };
  onSelectionChange?: (selection: { anchor: number; head: number }) => void;
  /** Provides schema-aware completions; `qualifier` is the identifier before a dot, if any. */
  completionProvider?: (prefix: string, qualifier: string | null) => Completion[];
  errorMarker?: EditorErrorMarker | null;
  fontSize?: number;
  readOnly?: boolean;
  /** Cmd+Enter → "current"; Cmd+Shift+Enter → "all". */
  onRun?: (scope: RunScope) => void;
  /** Cmd+S. */
  onSave?: () => void;
  theme?: "light" | "dark";
  autoFocus?: boolean;
  className?: string;
}

/** Imperative handle exposed by the editor. */
export interface SqlEditorHandle {
  focus(): void;
  /** Replaces the current selection (or inserts at the caret). */
  insertText(text: string): void;
  getSelection(): { anchor: number; head: number };
  /** Replaces a range of the document (undoable) and selects the new text. */
  replaceRange(from: number, to: number, text: string): void;
}
