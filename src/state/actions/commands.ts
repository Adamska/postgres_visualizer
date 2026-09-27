// App-wide commands, reachable from the native menu bar, keyboard shortcuts and the command palette.

import { explainQuery, formatQuery, pinResult, runQuery, setResultView } from "./queryTab";
import {
  addRow,
  commitChanges,
  discardChanges,
  goBack,
  goForward,
  loadTable,
  setViewMode,
  toggleFilterBar,
} from "./tableTab";
import {
  closeTab,
  openDiagram,
  openQuery,
  openServer,
  openStructure,
  selectTabByOffset,
  tabHasUnsavedWork,
} from "./workspace";
import { useSettings } from "../settings";
import { getState, mutate, openDialog, type AppState, type Tab } from "../store";

export interface CommandInfo {
  id: string;
  label: string;
  /** Shortcut as shown to users. */
  shortcut?: string;
  group: "General" | "View" | "Table" | "Query" | "Server";
}

export const COMMANDS = [
  { id: "palette", label: "Command palette", shortcut: "⌘K", group: "General" },
  { id: "settings", label: "Settings", shortcut: "⌘,", group: "General" },
  { id: "connection.new", label: "New connection", shortcut: "⇧⌘N", group: "General" },
  { id: "query.new", label: "New query tab", shortcut: "⌘T", group: "General" },
  { id: "sqlFile", label: "Run SQL file…", group: "General" },
  { id: "export", label: "Export…", shortcut: "⇧⌘E", group: "General" },
  { id: "tab.close", label: "Close tab", shortcut: "⌘W", group: "View" },
  { id: "tab.next", label: "Next tab", shortcut: "⇧⌘]", group: "View" },
  { id: "tab.previous", label: "Previous tab", shortcut: "⇧⌘[", group: "View" },
  { id: "view.sidebar", label: "Toggle sidebar", shortcut: "⌘B", group: "View" },
  { id: "view.inspector", label: "Toggle row inspector", shortcut: "⌥⌘I", group: "View" },
  { id: "view.diagram", label: "Open ER diagram", group: "View" },
  { id: "view.server", label: "Server activity", group: "Server" },
  { id: "view.health", label: "Table and index health", group: "Server" },
  { id: "nav.back", label: "Back", shortcut: "⌘[", group: "Table" },
  { id: "nav.forward", label: "Forward", shortcut: "⌘]", group: "Table" },
  { id: "table.search", label: "Search rows", shortcut: "⌘F", group: "Table" },
  { id: "table.refresh", label: "Refresh", shortcut: "⌘R", group: "Table" },
  { id: "table.filter", label: "Toggle filters", shortcut: "⇧⌘F", group: "Table" },
  { id: "table.form", label: "Toggle form view", group: "Table" },
  { id: "table.saveView", label: "Save view…", group: "Table" },
  { id: "table.structure", label: "Show structure", group: "Table" },
  { id: "table.addRow", label: "Add row", shortcut: "⌥⌘N", group: "Table" },
  { id: "table.commit", label: "Commit changes…", shortcut: "⌘S", group: "Table" },
  { id: "table.discard", label: "Discard changes", shortcut: "⌥⌘Z", group: "Table" },
  { id: "query.run", label: "Run statement", shortcut: "⌘↩", group: "Query" },
  { id: "query.runAll", label: "Run all", shortcut: "⇧⌘↩", group: "Query" },
  { id: "query.explain", label: "Explain", shortcut: "⌥⌘E", group: "Query" },
  { id: "query.explainAnalyze", label: "Explain analyze", shortcut: "⇧⌥⌘E", group: "Query" },
  { id: "query.format", label: "Format SQL", shortcut: "⌥⌘F", group: "Query" },
  { id: "query.chart", label: "Chart the result", group: "Query" },
  { id: "query.pin", label: "Pin the result for comparison", group: "Query" },
] as const satisfies readonly CommandInfo[];

export type CommandId = (typeof COMMANDS)[number]["id"];

export const COMMAND_IDS: readonly CommandId[] = COMMANDS.map((c) => c.id);

export function isCommandId(value: string): value is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(value);
}

/** Event asking the active table tab to focus its search field. */
export const FOCUS_SEARCH_EVENT = "tablepp:focus-search";

/** The schema a connection-wide command should use: the active table's, else `public`. */
function activeSchema(active: Tab | undefined): string {
  if (active?.kind === "table") return active.query.table.schema;
  if (active?.kind === "structure") return active.table.schema;
  if (active?.kind === "diagram") return active.schema;
  return "public";
}

/** What a command does in the current state, or `null` when it does not apply. */
function commandAction(id: CommandId, state: AppState): (() => void) | null {
  const active = state.tabs.find((t) => t.id === state.activeTabId);
  const connectionId = active?.connectionId ?? state.activeConnectionId;
  switch (id) {
    case "palette":
      return () => openDialog({ kind: "palette" });
    case "settings":
      return () => openDialog({ kind: "settings" });
    case "connection.new":
      return () => openDialog({ kind: "connection", profileId: null });
    case "query.new":
      return state.connectionOrder.length === 0 ? null : () => void openQuery();
    case "sqlFile":
      if (state.activeConnectionId === null) return null;
      return () => openDialog({ kind: "runSqlFile", connectionId: state.activeConnectionId ?? "" });
    case "export":
      if (active?.kind !== "table" && active?.kind !== "query") return null;
      return () => openDialog({ kind: "export", tabId: active.id });
    case "tab.close":
      if (!active) return null;
      return () => {
        if (tabHasUnsavedWork(active)) openDialog({ kind: "commit", tabId: active.id });
        else void closeTab(active.id);
      };
    case "tab.next":
      return () => selectTabByOffset(1);
    case "tab.previous":
      return () => selectTabByOffset(-1);
    case "view.sidebar":
      return () =>
        mutate((draft) => {
          draft.sidebarOpen = !draft.sidebarOpen;
        });
    case "view.inspector":
      return () =>
        mutate((draft) => {
          draft.inspectorOpen = !draft.inspectorOpen;
        });
    case "view.diagram":
      if (connectionId === null) return null;
      return () => void openDiagram(connectionId, activeSchema(active));
    case "view.server":
      if (connectionId === null) return null;
      return () => void openServer(connectionId, "activity");
    case "view.health":
      if (connectionId === null) return null;
      return () => void openServer(connectionId, "tables");
    case "nav.back":
      if (active?.kind !== "table" || active.history.back.length === 0) return null;
      return () => void goBack(active.id);
    case "nav.forward":
      if (active?.kind !== "table" || active.history.forward.length === 0) return null;
      return () => void goForward(active.id);
    case "table.search":
      if (active?.kind !== "table") return null;
      return () => window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
    case "table.refresh":
      if (active?.kind !== "table") return null;
      return () => void loadTable(active.id);
    case "table.filter":
      if (active?.kind !== "table") return null;
      return () => toggleFilterBar(active.id);
    case "table.form":
      if (active?.kind !== "table") return null;
      return () => setViewMode(active.id, active.viewMode === "form" ? "grid" : "form");
    case "table.saveView":
      if (active?.kind !== "table") return null;
      return () => openDialog({ kind: "saveView", tabId: active.id, viewId: null });
    case "table.structure":
      if (active?.kind !== "table") return null;
      return () => void openStructure(active.connectionId, active.query.table);
    case "table.addRow":
      if (active?.kind !== "table") return null;
      return () => addRow(active.id);
    case "table.commit":
      if (active?.kind !== "table") return null;
      return () => {
        const production = state.connections[active.connectionId]?.profile.environment === "production";
        if (production || useSettings.getState().settings.confirmBeforeCommit) {
          openDialog({ kind: "commit", tabId: active.id });
        } else {
          void commitChanges(active.id);
        }
      };
    case "table.discard":
      if (active?.kind !== "table") return null;
      return () => discardChanges(active.id);
    case "query.run": {
      // On a table tab the same key opens the focused cell instead.
      if (active?.kind === "table") {
        const focused = active.selection.focused;
        if (!focused) return null;
        return () =>
          openDialog({ kind: "valueEditor", tabId: active.id, row: focused.row, column: focused.column });
      }
      if (active?.kind !== "query") return null;
      return () => void runQuery(active.id, "current");
    }
    case "query.runAll":
      if (active?.kind !== "query") return null;
      return () => void runQuery(active.id, "all");
    case "query.explain":
      if (active?.kind !== "query") return null;
      return () => void explainQuery(active.id, false);
    case "query.explainAnalyze":
      if (active?.kind !== "query") return null;
      return () => void explainQuery(active.id, true);
    case "query.format":
      if (active?.kind !== "query") return null;
      return () => formatQuery(active.id);
    case "query.chart":
      if (active?.kind !== "query" || active.results.length === 0) return null;
      return () => setResultView(active.id, active.resultView === "chart" ? "grid" : "chart");
    case "query.pin":
      if (active?.kind !== "query" || active.results.length === 0) return null;
      return () => pinResult(active.id);
  }
}

/** Whether a command applies to the current state (the palette hides the others). */
export function isCommandAvailable(id: CommandId): boolean {
  return commandAction(id, getState()) !== null;
}

/**
 * Executes a command against the current state. Returns whether it applied, so a keyboard
 * handler knows whether to swallow the key.
 */
export function runCommand(id: CommandId): boolean {
  const action = commandAction(id, getState());
  if (!action) return false;
  action();
  return true;
}
