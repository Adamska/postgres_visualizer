// Server tab: sessions (pg_stat_activity), table health and index usage, and backend control.

import {
  ACTIVITY_SQL,
  cancelBackendSql,
  INDEX_USAGE_SQL,
  parseActivity,
  parseIndexUsage,
  parseTableHealth,
  TABLE_HEALTH_SQL,
  terminateBackendSql,
} from "@/core/monitor/monitor";
import { toAppError } from "@/lib/types";

import { findTab, mutateTab, pushToast, type ServerPane, type ServerTab } from "../store";
import { executeOn } from "./connections";
import { persistWorkspace } from "./workspace";

/** How often the activity pane refreshes while visible. */
export const ACTIVITY_REFRESH_MS = 2000;

/** Loads the data of the tab's current pane. */
export async function refreshServerTab(tabId: string): Promise<void> {
  const tab = findTab(tabId, "server");
  if (!tab || tab.loading) return;
  mutateTab(tabId, "server", (t) => {
    t.loading = true;
  });
  try {
    const patch: Partial<ServerTab> = {};
    if (tab.pane === "activity") {
      patch.activity = parseActivity(await executeOn(tab.connectionId, ACTIVITY_SQL));
    } else if (tab.pane === "tables") {
      patch.tables = parseTableHealth(await executeOn(tab.connectionId, TABLE_HEALTH_SQL));
    } else {
      patch.indexes = parseIndexUsage(await executeOn(tab.connectionId, INDEX_USAGE_SQL));
    }
    mutateTab(tabId, "server", (t) => {
      Object.assign(t, patch);
      t.error = null;
      t.loading = false;
      t.refreshedAt = Date.now();
    });
  } catch (error) {
    mutateTab(tabId, "server", (t) => {
      t.error = toAppError(error);
      t.loading = false;
    });
  }
}

export function setServerPane(tabId: string, pane: ServerPane): Promise<void> {
  mutateTab(tabId, "server", (t) => {
    t.pane = pane;
  });
  persistWorkspace();
  return refreshServerTab(tabId);
}

export function updateServerTab(
  tabId: string,
  patch: Partial<Pick<ServerTab, "paused" | "showIdle" | "showBackground">>,
): void {
  mutateTab(tabId, "server", (t) => {
    Object.assign(t, patch);
  });
}

/** Cancels the running statement of a backend, or ends its session. */
export async function signalBackend(tabId: string, pid: number, terminate: boolean): Promise<void> {
  const tab = findTab(tabId, "server");
  if (!tab) return;
  try {
    const result = await executeOn(
      tab.connectionId,
      terminate ? terminateBackendSql(pid) : cancelBackendSql(pid),
    );
    const ok = result.rows[0]?.[0] === "true";
    pushToast(
      ok
        ? {
            tone: "success",
            title: terminate ? `Terminated session ${pid}` : `Cancelled the query of ${pid}`,
          }
        : {
            tone: "error",
            title: `Session ${pid} did not respond`,
            message: "It may have finished already.",
          },
    );
  } catch (error) {
    pushToast({ tone: "error", title: `Could not signal ${pid}`, message: toAppError(error).message });
  }
  await refreshServerTab(tabId);
}
