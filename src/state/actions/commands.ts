// App-wide commands, reachable from the native menu bar and from keyboard shortcuts.

import { explainQuery, runQuery } from "./queryTab";
import { addRow, commitChanges, discardChanges, loadTable, toggleFilterBar } from "./tableTab";
import { closeTab, openQuery, selectTabByOffset, tabHasUnsavedWork } from "./workspace";
import { useSettings } from "../settings";
import { getState, mutate, openDialog } from "../store";

export const COMMAND_IDS = [
  "settings",
  "connection.new",
  "query.new",
  "sqlFile",
  "export",
  "tab.close",
  "tab.next",
  "tab.previous",
  "view.sidebar",
  "view.inspector",
  "table.refresh",
  "table.filter",
  "table.addRow",
  "table.commit",
  "table.discard",
  "query.run",
  "query.runAll",
  "query.explain",
  "query.explainAnalyze",
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: string): value is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(value);
}

/**
 * Executes a command against the current state. Returns whether it applied, so a keyboard
 * handler knows whether to swallow the key.
 */
export function runCommand(id: CommandId): boolean {
  const state = getState();
  const active = state.tabs.find((t) => t.id === state.activeTabId);
  switch (id) {
    case "settings":
      openDialog({ kind: "settings" });
      return true;
    case "connection.new":
      openDialog({ kind: "connection", profileId: null });
      return true;
    case "query.new":
      return openQuery() !== null;
    case "sqlFile":
      if (state.activeConnectionId === null) return false;
      openDialog({ kind: "runSqlFile", connectionId: state.activeConnectionId });
      return true;
    case "export":
      if (active?.kind !== "table" && active?.kind !== "query") return false;
      openDialog({ kind: "export", tabId: active.id });
      return true;
    case "tab.close":
      if (!active) return false;
      if (tabHasUnsavedWork(active)) openDialog({ kind: "commit", tabId: active.id });
      else void closeTab(active.id);
      return true;
    case "tab.next":
      selectTabByOffset(1);
      return true;
    case "tab.previous":
      selectTabByOffset(-1);
      return true;
    case "view.sidebar":
      mutate((draft) => {
        draft.sidebarOpen = !draft.sidebarOpen;
      });
      return true;
    case "view.inspector":
      mutate((draft) => {
        draft.inspectorOpen = !draft.inspectorOpen;
      });
      return true;
    case "table.refresh":
      if (active?.kind !== "table") return false;
      void loadTable(active.id);
      return true;
    case "table.filter":
      if (active?.kind !== "table") return false;
      toggleFilterBar(active.id);
      return true;
    case "table.addRow":
      if (active?.kind !== "table") return false;
      addRow(active.id);
      return true;
    case "table.commit":
      if (active?.kind !== "table") return false;
      if (useSettings.getState().settings.confirmBeforeCommit) {
        openDialog({ kind: "commit", tabId: active.id });
      } else {
        void commitChanges(active.id);
      }
      return true;
    case "table.discard":
      if (active?.kind !== "table") return false;
      discardChanges(active.id);
      return true;
    case "query.run":
      // On a table tab the same key opens the focused cell instead.
      if (active?.kind === "table") {
        const focused = active.selection.focused;
        if (!focused) return false;
        openDialog({ kind: "valueEditor", tabId: active.id, row: focused.row, column: focused.column });
        return true;
      }
      if (active?.kind !== "query") return false;
      void runQuery(active.id, "current");
      return true;
    case "query.runAll":
      if (active?.kind !== "query") return false;
      void runQuery(active.id, "all");
      return true;
    case "query.explain":
      if (active?.kind !== "query") return false;
      void explainQuery(active.id, false);
      return true;
    case "query.explainAnalyze":
      if (active?.kind !== "query") return false;
      void explainQuery(active.id, true);
      return true;
  }
}
