// Saved views of tables, stored as one document and mirrored in the store.

import { queryFromView, viewFromQuery, type SavedView } from "@/core/query/savedView";
import { backend } from "@/lib/backend";
import { toAppError } from "@/lib/types";

import { useSettings } from "../settings";
import { findTab, getState, mutate, mutateTab, pushToast } from "../store";
import { connect } from "./connections";
import { loadTable, navigateTable } from "./tableTab";
import { insertTableTab } from "./workspace";

const DOCUMENT = "saved-views";

export async function loadSavedViews(): Promise<void> {
  const views =
    (await backend()
      .loadDocument<SavedView[]>(DOCUMENT)
      .catch(() => null)) ?? [];
  mutate((draft) => {
    draft.savedViews = views;
  });
}

async function persist(views: SavedView[]): Promise<void> {
  mutate((draft) => {
    draft.savedViews = views;
  });
  try {
    await backend().saveDocument(DOCUMENT, views);
  } catch (error) {
    pushToast({ tone: "error", title: "Could not save the views", message: toAppError(error).message });
  }
}

/** Saves what a table tab shows under a name, replacing `viewId` when given. */
export async function saveView(
  tabId: string,
  name: string,
  viewId: string | null,
): Promise<SavedView | null> {
  const tab = findTab(tabId, "table");
  if (!tab) return null;
  const existing = viewId === null ? undefined : getState().savedViews.find((v) => v.id === viewId);
  const view = viewFromQuery(tab.query, tab.connectionId, name, tab.layout.hidden, existing);
  await persist([...getState().savedViews.filter((v) => v.id !== view.id), view]);
  pushToast({ tone: "success", title: `Saved view “${name}”` });
  return view;
}

export async function deleteSavedView(id: string): Promise<void> {
  await persist(getState().savedViews.filter((v) => v.id !== id));
}

/**
 * Opens a saved view: in the given table tab (keeping its history) or in a new tab, connecting
 * first when needed.
 */
export async function openSavedView(view: SavedView, tabId?: string): Promise<void> {
  const profile = getState().profiles.find((p) => p.id === view.profileId);
  if (!profile) return;
  if (getState().connections[profile.id]?.status !== "connected" && !(await connect(profile))) return;
  const query = queryFromView(view, useSettings.getState().settings.pageSize);
  const target = tabId === undefined ? undefined : findTab(tabId, "table");
  let id: string;
  if (target) {
    await navigateTable(target.id, query);
    id = target.id;
  } else {
    id = insertTableTab(view.profileId, query);
  }
  mutateTab(id, "table", (t) => {
    t.layout = { ...t.layout, hidden: [...view.hiddenColumns] };
  });
  if (!target) await loadTable(id);
}
