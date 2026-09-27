// ER diagram tab: loads the schema graph and keeps the positions tables were dragged to.

import type { Point } from "@/core/diagram/layout";
import { backend } from "@/lib/backend";
import { toAppError } from "@/lib/types";

import { findTab, getState, mutateTab } from "../store";
import { noteFailure } from "./connections";
import { persistWorkspace } from "./workspace";

export async function loadDiagram(tabId: string): Promise<void> {
  const tab = findTab(tabId, "diagram");
  if (!tab) return;
  const connection = getState().connections[tab.connectionId];
  mutateTab(tabId, "diagram", (t) => {
    t.loading = true;
    t.error = null;
  });
  try {
    if (!connection?.sessionId) throw toAppError({ kind: "connection", message: "Not connected." });
    const graph = await backend().schemaGraph(connection.sessionId, tab.schema);
    mutateTab(tabId, "diagram", (t) => {
      t.graph = graph;
      t.loading = false;
    });
  } catch (error) {
    await noteFailure(tab.connectionId, error);
    mutateTab(tabId, "diagram", (t) => {
      t.error = toAppError(error);
      t.loading = false;
    });
  }
}

export function moveDiagramTable(tabId: string, table: string, position: Point): void {
  mutateTab(tabId, "diagram", (t) => {
    t.positions = { ...t.positions, [table]: { x: Math.round(position.x), y: Math.round(position.y) } };
  });
  persistWorkspace();
}

/** Forgets dragged positions so the automatic layout applies again. */
export function resetDiagramLayout(tabId: string): void {
  mutateTab(tabId, "diagram", (t) => {
    t.positions = {};
  });
  persistWorkspace();
}
