// Mounted SQL editors by query tab, so commands (formatting) can edit through the editor and keep
// its undo history.

import type { SqlEditorHandle } from "./types";

const editors = new Map<string, SqlEditorHandle>();

export function registerEditor(tabId: string, handle: SqlEditorHandle): () => void {
  editors.set(tabId, handle);
  return () => {
    if (editors.get(tabId) === handle) editors.delete(tabId);
  };
}

export function editorFor(tabId: string): SqlEditorHandle | undefined {
  return editors.get(tabId);
}
