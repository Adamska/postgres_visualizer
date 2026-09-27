// Records related to a row: what its foreign keys point at ("References") and which rows of other
// tables point at it ("Referenced by"). Click to open in place, ⌘-click for a new tab.

import { ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Spinner } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { gridText } from "@/core/format/values";
import { displayName } from "@/core/sql/quote";
import { cn } from "@/lib/cn";
import type { CellValue, QueryResult, TableStructure } from "@/lib/types";
import { loadRelated, type RelatedRecords as Related } from "@/state/actions/related";
import { openRelated } from "@/state/actions/tableTab";

function MiniRows({ result, limit }: { result: QueryResult; limit: number }) {
  const columns = result.columns.slice(0, 6);
  return (
    <div className="mt-1.5 overflow-x-auto rounded-md border border-line">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-surface-sunken text-left text-fg-muted">
            {columns.map((column, i) => (
              <th key={`${column.name}-${i}`} className="px-2 py-1 font-medium whitespace-nowrap">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, limit).map((row, r) => (
            <tr key={r} className="border-t border-line">
              {columns.map((column, i) => (
                <td
                  key={`${column.name}-${i}`}
                  className={cn(
                    "max-w-48 truncate px-2 py-1 font-mono whitespace-nowrap",
                    row[i] === null && "text-fg-subtle italic",
                  )}
                >
                  {gridText(row[i] ?? null, column.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fields({ result }: { result: QueryResult }) {
  const row = result.rows[0];
  if (!row) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
      {result.columns.slice(0, 4).map((column, i) => (
        <div key={`${column.name}-${i}`} className="contents">
          <dt className="truncate text-fg-subtle">{column.name}</dt>
          <dd className={cn("truncate font-mono", row[i] === null && "text-fg-subtle italic")}>
            {gridText(row[i] ?? null, column.kind)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RelatedRecords({
  tabId,
  connectionId,
  structure,
  record,
  sampleRows,
}: {
  tabId: string;
  connectionId: string;
  structure: TableStructure;
  record: Record<string, CellValue | undefined>;
  /** Referencing rows shown per table (0 shows counts only). */
  sampleRows: number;
}) {
  const [related, setRelated] = useState<Related | null>(null);
  // Reload only when a key column changes, not on every edit of the row.
  const keyColumns = useMemo(
    () => [
      ...new Set([
        ...structure.foreignKeys.flatMap((k) => k.columns),
        ...structure.referencedBy.flatMap((k) => k.referencedColumns),
      ]),
    ],
    [structure],
  );
  const signature = JSON.stringify(keyColumns.map((column) => record[column] ?? null));

  useEffect(() => {
    let cancelled = false;
    setRelated(null);
    const values = JSON.parse(signature) as (string | null)[];
    const keyed = Object.fromEntries(keyColumns.map((column, i) => [column, values[i] ?? null]));
    const timer = setTimeout(() => {
      void loadRelated(connectionId, structure, keyed, sampleRows).then((result) => {
        if (!cancelled) setRelated(result);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connectionId, structure, signature, keyColumns, sampleRows]);

  if (structure.foreignKeys.length === 0 && structure.referencedBy.length === 0) return null;
  const open =
    (table: Parameters<typeof openRelated>[1], filters: Parameters<typeof openRelated>[2]) =>
    (event: React.MouseEvent) =>
      void openRelated(tabId, table, filters, event.metaKey || event.ctrlKey);

  return (
    <div className="flex flex-col gap-3">
      {!related && (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted">
          <Spinner className="size-3.5" /> Loading related records…
        </div>
      )}
      {related && related.outgoing.length > 0 && (
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
            <ArrowUpRight className="size-3.5" /> References
          </h3>
          <div className="flex flex-col gap-1.5">
            {related.outgoing.map((relation) => (
              <button
                key={relation.key.name}
                type="button"
                onClick={open(relation.table, relation.filters)}
                title="Open (⌘-click for a new tab)"
                className="rounded-lg border border-line px-2.5 py-2 text-left hover:border-accent/50 hover:bg-accent-soft/40"
              >
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span className="font-medium">{displayName(relation.table)}</span>
                  <span className="truncate font-mono text-[10.5px] text-fg-subtle">
                    via {relation.key.columns.join(", ")}
                  </span>
                </div>
                {relation.result ? (
                  <Fields result={relation.result} />
                ) : (
                  <div className="mt-0.5 text-[11px] text-warning">Referenced row not found</div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {related && related.incoming.length > 0 && (
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
            <ArrowDownLeft className="size-3.5" /> Referenced by
          </h3>
          <div className="flex flex-col gap-1.5">
            {related.incoming.map((relation) => (
              <div
                key={`${relation.key.schema}.${relation.key.name}`}
                className="rounded-lg border border-line px-2.5 py-2"
              >
                <button
                  type="button"
                  disabled={relation.count === 0}
                  onClick={open(relation.table, relation.filters)}
                  title="Open these rows (⌘-click for a new tab)"
                  className="flex w-full items-center gap-1.5 text-left text-[12px] enabled:hover:text-accent disabled:opacity-60"
                >
                  <Link2 className="size-3.5 shrink-0 text-fg-subtle" />
                  <span className="font-medium">{displayName(relation.table)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-subtle">
                    .{relation.key.columns.join(", ")}
                  </span>
                  <Badge tone={relation.count ? "accent" : "neutral"}>
                    {relation.count === null ? "?" : relation.count.toLocaleString("en-US")}{" "}
                    {relation.count === 1 ? "row" : "rows"}
                  </Badge>
                </button>
                {relation.result && relation.result.rows.length > 0 && (
                  <MiniRows result={relation.result} limit={sampleRows} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
