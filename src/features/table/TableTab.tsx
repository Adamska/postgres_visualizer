import { Filter as FilterIcon, Lock, Table2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";

import { EmptyState, ErrorBanner } from "@/components/Primitives";
import { Button, Spinner } from "@/components/ui/Button";
import { changeCount } from "@/core/changes/changeSet";
import { hasActiveFilters } from "@/core/query/tableQuery";
import { DataGrid } from "@/features/grid/DataGrid";
import type { GridActions } from "@/features/grid/types";
import {
  addRow,
  clearFilters,
  clearFocusRequest,
  foreignKeyTarget,
  loadTable,
  setCell,
  sortBy,
  toggleDeleteRows,
} from "@/state/actions/tableTab";
import { openTable } from "@/state/actions/workspace";
import { useSettings } from "@/state/settings";
import { mutateTab, openDialog, useAppStore, type TableTab as TableTabState } from "@/state/store";

import { FilterBar } from "./FilterBar";
import { PaginationBar } from "./PaginationBar";
import { TableToolbar } from "./TableToolbar";
import { buildGridContent } from "./gridContent";

export function TableTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is TableTabState => t.id === tabId && t.kind === "table"),
  );
  const fontSize = useSettings((s) => s.settings.gridFontSize);

  useEffect(() => {
    if (tab && !tab.result && !tab.loading && !tab.error) void loadTable(tabId);
  }, [tabId, tab]);

  const content = useMemo(
    () =>
      buildGridContent(tab?.result ?? null, tab?.structure ?? null, tab?.changes ?? null, tab?.version ?? 0),
    [tab?.result, tab?.structure, tab?.changes, tab?.version],
  );

  const actions = useMemo<GridActions>(
    () => ({
      onSelectionChange: (selection) =>
        mutateTab(tabId, "table", (t) => {
          t.selection = selection;
        }),
      onSortRequest: (column) => void sortBy(tabId, column.name),
      onCommitEdit: (position, value) => setCell(tabId, position.row, position.column, value),
      onOpenEditor: (position) =>
        openDialog({ kind: "valueEditor", tabId, row: position.row, column: position.column }),
      onDeleteRows: (rows) => toggleDeleteRows(tabId, rows),
      onFollowForeignKey: (position) => {
        const current = useAppStore
          .getState()
          .tabs.find((t): t is TableTabState => t.id === tabId && t.kind === "table");
        const target = current ? foreignKeyTarget(current, position.row, position.column) : null;
        if (current && target) openTable(current.connectionId, target.table, [target.filter]);
      },
      onToggleColumnVisibility: (columnId) =>
        mutateTab(tabId, "table", (t) => {
          t.hiddenColumnIds = t.hiddenColumnIds.includes(columnId)
            ? t.hiddenColumnIds.filter((id) => id !== columnId)
            : [...t.hiddenColumnIds, columnId];
        }),
    }),
    [tabId],
  );

  const hiddenColumnIds = useMemo(() => new Set(tab?.hiddenColumnIds ?? []), [tab?.hiddenColumnIds]);
  useEffect(() => {
    if (tab?.focusRequest) {
      const timer = setTimeout(() => clearFocusRequest(tabId), 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [tab?.focusRequest, tabId]);

  if (!tab) return null;
  const sort = tab.query.sort[0];
  const sortState = sort
    ? { columnId: content.columns.findIndex((c) => c.name === sort.column), ascending: sort.ascending }
    : null;
  const filtered = hasActiveFilters(tab.query);
  const editable = tab.structure ? content.columns.some((c) => c.isEditable) : false;

  return (
    <div className="flex h-full flex-col">
      <TableToolbar tab={tab} />
      {tab.filterBarVisible && tab.structure && <FilterBar tab={tab} structure={tab.structure} />}
      {tab.error && <ErrorBanner error={tab.error} />}
      <div className="relative min-h-0 flex-1">
        {tab.loading && !tab.result ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-fg-muted">
            <Spinner className="size-4" /> Loading {tab.query.table.name}…
          </div>
        ) : !tab.result ? (
          <EmptyState icon={<TriangleAlert />} title="Could not load the table">
            <Button onClick={() => void loadTable(tabId)}>Retry</Button>
          </EmptyState>
        ) : (
          <>
            <DataGrid
              content={content}
              sort={sortState && sortState.columnId >= 0 ? sortState : null}
              hiddenColumnIds={hiddenColumnIds}
              focusRequest={tab.focusRequest}
              fontSize={fontSize}
              actions={actions}
              readOnly={!editable}
              className="h-full"
            />
            {content.rows.length === 0 && (
              <div className="pointer-events-none absolute inset-0 top-8">
                <EmptyState
                  icon={filtered ? <FilterIcon /> : <Table2 />}
                  title={filtered ? "No rows match the filters" : "This table is empty"}
                  className="pointer-events-auto"
                >
                  {filtered ? (
                    <Button onClick={() => void clearFilters(tabId)}>Clear filters</Button>
                  ) : (
                    editable && <Button onClick={() => addRow(tabId)}>Add a row</Button>
                  )}
                </EmptyState>
              </div>
            )}
          </>
        )}
        {tab.loading && tab.result && (
          <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent" />
        )}
      </div>
      <PaginationBar tab={tab} />
      {tab.structure && !editable && (
        <div className="flex h-7 items-center gap-1.5 border-t border-line px-3 text-[11.5px] text-fg-muted">
          <Lock className="size-3" />
          {tab.structure.kind === "view" || tab.structure.kind === "materializedView"
            ? "Views are read-only."
            : "No primary key: rows cannot be edited safely."}
          {changeCount(tab.changes) > 0 && " Pending changes were discarded."}
        </div>
      )}
    </div>
  );
}
