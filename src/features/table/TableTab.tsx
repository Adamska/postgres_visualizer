import { Filter as FilterIcon, Lock, Table2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ErrorBanner } from "@/components/Primitives";
import { Button, Spinner } from "@/components/ui/Button";
import { changeCount } from "@/core/changes/changeSet";
import { hasActiveFilters, newFilter } from "@/core/query/tableQuery";
import { DataGrid } from "@/features/grid/DataGrid";
import {
  EMPTY_LAYOUT,
  freezeColumns,
  reorderColumns,
  resizeColumn,
  toGridLayout,
  toggleHidden,
} from "@/features/grid/columnLayout";
import type { GridActions, GridContent } from "@/features/grid/types";
import { ColumnProfilePopover, type ColumnProfileRequest } from "@/features/profile/ColumnProfilePopover";
import {
  addFilterAndApply,
  addRow,
  clearFilters,
  clearFocusRequest,
  filterByValue,
  followForeignKey,
  foreignKeyTarget,
  isReadOnlyConnection,
  isTabEditable,
  loadColumnSample,
  loadTable,
  lookupRow,
  setCell,
  sortBy,
  toggleDeleteRows,
  updateLayout,
} from "@/state/actions/tableTab";
import { useSettings } from "@/state/settings";
import { findTab, mutateTab, openDialog, useAppStore, type TableTab as TableTabState } from "@/state/store";

import { CellPeek, type PeekTarget } from "./CellPeek";
import { FilterBar } from "./FilterBar";
import { PaginationBar } from "./PaginationBar";
import { RecordForm } from "./RecordForm";
import { TableToolbar } from "./TableToolbar";
import { buildGridContent } from "./gridContent";

/** Delay before a hover card appears, so moving across the grid does not flash them. */
const PEEK_DELAY_MS = 450;

export function TableTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is TableTabState => t.id === tabId && t.kind === "table"),
  );
  const fontSize = useSettings((s) => s.settings.gridFontSize);
  const relativeTimes = useSettings((s) => s.settings.relativeTimes);
  const groupDigits = useSettings((s) => s.settings.groupDigits);
  const [profile, setProfile] = useState<ColumnProfileRequest | null>(null);
  const [peek, setPeek] = useState<PeekTarget | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tab && !tab.result && !tab.loading && !tab.error) void loadTable(tabId);
  }, [tabId, tab]);

  const options = useMemo(() => ({ relativeTimes, groupDigits }), [relativeTimes, groupDigits]);
  const content = useMemo(
    () =>
      buildGridContent(
        tab?.result ?? null,
        tab?.structure ?? null,
        tab?.changes ?? null,
        tab?.version ?? 0,
        options,
      ),
    [tab?.result, tab?.structure, tab?.changes, tab?.version, options],
  );
  const contentRef = useRef<GridContent>(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  const layout = useMemo(
    () => toGridLayout(content.columns, tab?.layout ?? EMPTY_LAYOUT),
    [content.columns, tab?.layout],
  );

  const showPeek = useCallback(
    (hover: Parameters<NonNullable<GridActions["onCellHover"]>>[0]) => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
      setPeek(null);
      if (!hover) return;
      const current = findTab(tabId, "table");
      const column = contentRef.current.columns[hover.position.column];
      const cell = contentRef.current.rows[hover.position.row]?.cells[hover.position.column];
      if (!current || !column || !cell || cell.isNull || cell.isDefault) return;
      let target: PeekTarget | null = null;
      if (cell.rich?.kind === "image") {
        target = { kind: "image", bounds: hover.bounds, url: cell.rich.text };
      } else if (column.isForeignKey) {
        const fk = foreignKeyTarget(current, hover.position.row, hover.position.column);
        if (fk) {
          target = {
            kind: "row",
            bounds: hover.bounds,
            table: fk.table,
            load: () => lookupRow(current.connectionId, fk.table, fk.key.referencedColumns, fk.values),
          };
        }
      }
      if (target) {
        const next = target;
        peekTimer.current = setTimeout(() => setPeek(next), PEEK_DELAY_MS);
      }
    },
    [tabId],
  );
  useEffect(
    () => () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    },
    [],
  );

  const actions = useMemo<GridActions>(() => {
    const nameOf = (id: number) => contentRef.current.columns.find((c) => c.id === id)?.name;
    return {
      onSelectionChange: (selection) =>
        mutateTab(tabId, "table", (t) => {
          t.selection = selection;
        }),
      onSortRequest: (column) => void sortBy(tabId, column.name),
      onCommitEdit: (position, value) => setCell(tabId, position.row, position.column, value),
      onOpenEditor: (position) =>
        openDialog({ kind: "valueEditor", tabId, row: position.row, column: position.column }),
      onDeleteRows: (rows) => toggleDeleteRows(tabId, rows),
      onFollowForeignKey: (position, newTab) => {
        setPeek(null);
        void followForeignKey(tabId, position.row, position.column, newTab);
      },
      onToggleColumnVisibility: (columnId) => {
        const name = nameOf(columnId);
        if (name !== undefined) updateLayout(tabId, (l) => toggleHidden(l, name));
      },
      onColumnResize: (columnId, width) => {
        const name = nameOf(columnId);
        if (name !== undefined) updateLayout(tabId, (l) => resizeColumn(l, name, width));
      },
      onColumnMove: (order) =>
        updateLayout(tabId, (l) => reorderColumns(l, contentRef.current.columns, order)),
      onFreezeColumns: (count) => updateLayout(tabId, (l) => freezeColumns(l, count)),
      onColumnProfile: (column, bounds) => {
        setPeek(null);
        setProfile({ column, bounds });
      },
      onCellHover: showPeek,
      onFilterValue: (position, filter) => void filterByValue(tabId, position.row, position.column, filter),
    };
  }, [tabId, showPeek]);

  const profileColumn = profile?.column.name;
  const loadProfile = useCallback(() => loadColumnSample(tabId, profileColumn ?? ""), [tabId, profileColumn]);

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
  const editable = isTabEditable(tab);
  const readOnlyConnection = isReadOnlyConnection(tab.connectionId);

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
        ) : tab.viewMode === "form" ? (
          <RecordForm tab={tab} />
        ) : (
          <>
            <DataGrid
              content={content}
              sort={sortState && sortState.columnId >= 0 ? sortState : null}
              hiddenColumnIds={layout.hidden}
              columnOrder={layout.order}
              columnWidths={layout.widths}
              frozenColumns={layout.frozen}
              highlight={tab.query.search}
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
      <PaginationBar tab={tab} content={content} />
      {tab.structure && !editable && (
        <div className="flex h-7 items-center gap-1.5 border-t border-line px-3 text-[11.5px] text-fg-muted">
          <Lock className="size-3" />
          {readOnlyConnection
            ? "Read-only connection: changes are disabled."
            : tab.structure.kind === "view" || tab.structure.kind === "materializedView"
              ? "Views are read-only."
              : "No primary key: rows cannot be edited safely."}
          {changeCount(tab.changes) > 0 && " Pending changes were discarded."}
        </div>
      )}
      {profile && (
        <ColumnProfilePopover
          request={profile}
          load={loadProfile}
          total={tab.totalCount}
          onFilter={(value) =>
            void addFilterAndApply(
              tabId,
              value === null
                ? newFilter(profile.column.name, "isNull")
                : newFilter(profile.column.name, "equals", value),
            )
          }
          onClose={() => setProfile(null)}
        />
      )}
      {peek && <CellPeek target={peek} />}
    </div>
  );
}
