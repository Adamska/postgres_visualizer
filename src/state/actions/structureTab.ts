// Structure tab: loads the relation description.

import { toAppError } from "@/lib/types";

import { findTab, mutateTab } from "../store";
import { loadStructure } from "./connections";

export async function loadStructureTab(tabId: string, force = false): Promise<void> {
  const tab = findTab(tabId, "structure");
  if (!tab) return;
  mutateTab(tabId, "structure", (t) => {
    t.loading = true;
  });
  try {
    const structure = await loadStructure(tab.connectionId, tab.table, force);
    mutateTab(tabId, "structure", (t) => {
      t.structure = structure;
      t.error = null;
      t.loading = false;
    });
  } catch (error) {
    mutateTab(tabId, "structure", (t) => {
      t.error = toAppError(error);
      t.loading = false;
    });
  }
}
