// Right-hand panel listing every column of the focused row.

import { Copy, PanelRightClose, ScanSearch } from "lucide-react";

import { EmptyState } from "@/components/Primitives";
import { IconButton } from "@/components/ui/Button";
import { exportJson } from "@/core/exchange/export";
import { RelatedRecords } from "@/features/related/RelatedRecords";
import { copyText } from "@/lib/files";
import { cellValue, isTabEditable, rowRecord, setCell } from "@/state/actions/tableTab";
import { mutate, openDialog, useAppStore, type QueryTab, type TableTab } from "@/state/store";

import { FieldRow } from "./FieldRow";

export function Inspector() {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const close = () =>
    mutate((draft) => {
      draft.inspectorOpen = false;
    });
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line/70 bg-surface">
      <div className="flex h-[52px] shrink-0 items-center justify-between pr-2 pl-4" data-tauri-drag-region>
        <span className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">Row</span>
        <IconButton label="Close inspector (⌥⌘I)" size="sm" onClick={close}>
          <PanelRightClose className="size-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line/70">
        {tab?.kind === "table" ? (
          <TableRowInspector tab={tab} />
        ) : tab?.kind === "query" ? (
          <QueryRowInspector tab={tab} />
        ) : (
          <NoRow />
        )}
      </div>
    </aside>
  );
}

function NoRow() {
  return (
    <EmptyState
      icon={<ScanSearch />}
      title="No row selected"
      message="Click a cell to inspect the whole row here."
    />
  );
}

function TableRowInspector({ tab }: { tab: TableTab }) {
  const row = tab.selection.focused?.row ?? tab.selection.rows[0];
  if (row === undefined || !tab.result) return <NoRow />;
  const rowCount = tab.result.rows.length + tab.changes.inserts.length;
  if (row >= rowCount) return <NoRow />;
  const editable = isTabEditable(tab);
  const values = tab.result.columns.map((_, index) => cellValue(tab, row, index) ?? null);
  const inserted = row >= tab.result.rows.length;
  return (
    <>
      <Header
        title={`Row ${row + 1}`}
        subtitle={tab.query.table.name}
        onCopy={() => void copyText(exportJson(tab.result?.columns ?? [], [values]))}
      />
      {tab.result.columns.map((column, index) => {
        const info = tab.structure?.columns.find((c) => c.name === column.name);
        return (
          <FieldRow
            key={column.name}
            column={column}
            typeName={info?.typeName ?? column.typeName}
            kind={info?.kind ?? column.kind}
            value={cellValue(tab, row, index)}
            editable={editable && info !== undefined && !info.isGenerated}
            nullable={info?.isNullable ?? true}
            onCommit={(value) => setCell(tab.id, row, index, value)}
            onOpenEditor={() => openDialog({ kind: "valueEditor", tabId: tab.id, row, column: index })}
          />
        );
      })}
      {tab.structure && !inserted && (
        <div className="border-t border-line/70 px-4 py-3">
          <RelatedRecords
            tabId={tab.id}
            connectionId={tab.connectionId}
            structure={tab.structure}
            record={rowRecord(tab, row)}
            sampleRows={0}
          />
        </div>
      )}
    </>
  );
}

function QueryRowInspector({ tab }: { tab: QueryTab }) {
  const result = tab.results[tab.selectedResult];
  const row = tab.gridSelection.focused?.row ?? tab.gridSelection.rows[0];
  const values = row === undefined ? undefined : result?.rows[row];
  if (!result || row === undefined || !values) return <NoRow />;
  return (
    <>
      <Header
        title={`Row ${row + 1}`}
        subtitle="query result"
        onCopy={() => void copyText(exportJson(result.columns, [values]))}
      />
      {result.columns.map((column, index) => (
        <FieldRow
          key={`${column.name}-${index}`}
          column={column}
          typeName={column.typeName}
          kind={column.kind}
          value={values[index] ?? null}
          editable={false}
          nullable
          onCommit={() => undefined}
          onOpenEditor={() => undefined}
        />
      ))}
    </>
  );
}

function Header({ title, subtitle, onCopy }: { title: string; subtitle: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="truncate text-[11.5px] text-fg-subtle">{subtitle}</div>
      </div>
      <IconButton label="Copy row as JSON" size="sm" onClick={onCopy}>
        <Copy className="size-3.5" />
      </IconButton>
    </div>
  );
}
