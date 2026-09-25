// Query history and saved queries, stored as documents.

import { backend } from "@/lib/backend";
import type { QueryHistoryEntry, SavedQuery } from "@/lib/types";

const HISTORY = "history";
const SAVED = "saved-queries";
export const HISTORY_LIMIT = 500;

export async function loadHistory(): Promise<QueryHistoryEntry[]> {
  return (
    (await backend()
      .loadDocument<QueryHistoryEntry[]>(HISTORY)
      .catch(() => null)) ?? []
  );
}

let historyQueue: Promise<void> = Promise.resolve();

/**
 * Adds an entry; re-running the same SQL on the same profile moves it to the top. Writes are
 * serialised so concurrent statements never overwrite each other.
 */
export function recordHistory(entry: QueryHistoryEntry): Promise<void> {
  historyQueue = historyQueue.then(async () => {
    const entries = await loadHistory();
    const filtered = entries.filter((e) => !(e.profileId === entry.profileId && e.sql === entry.sql));
    await backend()
      .saveDocument(HISTORY, [entry, ...filtered].slice(0, HISTORY_LIMIT))
      .catch(() => undefined);
  });
  return historyQueue;
}

/** Waits for pending history writes (tests). */
export function flushHistory(): Promise<void> {
  return historyQueue;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const entries = await loadHistory();
  await backend().saveDocument(
    HISTORY,
    entries.filter((e) => e.id !== id),
  );
}

export async function clearHistory(): Promise<void> {
  await backend().saveDocument(HISTORY, []);
}

export async function loadSavedQueries(): Promise<SavedQuery[]> {
  return (
    (await backend()
      .loadDocument<SavedQuery[]>(SAVED)
      .catch(() => null)) ?? []
  );
}

export async function saveQuery(query: SavedQuery): Promise<void> {
  const queries = (await loadSavedQueries()).filter((q) => q.id !== query.id);
  queries.push(query);
  queries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  await backend().saveDocument(SAVED, queries);
}

export async function deleteSavedQuery(id: string): Promise<void> {
  const queries = await loadSavedQueries();
  await backend().saveDocument(
    SAVED,
    queries.filter((q) => q.id !== id),
  );
}
