// Tabs: opening, closing, ordering and persisting the workspace across launches.

import { emptyChangeSet } from "@/core/changes/changeSet";
import { hasActiveFilters, newTableQuery, type Filter, type TableQuery } from "@/core/query/tableQuery";
import { sameTable } from "@/core/sql/quote";
import { backend } from "@/lib/backend";
import type { TableRef } from "@/lib/types";

import { useSettings } from "../settings";
import { getState, mutate, type QueryTab, type StructureTab, type Tab, type TableTab } from "../store";
import { connect } from "./connections";

const DOCUMENT = "workspace";

type TabSnapshot =
  | { kind: "table"; query: TableQuery }
  | { kind: "structure"; table: TableRef }
  | { kind: "query"; sql: string; title: string | null };

interface WorkspaceSnapshot {
  connections: { profileId: string; tabs: TabSnapshot[]; activeIndex: number | null }[];
  activeProfileId: string | null;
}

function insertTab(tab: Tab): void {
  mutate((draft) => {
    const activeIndex = draft.tabs.findIndex((t) => t.id === draft.activeTabId);
    if (activeIndex === -1) draft.tabs.push(tab);
    else draft.tabs.splice(activeIndex + 1, 0, tab);
    draft.activeTabId = tab.id;
    draft.activeConnectionId = tab.connectionId;
  });
  persistWorkspace();
}

function makeTableTab(connectionId: string, query: TableQuery): TableTab {
  return {
    id: crypto.randomUUID(),
    kind: "table",
    connectionId,
    query,
    structure: null,
    result: null,
    totalCount: null,
    loading: false,
    committing: false,
    error: null,
    changes: emptyChangeSet(),
    hiddenColumnIds: [],
    selection: { rows: [], focused: null },
    filterBarVisible: hasActiveFilters(query),
    version: 0,
    focusRequest: null,
  };
}

function makeQueryTab(connectionId: string, text: string, title: string | null): QueryTab {
  return {
    id: crypto.randomUUID(),
    kind: "query",
    connectionId,
    text,
    customTitle: title,
    selection: { anchor: text.length, head: text.length },
    results: [],
    selectedResult: 0,
    error: null,
    errorMarker: null,
    running: false,
    status: null,
    inTransaction: false,
    sessionId: null,
    hiddenColumnIds: [],
    gridSelection: { rows: [], focused: null },
    version: 0,
  };
}

function makeStructureTab(connectionId: string, table: TableRef): StructureTab {
  return {
    id: crypto.randomUUID(),
    kind: "structure",
    connectionId,
    table,
    structure: null,
    error: null,
    loading: false,
  };
}

/** Opens a table tab, reusing an unfiltered tab on the same table unless told otherwise. */
export function openTable(
  connectionId: string,
  table: TableRef,
  filters: Filter[] = [],
  reuse = true,
): string {
  const state = getState();
  if (reuse && filters.length === 0) {
    const existing = state.tabs.find(
      (t) =>
        t.kind === "table" &&
        t.connectionId === connectionId &&
        sameTable(t.query.table, table) &&
        !hasActiveFilters(t.query),
    );
    if (existing) {
      selectTab(existing.id);
      return existing.id;
    }
  }
  const tab = makeTableTab(
    connectionId,
    newTableQuery(table, useSettings.getState().settings.pageSize, filters),
  );
  insertTab(tab);
  return tab.id;
}

export function openStructure(connectionId: string, table: TableRef): string {
  const existing = getState().tabs.find(
    (t) => t.kind === "structure" && t.connectionId === connectionId && sameTable(t.table, table),
  );
  if (existing) {
    selectTab(existing.id);
    return existing.id;
  }
  const tab = makeStructureTab(connectionId, table);
  insertTab(tab);
  return tab.id;
}

export function openQuery(
  connectionId: string | null = null,
  text = "",
  title: string | null = null,
): string | null {
  const id = connectionId ?? getState().activeConnectionId ?? getState().connectionOrder[0] ?? null;
  if (!id) return null;
  const tab = makeQueryTab(id, text, title);
  insertTab(tab);
  return tab.id;
}

export function selectTab(id: string): void {
  mutate((draft) => {
    const tab = draft.tabs.find((t) => t.id === id);
    if (!tab) return;
    draft.activeTabId = id;
    draft.activeConnectionId = tab.connectionId;
  });
  persistWorkspace();
}

export function selectTabByOffset(offset: number): void {
  const { tabs, activeTabId } = getState();
  if (tabs.length === 0) return;
  const current = tabs.findIndex((t) => t.id === activeTabId);
  const next = tabs[(current + offset + tabs.length) % tabs.length];
  if (next) selectTab(next.id);
}

export function selectTabByNumber(number: number): void {
  const tab = getState().tabs[number - 1];
  if (tab) selectTab(tab.id);
}

export async function closeTab(id: string): Promise<void> {
  const tab = getState().tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.kind === "query" && tab.sessionId)
    await backend()
      .disconnect(tab.sessionId)
      .catch(() => undefined);
  mutate((draft) => {
    const index = draft.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    draft.tabs.splice(index, 1);
    if (draft.activeTabId === id) {
      const neighbour = draft.tabs[index] ?? draft.tabs[index - 1] ?? null;
      draft.activeTabId = neighbour?.id ?? null;
      if (neighbour) draft.activeConnectionId = neighbour.connectionId;
    }
  });
  persistWorkspace();
}

export async function closeOtherTabs(id: string): Promise<void> {
  for (const tab of getState().tabs.filter((t) => t.id !== id)) await closeTab(tab.id);
  selectTab(id);
}

export function moveTab(id: string, toIndex: number): void {
  mutate((draft) => {
    const from = draft.tabs.findIndex((t) => t.id === id);
    if (from === -1) return;
    const [tab] = draft.tabs.splice(from, 1);
    if (tab) draft.tabs.splice(Math.max(0, Math.min(toIndex, draft.tabs.length)), 0, tab);
  });
  persistWorkspace();
}

/** Whether closing the tab would lose staged edits or an open transaction. */
export function tabHasUnsavedWork(tab: Tab): boolean {
  if (tab.kind === "table")
    return (
      Object.keys(tab.changes.updates).length +
        tab.changes.inserts.length +
        Object.keys(tab.changes.deletes).length >
      0
    );
  if (tab.kind === "query") return tab.inTransaction;
  return false;
}

export function snapshotTab(tab: Tab): TabSnapshot {
  switch (tab.kind) {
    case "table":
      return { kind: "table", query: tab.query };
    case "structure":
      return { kind: "structure", table: tab.table };
    case "query":
      return { kind: "query", sql: tab.text, title: tab.customTitle };
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Saves the open connections and tabs, debounced. */
export function persistWorkspace(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const state = getState();
    const snapshot: WorkspaceSnapshot = {
      connections: state.connectionOrder.map((profileId) => {
        const tabs = state.tabs.filter((t) => t.connectionId === profileId);
        const activeIndex = tabs.findIndex((t) => t.id === state.activeTabId);
        return {
          profileId,
          tabs: tabs.map(snapshotTab),
          activeIndex: activeIndex === -1 ? null : activeIndex,
        };
      }),
      activeProfileId: state.activeConnectionId,
    };
    void backend()
      .saveDocument(DOCUMENT, snapshot)
      .catch(() => undefined);
  }, 250);
}

/** Flushes a pending workspace save (for tests and before quitting). */
export async function flushWorkspace(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const state = getState();
  const snapshot: WorkspaceSnapshot = {
    connections: state.connectionOrder.map((profileId) => {
      const tabs = state.tabs.filter((t) => t.connectionId === profileId);
      const activeIndex = tabs.findIndex((t) => t.id === state.activeTabId);
      return { profileId, tabs: tabs.map(snapshotTab), activeIndex: activeIndex === -1 ? null : activeIndex };
    }),
    activeProfileId: state.activeConnectionId,
  };
  await backend().saveDocument(DOCUMENT, snapshot);
}

/** Reopens the connections and tabs saved by `persistWorkspace`. */
export async function restoreWorkspace(): Promise<void> {
  const snapshot = await backend()
    .loadDocument<WorkspaceSnapshot>(DOCUMENT)
    .catch(() => null);
  if (!snapshot) return;
  for (const entry of snapshot.connections) {
    const profile = getState().profiles.find((p) => p.id === entry.profileId);
    if (!profile) continue;
    const connected = await connect(profile);
    if (!connected) continue;
    const restored: Tab[] = entry.tabs.map((tab) => {
      switch (tab.kind) {
        case "table":
          return makeTableTab(profile.id, tab.query);
        case "structure":
          return makeStructureTab(profile.id, tab.table);
        case "query":
          return makeQueryTab(profile.id, tab.sql, tab.title);
      }
    });
    mutate((draft) => {
      draft.tabs.push(...restored);
      const active = entry.activeIndex === null ? undefined : restored[entry.activeIndex];
      if (active) draft.activeTabId = active.id;
    });
  }
  mutate((draft) => {
    draft.activeTabId ??= draft.tabs[0]?.id ?? null;
    draft.activeConnectionId = snapshot.activeProfileId ?? draft.connectionOrder[0] ?? null;
  });
}
