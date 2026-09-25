// Root application state. Actions live in `./actions/*` and mutate the store through immer.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { ChangeSet } from "@/core/changes/changeSet";
import type { TableQuery } from "@/core/query/tableQuery";
import type { GridSelection } from "@/features/grid/types";
import type { EditorErrorMarker } from "@/features/editor/types";
import type {
  AppError,
  ConnectionProfile,
  FunctionInfo,
  QueryResult,
  RelationInfo,
  SchemaInfo,
  TableRef,
  TableStructure,
} from "@/lib/types";

export type ConnectionStatus = "connecting" | "connected" | "failed";

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

export interface TableTab extends TabBase {
  kind: "table";
  query: TableQuery;
  structure: TableStructure | null;
  result: QueryResult | null;
  totalCount: number | null;
  loading: boolean;
  committing: boolean;
  error: AppError | null;
  changes: ChangeSet;
  hiddenColumnIds: number[];
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
  gridSelection: GridSelection;
  version: number;
}

export interface StructureTab extends TabBase {
  kind: "structure";
  table: TableRef;
  structure: TableStructure | null;
  error: AppError | null;
  loading: boolean;
}

export type Tab = TableTab | QueryTab | StructureTab;

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
  /** Which dialog is open, if any. */
  dialog:
    | { kind: "connection"; profileId: string | null }
    | { kind: "settings" }
    | { kind: "export"; tabId: string }
    | { kind: "importCsv"; tabId: string }
    | { kind: "runSqlFile"; connectionId: string }
    | { kind: "commit"; tabId: string }
    | { kind: "valueEditor"; tabId: string; row: number; column: number }
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
