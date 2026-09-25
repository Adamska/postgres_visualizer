import { CheckCircle2, Terminal, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "@/components/Primitives";
import { Kbd, Segmented } from "@/components/ui/Controls";
import { resultSummary } from "@/core/format/values";
import { leadingKeywords } from "@/core/sql/splitter";
import { DataGrid } from "@/features/grid/DataGrid";
import type { GridActions } from "@/features/grid/types";
import { buildGridContent } from "@/features/table/gridContent";
import { selectResult } from "@/state/actions/queryTab";
import { useSettings } from "@/state/settings";
import { mutateTab, openDialog, type QueryTab } from "@/state/store";

export function ResultsPane({ tab }: { tab: QueryTab }) {
  const fontSize = useSettings((s) => s.settings.gridFontSize);
  const rowLimit = useSettings((s) => s.settings.queryRowLimit);
  const result = tab.results[tab.selectedResult];
  const content = useMemo(
    () => buildGridContent(result ?? null, null, null, tab.version),
    [result, tab.version],
  );
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
    }),
    [tab.id],
  );
  const isPlan = result?.columns.length === 1 && result.columns[0]?.name === "QUERY PLAN";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tab.results.length > 1 && (
        <div className="flex shrink-0 items-center px-2 py-1.5">
          <Segmented
            size="sm"
            value={String(tab.selectedResult)}
            onChange={(v) => selectResult(tab.id, Number(v))}
            options={tab.results.map((r, index) => ({
              value: String(index),
              label: `${index + 1} · ${(leadingKeywords(r.columns.length > 0 ? "select" : "ok", 1)[0] ?? "").toUpperCase() || "OK"}`,
            }))}
          />
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {result && result.columns.length > 0 ? (
          isPlan ? (
            <pre className="h-full select-text overflow-auto p-3 font-mono text-[12px] leading-relaxed text-fg">
              {result.rows.map((row) => row[0] ?? "").join("\n")}
            </pre>
          ) : (
            <DataGrid
              content={content}
              hiddenColumnIds={hidden}
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
        <span>{tab.status ?? (result ? resultSummary(result) : "")}</span>
        {result?.truncated && (
          <span className="flex items-center gap-1 text-warning">
            <TriangleAlert className="size-3" /> Only the first {rowLimit.toLocaleString("en-US")} rows are
            shown
          </span>
        )}
        <span className="flex-1" />
        {tab.gridSelection.rows.length > 0 && <span>{tab.gridSelection.rows.length} selected</span>}
      </div>
    </div>
  );
}
