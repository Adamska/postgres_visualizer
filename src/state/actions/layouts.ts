// Per-table column layouts (hidden, order, widths, frozen), stored as one document.

import { tableKey } from "@/core/completion/engine";
import { EMPTY_LAYOUT, type TableLayout } from "@/features/grid/columnLayout";
import { backend } from "@/lib/backend";
import { withoutKey } from "@/lib/records";
import type { TableRef } from "@/lib/types";

const DOCUMENT = "table-layouts";

let layouts: Record<string, TableLayout> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function layoutKey(profileId: string, table: TableRef): string {
  return `${profileId}|${tableKey(table)}`;
}

export async function loadLayouts(): Promise<void> {
  layouts =
    (await backend()
      .loadDocument<Record<string, TableLayout>>(DOCUMENT)
      .catch(() => null)) ?? {};
}

/** The saved layout of a table, or the default one. */
export function storedLayout(profileId: string, table: TableRef): TableLayout {
  const stored = layouts[layoutKey(profileId, table)];
  return stored ? { ...EMPTY_LAYOUT, ...stored } : EMPTY_LAYOUT;
}

function isDefault(layout: TableLayout): boolean {
  return (
    layout.hidden.length === 0 &&
    layout.order.length === 0 &&
    Object.keys(layout.widths).length === 0 &&
    layout.frozen === 0
  );
}

/** Remembers a table's layout; writes are debounced. */
export function rememberLayout(profileId: string, table: TableRef, layout: TableLayout): void {
  const key = layoutKey(profileId, table);
  layouts = isDefault(layout) ? withoutKey(layouts, key) : { ...layouts, [key]: layout };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void backend()
      .saveDocument(DOCUMENT, layouts)
      .catch(() => undefined);
  }, 400);
}

/** Writes pending layout changes now (tests). */
export async function flushLayouts(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await backend().saveDocument(DOCUMENT, layouts);
}

/** Forgets the cached layouts (tests). */
export function resetLayouts(): void {
  layouts = {};
}
