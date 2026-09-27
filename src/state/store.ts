// Root application state. Actions live in `./actions/*` and mutate the store through immer.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { ChangeSet } from "@/core/changes/changeSet";
import type { ChartSpec } from "@/core/chart/chart";
import type { Point } from "@/core/diagram/layout";
import type { ActivitySnapshot, IndexUsage, TableHealth } from "@/core/monitor/monitor";
import type { SavedView } from "@/core/query/savedView";
import type { TableQuery } from "@/core/query/tableQuery";
import type { StatementWarning } from "@/core/sql/safety";
import type { Statement } from "@/core/sql/splitter";
import type { TableLayout } from "@/features/grid/columnLayout";
import type { GridSelection } from "@/features/grid/types";
import type { EditorErrorMarker } from "@/features/editor/types";
import type {
  AppError,
  ConnectionProfile,
  FunctionInfo,
  QueryResult,
  RelationInfo,
  SchemaGraph,
  SchemaInfo,
  TableRef,
  TableStructure,
} from "@/lib/types";

/** `disconnected` means the server stopped answering; the entry stays so the user can reconnect. */
export type ConnectionStatus = "connecting" | "connected" | "failed" | "disconnected";

export interface ConnectionState {
  /** Same as the profile id. */
  id: string;
  profile: ConnectionProfile;
  sessionId: string | null;
  status: ConnectionStatus;
  error: string | null;
  serverVersion: string;
  schemas: SchemaInfo[];
  relations: Record<string, RelationInfo[]>;
  functions: Record<string, FunctionInfo[]>;
  /** Keyed by `schema.name`. */
  structures: Record<string, TableStructure>;
  expandedSchemas: string[];
  loadingSchemas: string[];
  schemaLoading: boolean;
}

interface TabBase {
  id: string;
  connectionId: string;
}

/** Grid of rows, or one record at a time with its related records. */
export type TableViewMode = "grid" | "form";

export interface TableTab extends TabBase {
  kind: "table";
  query: TableQuery;
  /** Queries visited before (following foreign keys) and after (after going back). */
  history: { back: TableQuery[]; forward: TableQuery[] };
  viewMode: TableViewMode;
  structure: TableStructure | null;
  result: QueryResult | null;
  totalCount: number | null;
  loading: boolean;
  committing: boolean;
  error: AppError | null;
  changes: ChangeSet;
  layout: TableLayout;
  selection: GridSelection;
  filterBarVisible: boolean;
  /** Bumped whenever rows or staged changes change, so the grid knows to redraw. */
  version: number;
  focusRequest: { row: number; column: number } | null;
}

export interface QueryTab extends TabBase {
  kind: "query";
  text: string;
  customTitle: string | null;
  selection: { anchor: number; head: number };
  results: QueryResult[];
  selectedResult: number;
  error: AppError | null;
  errorMarker: EditorErrorMarker | null;
  running: boolean;
  status: string | null;
  inTransaction: boolean;
  /** Dedicated session so manual transactions stay isolated per tab. */
  sessionId: string | null;
  hiddenColumnIds: number[];
  frozenColumns: number;
  gridSelection: GridSelection;
  version: number;
  /** How the selected result is shown. */
  resultView: ResultView;
  /** Chart settings; `null` until the chart is first opened for a result. */
  chart: ChartSpec | null;
  /** Results kept aside to compare later ones against. */
  pinned: PinnedResult[];
  /** When set, the grid shows the difference between a pinned result and the current one. */
  compare: { pinnedId: string; keyColumns: string[] } | null;
}

export type ResultView = "grid" | "chart" | "plan";

export interface PinnedResult {
  id: string;
  label: string;
  sql: string;
  result: QueryResult;
  pinnedAt: string;
}

export interface StructureTab extends TabBase {
  kind: "structure";
  table: TableRef;
  structure: TableStructure | null;
  error: AppError | null;
  loading: boolean;
}

export interface DiagramTab extends TabBase {
  kind: "diagram";
  schema: string;
  graph: SchemaGraph | null;
  loading: boolean;
  error: AppError | null;
  /** Positions the user dragged tables to, by table name. */
  positions: Record<string, Point>;
}

export type ServerPane = "activity" | "tables" | "indexes";

export interface ServerTab extends TabBase {
  kind: "server";
  pane: ServerPane;
  activity: ActivitySnapshot | null;
  tables: { tables: TableHealth[]; statsReset: string | null } | null;
  indexes: IndexUsage[] | null;
  loading: boolean;
  error: AppError | null;
  /** Pauses the automatic refresh of the activity pane. */
  paused: boolean;
  showIdle: boolean;
  showBackground: boolean;
  refreshedAt: number | null;
}

export type Tab = TableTab | QueryTab | StructureTab | DiagramTab | ServerTab;

export interface Toast {
  id: string;
  title: string;
  message?: string;
  tone: "error" | "success" | "info";
}

export interface AppState {
  ready: boolean;
  profiles: ConnectionProfile[];
  connections: Record<string, ConnectionState>;
  connectionOrder: string[];
  tabs: Tab[];
  activeTabId: string | null;
  activeConnectionId: string | null;
  inspectorOpen: boolean;
  sidebarOpen: boolean;
  toasts: Toast[];
  savedViews: SavedView[];
  /** Which dialog is open, if any. */
  dialog:
    | { kind: "connection"; profileId: string | null }
    | { kind: "settings" }
    | { kind: "export"; tabId: string }
    | { kind: "importCsv"; tabId: string }
    | { kind: "runSqlFile"; connectionId: string }
    | { kind: "commit"; tabId: string }
    | { kind: "valueEditor"; tabId: string; row: number; column: number }
    | { kind: "palette" }
    | { kind: "confirmRun"; tabId: string; statements: Statement[]; warnings: StatementWarning[] }
    | { kind: "saveView"; tabId: string; viewId: string | null }
    | null;
}

export const initialState: AppState = {
  ready: false,
  profiles: [],
  connections: {},
  connectionOrder: [],
  tabs: [],
  activeTabId: null,
  activeConnectionId: null,
  inspectorOpen: false,
  sidebarOpen: true,
  toasts: [],
  savedViews: [],
  dialog: null,
};

export const useAppStore = create<AppState>()(immer(() => initialState));

/** Mutates the store through immer. */
export function mutate(recipe: (draft: AppState) => void): void {
  useAppStore.setState(recipe);
}

export function getState(): AppState {
  return useAppStore.getState();
}

export function resetStore(): void {
  useAppStore.setState(() => initialState);
}

export function findTab<T extends Tab["kind"]>(id: string, kind?: T): Extract<Tab, { kind: T }> | undefined {
  const tab = getState().tabs.find((t) => t.id === id);
  if (!tab || (kind && tab.kind !== kind)) return undefined;
  return tab as Extract<Tab, { kind: T }>;
}

/** Runs a recipe against one tab of the given kind, if it still exists. */
export function mutateTab<T extends Tab["kind"]>(
  id: string,
  kind: T,
  recipe: (tab: Extract<Tab, { kind: T }>) => void,
): void {
  mutate((draft) => {
    const tab = draft.tabs.find((t) => t.id === id);
    if (tab?.kind === kind) recipe(tab as Extract<Tab, { kind: T }>);
  });
}

export function mutateConnection(id: string, recipe: (connection: ConnectionState) => void): void {
  mutate((draft) => {
    const connection = draft.connections[id];
    if (connection) recipe(connection);
  });
}

export function pushToast(toast: Omit<Toast, "id">): void {
  const id = crypto.randomUUID();
  mutate((draft) => {
    draft.toasts.push({ id, ...toast });
  });
  setTimeout(
    () => {
      mutate((draft) => {
        draft.toasts = draft.toasts.filter((t) => t.id !== id);
      });
    },
    toast.tone === "error" ? 8000 : 4000,
  );
}

export function dismissToast(id: string): void {
  mutate((draft) => {
    draft.toasts = draft.toasts.filter((t) => t.id !== id);
  });
}

export function openDialog(dialog: AppState["dialog"]): void {
  mutate((draft) => {
    draft.dialog = dialog;
  });
}

export function closeDialog(): void {
  mutate((draft) => {
    draft.dialog = null;
  });
}
