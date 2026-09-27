// Popover profiling one column: nulls, distinct values, a histogram for numbers and dates, and
// the most frequent values (click one to filter on it).

import { BarChart3, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton, Spinner } from "@/components/ui/Button";
import { formatTimeTick } from "@/core/format/temporal";
import { compactCount } from "@/core/format/values";
import { profileColumn, type ColumnProfile, type HistogramBin } from "@/core/stats/columnProfile";
import { formatStat } from "@/core/stats/selectionStats";
import type { Bounds, GridColumn } from "@/features/grid/types";
import { cn } from "@/lib/cn";
import { toAppError, type CellValue } from "@/lib/types";

const WIDTH = 360;

export interface ColumnProfileRequest {
  column: GridColumn;
  bounds: Bounds;
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const value = (part / whole) * 100;
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-surface-sunken px-2.5 py-2">
      <div className="text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">{value}</div>
      {detail && <div className="truncate text-[11px] text-fg-muted">{detail}</div>}
    </div>
  );
}

function Histogram({ bins, label }: { bins: HistogramBin[]; label: (bin: HistogramBin) => string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const active = hovered === null ? null : bins[hovered];
  const first = bins[0];
  const last = bins.at(-1);
  return (
    <div>
      <div className="mb-1 flex h-4 items-center justify-between text-[11px] text-fg-muted">
        <span>Distribution</span>
        {active && (
          <span className="tabular-nums">
            {label(active)} · <span className="font-medium text-fg">{formatStat(active.count)}</span>
          </span>
        )}
      </div>
      <div
        className="flex h-20 items-end gap-[2px] border-b border-line-strong"
        onMouseLeave={() => setHovered(null)}
      >
        {bins.map((bin, i) => (
          <div
            key={i}
            onMouseEnter={() => setHovered(i)}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            role="img"
            aria-label={`${label(bin)}: ${bin.count}`}
          >
            <div
              className={cn(
                "w-full max-w-6 rounded-t-[3px] transition-colors",
                hovered === i ? "bg-accent" : "bg-accent/70",
              )}
              style={{ height: `${Math.max(bin.count > 0 ? 3 : 0, (bin.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-fg-subtle tabular-nums">
        <span>{first ? label({ ...first, to: first.from }) : ""}</span>
        <span>{last ? label({ ...last, from: last.to }) : ""}</span>
      </div>
    </div>
  );
}

function binLabel(profile: ColumnProfile, integers: boolean): (bin: HistogramBin) => string {
  if (profile.temporal) {
    const bins = profile.temporal.histogram;
    const span = (bins.at(-1)?.to ?? 0) - (bins[0]?.from ?? 0);
    return (bin) =>
      bin.from === bin.to
        ? formatTimeTick(bin.from, span)
        : `${formatTimeTick(bin.from, span)} – ${formatTimeTick(bin.to, span)}`;
  }
  return (bin) => {
    if (bin.from === bin.to) return formatStat(bin.from);
    if (integers && bin.to - bin.from === 1) return formatStat(bin.from);
    return `${formatStat(bin.from)} – ${formatStat(bin.to)}`;
  };
}

export function ColumnProfilePopover({
  request,
  load,
  total,
  onFilter,
  onClose,
}: {
  request: ColumnProfileRequest;
  /** Values to profile (a sample of the table, or the loaded result). */
  load: () => Promise<CellValue[]>;
  /** Rows the values were drawn from, when known. */
  total: number | null;
  /** Filters on a value (`null` for NULL); absent for query results. */
  onFilter?: (value: string | null) => void;
  onClose: () => void;
}) {
  const { column, bounds } = request;
  const [profile, setProfile] = useState<ColumnProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    load()
      .then((values) => {
        if (!cancelled) setProfile(profileColumn(values, column.kind));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(toAppError(reason).message);
      });
    return () => {
      cancelled = true;
    };
  }, [load, column.kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onPointer = (event: PointerEvent) => {
      if (card.current && !card.current.contains(event.target as Node)) onClose();
    };
    // Capture phase: the grid swallows Escape before it bubbles.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const position = useMemo(() => {
    const left = Math.max(8, Math.min(bounds.x, window.innerWidth - WIDTH - 8));
    return { left, top: bounds.y + bounds.height + 6 };
  }, [bounds]);

  const sampled = profile?.sampled ?? 0;
  const topMax = Math.max(1, ...(profile?.top.map((t) => t.count) ?? [1]));
  const histogram = profile?.numeric?.histogram ?? profile?.temporal?.histogram ?? [];
  const label = profile ? binLabel(profile, column.kind === "integer") : () => "";

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={`Profile of ${column.name}`}
      style={{ ...position, width: WIDTH, maxHeight: `calc(100vh - ${position.top + 12}px)` }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised/95 text-fg shadow-pop backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-3">
        <BarChart3 className="size-4 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{column.name}</div>
          <div className="truncate font-mono text-[10.5px] text-fg-subtle">{column.typeName}</div>
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="text-[12px] text-danger">{error}</div>
        ) : !profile ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-fg-muted">
            <Spinner className="size-4" /> Profiling…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Tile
                label="Rows"
                value={formatStat(sampled)}
                detail={total !== null && total > sampled ? `sample of ${compactCount(total)}` : undefined}
              />
              <Tile
                label="Null"
                value={percent(profile.nulls, sampled)}
                detail={`${formatStat(profile.nulls)} rows`}
              />
              <Tile
                label="Distinct"
                value={formatStat(profile.distinct)}
                detail={
                  profile.distinct === sampled - profile.nulls && sampled > 1 ? "all unique" : undefined
                }
              />
            </div>
            {profile.numeric && (
              <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                {(
                  [
                    ["Min", profile.numeric.min],
                    ["Median", profile.numeric.median],
                    ["Mean", profile.numeric.mean],
                    ["Max", profile.numeric.max],
                  ] as const
                ).map(([name, value]) => (
                  <div key={name}>
                    <div className="text-fg-subtle">{name}</div>
                    <div className="truncate font-medium tabular-nums">{formatStat(value)}</div>
                  </div>
                ))}
              </div>
            )}
            {profile.temporal && (
              <div className="flex justify-between gap-2 text-[11px]">
                <div className="min-w-0">
                  <div className="text-fg-subtle">Earliest</div>
                  <div className="truncate font-mono">{profile.temporal.min}</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-fg-subtle">Latest</div>
                  <div className="truncate font-mono">{profile.temporal.max}</div>
                </div>
              </div>
            )}
            {histogram.length > 1 && <Histogram bins={histogram} label={label} />}
            {profile.boolean && (
              <div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-fg/8">
                  <div
                    className="bg-success"
                    style={{ width: percent(profile.boolean.trueCount, sampled) }}
                  />
                  <div
                    className="ml-[2px] bg-danger"
                    style={{ width: percent(profile.boolean.falseCount, sampled) }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px]">
                  <span>
                    <span className="font-semibold text-success">TRUE</span>{" "}
                    {percent(profile.boolean.trueCount, sampled)}
                  </span>
                  <span>
                    <span className="font-semibold text-danger">FALSE</span>{" "}
                    {percent(profile.boolean.falseCount, sampled)}
                  </span>
                </div>
              </div>
            )}
            {profile.text && (
              <div className="text-[11px] text-fg-muted">
                Length {formatStat(profile.text.minLength)}–{formatStat(profile.text.maxLength)} characters,
                average {formatStat(profile.text.averageLength)}
              </div>
            )}
            {profile.top.some((entry) => entry.count > 1) && !profile.boolean && (
              <div>
                <div className="mb-1 text-[11px] text-fg-muted">Most frequent</div>
                <div className="flex flex-col">
                  {profile.top.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      disabled={!onFilter}
                      onClick={() => {
                        onFilter?.(entry.value);
                        onClose();
                      }}
                      title={onFilter ? `Filter ${column.name} = ${entry.value}` : entry.value}
                      className="group relative flex h-6 items-center gap-2 rounded px-1.5 text-left text-[11.5px] enabled:hover:bg-fg/6"
                    >
                      <span
                        className="absolute inset-y-1 left-0 rounded-r-[3px] bg-accent/12"
                        style={{ width: `${(entry.count / topMax) * 100}%` }}
                        aria-hidden
                      />
                      <span className="relative min-w-0 flex-1 truncate font-mono">
                        {entry.value === "" ? "(empty)" : entry.value}
                      </span>
                      <span className="relative text-fg-muted tabular-nums">{formatStat(entry.count)}</span>
                      <span className="relative w-10 text-right text-fg-subtle tabular-nums">
                        {percent(entry.count, sampled)}
                      </span>
                    </button>
                  ))}
                  {profile.nulls > 0 && onFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        onFilter(null);
                        onClose();
                      }}
                      className="flex h-6 items-center gap-2 rounded px-1.5 text-left text-[11.5px] text-fg-subtle italic hover:bg-fg/6"
                    >
                      <span className="flex-1">NULL</span>
                      <span className="tabular-nums">{formatStat(profile.nulls)}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            {onFilter && (
              <div className="text-[10.5px] text-fg-subtle">Click a value to filter the table on it.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
