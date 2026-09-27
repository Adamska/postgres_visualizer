// Spreadsheet-style aggregates for the selected cells (count, sum, average, min, max…), shown in
// status bars. Clicking a figure copies it.

import { useMemo } from "react";

import { formatStat, selectionStats } from "@/core/stats/selectionStats";
import { copyText } from "@/lib/files";
import { pushToast } from "@/state/store";

import { selectedValues } from "./gridModel";
import type { GridContent, GridSelection } from "./types";

function Stat({ label, value, raw }: { label: string; value: string; raw?: string }) {
  return (
    <button
      type="button"
      title={`Copy ${label.toLowerCase()}`}
      onClick={() => {
        void copyText(raw ?? value);
        pushToast({ tone: "info", title: `Copied ${label.toLowerCase()}: ${value}` });
      }}
      className="flex items-baseline gap-1 rounded px-1 hover:bg-fg/6"
    >
      <span className="text-fg-subtle">{label}</span>
      <span className="font-medium text-fg tabular-nums">{value}</span>
    </button>
  );
}

export function SelectionStats({ content, selection }: { content: GridContent; selection: GridSelection }) {
  const stats = useMemo(() => {
    const values = selectedValues(content, selection);
    return values.length > 1 ? selectionStats(values) : null;
  }, [content, selection]);
  if (!stats) return null;
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11.5px]"
      aria-label="Selection summary"
    >
      <Stat label="Count" value={formatStat(stats.count)} />
      {stats.nulls > 0 && <Stat label="Nulls" value={formatStat(stats.nulls)} />}
      <Stat label="Distinct" value={formatStat(stats.distinct)} />
      {stats.numeric && (
        <>
          <Stat label="Sum" value={formatStat(stats.numeric.sum)} raw={String(stats.numeric.sum)} />
          <Stat label="Avg" value={formatStat(stats.numeric.average)} raw={String(stats.numeric.average)} />
          <Stat label="Min" value={formatStat(stats.numeric.min)} raw={String(stats.numeric.min)} />
          <Stat label="Max" value={formatStat(stats.numeric.max)} raw={String(stats.numeric.max)} />
        </>
      )}
      {stats.temporal && (
        <>
          <Stat label="From" value={stats.temporal.min} />
          <Stat label="To" value={stats.temporal.max} />
        </>
      )}
    </div>
  );
}
