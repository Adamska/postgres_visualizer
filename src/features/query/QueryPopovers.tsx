// History and saved queries lists.

import { CheckCircle2, Search, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatCount, formatDuration } from "@/core/format/values";
import type { QueryHistoryEntry, SavedQuery } from "@/lib/types";
import {
  clearHistory,
  deleteHistoryEntry,
  deleteSavedQuery,
  loadHistory,
  loadSavedQueries,
} from "@/state/actions/storage";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export function HistoryPopover({
  profileId,
  onInsert,
}: {
  profileId: string;
  onInsert: (sql: string) => void;
}) {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    void loadHistory().then(setEntries);
  }, []);
  const visible = entries.filter(
    (e) =>
      (all || e.profileId === profileId) &&
      (search === "" || e.sql.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className="flex max-h-[420px] flex-col">
      <div className="flex items-center gap-2 border-b border-line p-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history"
          leading={<Search className="size-3.5" />}
          className="flex-1 [&>input]:h-7"
        />
        <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
            className="accent-accent"
          />{" "}
          All connections
        </label>
        <Button
          size="sm"
          variant="ghost"
          disabled={entries.length === 0}
          onClick={() => void clearHistory().then(() => setEntries([]))}
        >
          Clear
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {visible.length === 0 && (
          <div className="p-6 text-center text-[12.5px] text-fg-subtle">No queries yet</div>
        )}
        {visible.map((entry) => (
          <div key={entry.id} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-fg/5">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onInsert(entry.sql)}>
              <pre className="line-clamp-3 font-mono text-[11.5px] leading-snug whitespace-pre-wrap text-fg">
                {entry.sql.trim()}
              </pre>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
                {entry.succeeded ? (
                  <CheckCircle2 className="size-3 text-success" />
                ) : (
                  <XCircle className="size-3 text-danger" />
                )}
                <span>{relativeTime(entry.executedAt)}</span>
                <span>{formatDuration(entry.durationMs)}</span>
                {entry.rowCount !== null && <span>{formatCount(entry.rowCount)}</span>}
              </div>
            </button>
            <IconButton
              label="Delete"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
              onClick={() =>
                void deleteHistoryEntry(entry.id).then(() =>
                  setEntries((e) => e.filter((x) => x.id !== entry.id)),
                )
              }
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SavedQueriesPopover({ onInsert }: { onInsert: (sql: string) => void }) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  useEffect(() => {
    void loadSavedQueries().then(setQueries);
  }, []);
  return (
    <div className="flex max-h-[380px] flex-col">
      <div className="border-b border-line px-3 py-2 text-[12px] font-medium text-fg-muted">
        Saved queries
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {queries.length === 0 && (
          <div className="p-6 text-center text-[12.5px] text-fg-subtle">
            No saved queries. Use the Save button in a query tab.
          </div>
        )}
        {queries.map((query) => (
          <div key={query.id} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-fg/5">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onInsert(query.sql)}>
              <div className="text-[12.5px] font-medium text-fg">{query.name}</div>
              <pre className="line-clamp-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-fg-muted">
                {query.sql.trim()}
              </pre>
            </button>
            <IconButton
              label="Delete"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
              onClick={() =>
                void deleteSavedQuery(query.id).then(() =>
                  setQueries((q) => q.filter((x) => x.id !== query.id)),
                )
              }
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}
