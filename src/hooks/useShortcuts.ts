import { useEffect } from "react";

import { modKey } from "@/lib/platform";
import { explainQuery, runQuery } from "@/state/actions/queryTab";
import { addRow, commitChanges, discardChanges, loadTable, toggleFilterBar } from "@/state/actions/tableTab";
import {
  closeTab,
  openQuery,
  selectTabByNumber,
  selectTabByOffset,
  tabHasUnsavedWork,
} from "@/state/actions/workspace";
import { getState, mutate, openDialog } from "@/state/store";
import { useSettings } from "@/state/settings";

/** Global keyboard shortcuts. Editor-local ones (Cmd+Enter) are handled by the editor itself. */
export function useShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!modKey(event)) return;
      const key = event.key.toLowerCase();
      const state = getState();
      const active = state.tabs.find((t) => t.id === state.activeTabId);
      const inEditor = (event.target as HTMLElement | null)?.closest(".cm-editor") !== null;

      const handled = (() => {
        if (key === "t" && !event.shiftKey) return openQuery() !== null;
        if (key === "w" && !event.shiftKey && active) {
          if (tabHasUnsavedWork(active)) openDialog({ kind: "commit", tabId: active.id });
          else void closeTab(active.id);
          return true;
        }
        if (key === "n" && event.shiftKey) {
          openDialog({ kind: "connection", profileId: null });
          return true;
        }
        if (key === ",") {
          openDialog({ kind: "settings" });
          return true;
        }
        if (key === "]" && event.shiftKey) {
          selectTabByOffset(1);
          return true;
        }
        if (key === "[" && event.shiftKey) {
          selectTabByOffset(-1);
          return true;
        }
        if (/^[1-9]$/.test(key) && !event.shiftKey && !inEditor) {
          selectTabByNumber(Number(key));
          return true;
        }
        if (key === "i" && event.altKey) {
          mutate((draft) => {
            draft.inspectorOpen = !draft.inspectorOpen;
          });
          return true;
        }
        if (key === "b" && !event.shiftKey && !inEditor) {
          mutate((draft) => {
            draft.sidebarOpen = !draft.sidebarOpen;
          });
          return true;
        }
        if (!active) return false;
        if (active.kind === "table") {
          if (key === "r") {
            void loadTable(active.id);
            return true;
          }
          if (key === "s") {
            if (useSettings.getState().settings.confirmBeforeCommit) {
              openDialog({ kind: "commit", tabId: active.id });
            } else void commitChanges(active.id);
            return true;
          }
          if (key === "z" && event.altKey) {
            discardChanges(active.id);
            return true;
          }
          if (key === "n" && event.altKey) {
            addRow(active.id);
            return true;
          }
          if (key === "f" && event.shiftKey) {
            toggleFilterBar(active.id);
            return true;
          }
          if (key === "e" && event.shiftKey) {
            openDialog({ kind: "export", tabId: active.id });
            return true;
          }
        }
        if (active.kind === "query") {
          if (key === "enter" && !inEditor) {
            void runQuery(active.id, event.shiftKey ? "all" : "current");
            return true;
          }
          if (key === "e" && event.altKey) {
            void explainQuery(active.id, event.shiftKey);
            return true;
          }
          if (key === "e" && event.shiftKey) {
            openDialog({ kind: "export", tabId: active.id });
            return true;
          }
        }
        return false;
      })();

      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
