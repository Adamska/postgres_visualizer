// Hover card for grid cells: the row a foreign key points at, or the picture behind an image URL.

import { ArrowUpRight, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/Button";
import { gridText } from "@/core/format/values";
import { displayName } from "@/core/sql/quote";
import type { Bounds } from "@/features/grid/types";
import type { QueryResult, TableRef } from "@/lib/types";

export type PeekTarget =
  | { kind: "row"; bounds: Bounds; table: TableRef; load: () => Promise<QueryResult | null> }
  | { kind: "image"; bounds: Bounds; url: string };

const WIDTH = 320;
const MAX_FIELDS = 8;

function place(bounds: Bounds, height: number): { left: number; top: number } {
  const left = Math.max(8, Math.min(bounds.x, window.innerWidth - WIDTH - 8));
  const below = bounds.y + bounds.height + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, bounds.y - height - 4) : below;
  return { left, top };
}

function RowPeek({ target }: { target: Extract<PeekTarget, { kind: "row" }> }) {
  const [state, setState] = useState<{ result: QueryResult | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    target
      .load()
      .then((result) => !cancelled && setState({ result }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [target]);
  const result = state?.result;
  const row = result?.rows[0];
  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-fg-muted">
        <ArrowUpRight className="size-3.5 text-accent" />
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{displayName(target.table)}</span>
        <span className="text-[10.5px] text-fg-subtle">⌘-click to open</span>
      </div>
      <div className="px-3 py-2">
        {failed ? (
          <div className="text-[12px] text-danger">Could not load the referenced row.</div>
        ) : state === null ? (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Spinner className="size-3.5" /> Loading…
          </div>
        ) : !result || !row ? (
          <div className="text-[12px] text-fg-muted">No matching row.</div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            {result.columns.slice(0, MAX_FIELDS).map((column, i) => (
              <div key={`${column.name}-${i}`} className="contents">
                <dt className="truncate text-fg-subtle">{column.name}</dt>
                <dd className={row[i] === null ? "truncate text-fg-subtle italic" : "truncate font-mono"}>
                  {gridText(row[i] ?? null, column.kind)}
                </dd>
              </div>
            ))}
            {result.columns.length > MAX_FIELDS && (
              <div className="col-span-2 text-[10.5px] text-fg-subtle">
                +{result.columns.length - MAX_FIELDS} more columns
              </div>
            )}
          </dl>
        )}
      </div>
    </>
  );
}

function ImagePeek({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center justify-center p-2">
      {failed ? (
        <div className="flex items-center gap-2 py-6 text-[12px] text-fg-muted">
          <ImageOff className="size-4" /> Could not load the image.
        </div>
      ) : (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="max-h-56 max-w-full rounded-md object-contain"
        />
      )}
    </div>
  );
}

/** Floating, non-interactive card next to the hovered cell. */
export function CellPeek({ target }: { target: PeekTarget }) {
  const position = place(target.bounds, target.kind === "image" ? 240 : 220);
  return (
    <div
      role="tooltip"
      style={{ ...position, width: WIDTH }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-line bg-surface-raised/95 text-fg shadow-pop backdrop-blur-xl"
    >
      {target.kind === "row" ? <RowPeek target={target} /> : <ImagePeek url={target.url} />}
    </div>
  );
}
