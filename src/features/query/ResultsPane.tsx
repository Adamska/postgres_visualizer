import {
  BarChart3,
  CheckCircle2,
  GitCompare,
  Pin,
  Table2,
  Terminal,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { EmptyState } from "@/components/Primitives";
import { Button, IconButton } from "@/components/ui/Button";
import { Kbd, Segmented, Select } from "@/components/ui/Controls";
import { DropdownMenu } from "@/components/ui/Menu";
import { suggestChart } from "@/core/chart/chart";
import { diffResults } from "@/core/diff/resultDiff";
import { resultSummary } from "@/core/format/values";
import { leadingKeywords } from "@/core/sql/splitter";
import { DataGrid } from "@/features/grid/DataGrid";
import { SelectionStats } from "@/features/grid/SelectionStats";
import type { GridActions } from "@/features/grid/types";
import { ColumnProfilePopover, type ColumnProfileRequest } from "@/features/profile/ColumnProfilePopover";
import { buildGridContent } from "@/features/table/gridContent";
import {
  isPlanResult,
  pinResult,
  selectResult,
  setChart,
  setCompare,
  setFrozenColumns,
  setResultView,
  unpinResult,
} from "@/state/actions/queryTab";
import { useSettings } from "@/state/settings";
import { mutateTab, openDialog, type QueryTab, type ResultView } from "@/state/store";

import { ChartView } from "./ChartView";
import { diffGridContent } from "./diffContent";
import { PlanView } from "./PlanView";

function CompareBar({ tab }: { tab: QueryTab }) {
  const result = tab.results[tab.selectedResult];
  const pinned = tab.pinned.find((p) => p.id === tab.compare?.pinnedId);
  const diff = useMemo(
    () =>
      result && pinned && tab.compare ? diffResults(pinned.result, result, tab.compare.keyColumns) : null,
    [result, pinned, tab.compare],
  );
  if (!diff || !pinned || !tab.compare) return null;
  const keyOptions = [
    { value: "", label: "Whole rows" },
    ...diff.columns.map((name) => ({ value: name, label: name })),
  ];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface-sunken/60 px-3 py-1.5 text-[12px]">
      <GitCompare className="size-4 text-accent" />
      <span className="text-fg-muted">
        Compared with <span className="font-medium text-fg">{pinned.label}</span>
      </span>
      <span className="font-medium text-success">+{diff.added} added</span>
      <span className="font-medium text-danger">−{diff.removed} removed</span>
      <span className="font-medium text-accent">{diff.changed} changed</span>
      <span className="text-fg-subtle">{diff.same} unchanged</span>
      <span className="flex items-center gap-1.5">
        <span className="text-fg-subtle">Match rows on</span>
        <Select
          size="sm"
          value={tab.compare.keyColumns[0] ?? ""}
          onChange={(value) => setCompare(tab.id, pinned.id, value === "" ? [] : [value])}
          options={keyOptions}
          ariaLabel="Key column"
          className="max-w-40"
        />
      </span>
      {diff.duplicateKeys > 0 && (
        <span className="text-warning">{diff.duplicateKeys} duplicate keys matched in order</span>
      )}
      <span className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        icon={<X className="size-3.5" />}
        onClick={() => setCompare(tab.id, null)}
      >
        Stop comparing
      </Button>
    </div>
  );
}

export function ResultsPane({ tab }: { tab: QueryTab }) {
  const fontSize = useSettings((s) => s.settings.gridFontSize);
  const rowLimit = useSettings((s) => s.settings.queryRowLimit);
  const relativeTimes = useSettings((s) => s.settings.relativeTimes);
  const groupDigits = useSettings((s) => s.settings.groupDigits);
  const [profile, setProfile] = useState<ColumnProfileRequest | null>(null);
  const result = tab.results[tab.selectedResult];
  const pinned = tab.pinned.find((p) => p.id === tab.compare?.pinnedId);
  const options = useMemo(() => ({ relativeTimes, groupDigits }), [relativeTimes, groupDigits]);

  const content = useMemo(() => {
    if (result && pinned && tab.compare) {
      return diffGridContent(
        diffResults(pinned.result, result, tab.compare.keyColumns),
        result.columns,
        tab.version,
      );
    }
    return buildGridContent(result ?? null, null, null, tab.version, options);
  }, [result, pinned, tab.compare, tab.version, options]);
  const hidden = useMemo(() => new Set(tab.hiddenColumnIds), [tab.hiddenColumnIds]);
  const actions = useMemo<GridActions>(
    () => ({
      onSelectionChange: (selection) =>
        mutateTab(tab.id, "query", (t) => {
          t.gridSelection = selection;
        }),
      onOpenEditor: (position) =>
        openDialog({ kind: "valueEditor", tabId: tab.id, row: position.row, column: position.column }),
      onToggleColumnVisibility: (columnId) =>
        mutateTab(tab.id, "query", (t) => {
          t.hiddenColumnIds = t.hiddenColumnIds.includes(columnId)
            ? t.hiddenColumnIds.filter((id) => id !== columnId)
            : [...t.hiddenColumnIds, columnId];
        }),
      onFreezeColumns: (count) => setFrozenColumns(tab.id, count),
      onColumnProfile: (column, bounds) => setProfile({ column, bounds }),
    }),
    [tab.id],
  );
  const profileIndex = profile?.column.id;
  const loadProfile = useCallback(
    () => Promise.resolve(result?.rows.map((row) => row[profileIndex ?? 0] ?? null) ?? []),
    [result, profileIndex],
  );

  const plan = isPlanResult(result);
  const chartable = result ? suggestChart(result.columns) !== null : false;
  const views: { value: ResultView; label: React.ReactNode }[] = [
    { value: "grid", label: <Table2 className="size-3.5" aria-label="Grid" /> },
  ];
  if (chartable) views.push({ value: "chart", label: <BarChart3 className="size-3.5" aria-label="Chart" /> });
  if (plan) views.push({ value: "plan", label: <Workflow className="size-3.5" aria-label="Plan" /> });
  const view: ResultView = views.some((v) => v.value === tab.resultView) ? tab.resultView : "grid";
  const hasRows = result !== undefined && result.columns.length > 0;
  // Pinning and comparing make sense for rows, not for a plan.
  const showBar = hasRows && !plan;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {(tab.results.length > 1 || hasRows || tab.pinned.length > 0) && (
        <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
          {tab.results.length > 1 && (
            <Segmented
              size="sm"
              value={String(tab.selectedResult)}
              onChange={(v) => selectResult(tab.id, Number(v))}
              options={tab.results.map((r, index) => ({
                value: String(index),
                label: `${index + 1} · ${(leadingKeywords(r.columns.length > 0 ? "select" : "ok", 1)[0] ?? "").toUpperCase() || "OK"}`,
              }))}
            />
          )}
          {tab.pinned.map((pin) => (
            <span
              key={pin.id}
              className={
                tab.compare?.pinnedId === pin.id
                  ? "flex h-6 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-2 text-[11px] text-accent"
                  : "flex h-6 items-center gap-1 rounded-full bg-fg/6 pr-1 pl-2 text-[11px] text-fg-muted"
              }
              title={pin.sql}
            >
              <Pin className="size-3" />
              {pin.label}
              <button
                type="button"
                aria-label="Unpin"
                onClick={() => unpinResult(tab.id, pin.id)}
                className="flex size-4 items-center justify-center rounded-full hover:bg-fg/10"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <span className="flex-1" />
          {showBar && (
            <>
              {tab.pinned.length > 0 && (
                <DropdownMenu
                  trigger={
                    <Button size="sm" variant="ghost" icon={<GitCompare className="size-3.5" />}>
                      Compare
                    </Button>
                  }
                  items={tab.pinned.map((pin) => ({
                    id: pin.id,
                    label: `With ${pin.label}`,
                    checked: tab.compare?.pinnedId === pin.id,
                    onSelect: () =>
                      setCompare(tab.id, pin.id, result.columns[0] ? [result.columns[0].name] : []),
                  }))}
                  align="end"
                />
              )}
              <IconButton
                label="Pin this result to compare later runs"
                size="sm"
                onClick={() => pinResult(tab.id)}
              >
                <Pin className="size-3.5" />
              </IconButton>
            </>
          )}
          {hasRows && views.length > 1 && !tab.compare && (
            <Segmented<ResultView>
              size="sm"
              value={view}
              onChange={(v) => setResultView(tab.id, v)}
              options={views}
            />
          )}
        </div>
      )}
      <CompareBar tab={tab} />
      <div className="relative min-h-0 flex-1">
        {result && result.columns.length > 0 ? (
          view === "plan" && !tab.compare ? (
            <PlanView result={result} />
          ) : view === "chart" && !tab.compare ? (
            <ChartView result={result} spec={tab.chart} onChange={(spec) => setChart(tab.id, spec)} />
          ) : (
            <DataGrid
              content={content}
              hiddenColumnIds={hidden}
              frozenColumns={tab.frozenColumns}
              fontSize={fontSize}
              actions={actions}
              readOnly
              className="h-full"
            />
          )
        ) : result ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title={resultSummary(result)}
            message="The statement returned no rows."
          />
        ) : tab.error ? null : (
          <EmptyState icon={<Terminal />} title="Run a query">
            <span className="flex items-center gap-1 text-[12px] text-fg-muted">
              <Kbd>⌘</Kbd>
              <Kbd>↩</Kbd> runs the statement under the caret · <Kbd>⇧</Kbd>
              <Kbd>⌘</Kbd>
              <Kbd>↩</Kbd> runs everything
            </span>
          </EmptyState>
        )}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-[11.5px] text-fg-muted">
        <span className="shrink-0">{tab.status ?? (result ? resultSummary(result) : "")}</span>
        {result?.truncated && (
          <span className="flex shrink-0 items-center gap-1 text-warning">
            <TriangleAlert className="size-3" /> Only the first {rowLimit.toLocaleString("en-US")} rows are
            shown
          </span>
        )}
        <span className="min-w-0 flex-1">
          {view === "grid" && <SelectionStats content={content} selection={tab.gridSelection} />}
        </span>
        {tab.gridSelection.rows.length > 1 && <span>{tab.gridSelection.rows.length} selected</span>}
      </div>
      {profile && result && (
        <ColumnProfilePopover
          request={profile}
          load={loadProfile}
          total={result.truncated ? null : result.rows.length}
          onClose={() => setProfile(null)}
        />
      )}
    </div>
  );
}
