// Keyboard shortcuts. In the desktop app most of these are also menu accelerators, which macOS
// routes through the menu (see `src/lib/menu.ts`); this handler covers the browser preview and
// the few keys the menu does not own, such as ⌘1–9.

import { useEffect } from "react";

import { modKey } from "@/lib/platform";
import { runCommand, type CommandId } from "@/state/actions/commands";
import { selectTabByNumber } from "@/state/actions/workspace";

interface Shortcut {
  key: string;
  shift?: boolean;
  alt?: boolean;
  command: CommandId;
  /** Skip when the SQL editor has focus (it owns the key). */
  notInEditor?: boolean;
}

const SHORTCUTS: Shortcut[] = [
  { key: ",", command: "settings" },
  { key: "n", shift: true, command: "connection.new" },
  { key: "t", command: "query.new" },
  { key: "w", command: "tab.close" },
  { key: "e", shift: true, command: "export" },
  { key: "]", shift: true, command: "tab.next" },
  { key: "[", shift: true, command: "tab.previous" },
  { key: "b", command: "view.sidebar", notInEditor: true },
  { key: "i", alt: true, command: "view.inspector" },
  { key: "r", command: "table.refresh" },
  { key: "f", shift: true, command: "table.filter" },
  { key: "n", alt: true, command: "table.addRow" },
  { key: "s", command: "table.commit" },
  { key: "z", alt: true, command: "table.discard" },
  { key: "enter", command: "query.run", notInEditor: true },
  { key: "enter", shift: true, command: "query.runAll", notInEditor: true },
  { key: "e", alt: true, command: "query.explain" },
  { key: "e", alt: true, shift: true, command: "query.explainAnalyze" },
];

/** The command bound to a key event, if any. Exported for tests. */
export function shortcutFor(
  event: { key: string; shiftKey: boolean; altKey: boolean },
  inEditor: boolean,
): CommandId | null {
  const key = event.key.toLowerCase();
  const match = SHORTCUTS.find(
    (s) =>
      s.key === key &&
      (s.shift ?? false) === event.shiftKey &&
      (s.alt ?? false) === event.altKey &&
      !(s.notInEditor && inEditor),
  );
  return match?.command ?? null;
}

export function useShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!modKey(event)) return;
      const inEditor = (event.target as HTMLElement | null)?.closest(".cm-editor") !== null;
      if (/^[1-9]$/.test(event.key) && !event.shiftKey && !event.altKey && !inEditor) {
        selectTabByNumber(Number(event.key));
        event.preventDefault();
        return;
      }
      const command = shortcutFor(event, inEditor);
      if (command !== null && runCommand(command)) event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
