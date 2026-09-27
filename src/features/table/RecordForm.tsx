// Form view of a table: one record at a time, every field editable, with the records it
// references and the records referencing it alongside.

import { ChevronDown, ChevronUp, FileQuestion } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/Primitives";
import { IconButton } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Controls";
import { FieldRow } from "@/features/inspector/FieldRow";
import { RelatedRecords } from "@/features/related/RelatedRecords";
import { cellValue, isTabEditable, rowRecord, setCell } from "@/state/actions/tableTab";
import { mutateTab, openDialog, type TableTab } from "@/state/store";

/** Referencing rows listed per table in the form view. */
const RELATED_SAMPLE = 5;

function selectRow(tabId: string, row: number): void {
  mutateTab(tabId, "table", (t) => {
    t.selection = { rows: [row], focused: { row, column: t.selection.focused?.column ?? 0 }, range: null };
  });
}

export function RecordForm({ tab }: { tab: TableTab }) {
  const result = tab.result;
  const count = (result?.rows.length ?? 0) + tab.changes.inserts.length;
  const current = Math.min(tab.selection.focused?.row ?? tab.selection.rows[0] ?? 0, Math.max(0, count - 1));
  const editable = isTabEditable(tab);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if ((event.key === "ArrowDown" || event.key === "j") && current < count - 1) {
        event.preventDefault();
        selectRow(tab.id, current + 1);
      } else if ((event.key === "ArrowUp" || event.key === "k") && current > 0) {
        event.preventDefault();
        selectRow(tab.id, current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab.id, current, count]);

  if (!result || count === 0) {
    return <EmptyState icon={<FileQuestion />} title="No record to show" />;
  }
  const inserted = current >= result.rows.length;
  const page = tab.query.page * tab.query.pageSize;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
          <IconButton
            label="Previous record (↑)"
            size="sm"
            disabled={current === 0}
            onClick={() => selectRow(tab.id, current - 1)}
          >
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton
            label="Next record (↓)"
            size="sm"
            disabled={current >= count - 1}
            onClick={() => selectRow(tab.id, current + 1)}
          >
            <ChevronDown className="size-4" />
          </IconButton>
          <span className="text-[12.5px] font-medium">
            {inserted ? "New record" : `Record ${(page + current + 1).toLocaleString("en-US")}`}
          </span>
          <span className="text-[12px] text-fg-subtle">
            {current + 1} of {count} on this page
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> browse
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl py-2">
            {result.columns.map((column, index) => {
              const info = tab.structure?.columns.find((c) => c.name === column.name);
              return (
                <FieldRow
                  key={column.name}
                  column={column}
                  typeName={info?.typeName ?? column.typeName}
                  kind={info?.kind ?? column.kind}
                  value={cellValue(tab, current, index)}
                  editable={editable && info !== undefined && !info.isGenerated}
                  nullable={info?.isNullable ?? true}
                  onCommit={(value) => setCell(tab.id, current, index, value)}
                  onOpenEditor={() =>
                    openDialog({ kind: "valueEditor", tabId: tab.id, row: current, column: index })
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
      {tab.structure && (tab.structure.foreignKeys.length > 0 || tab.structure.referencedBy.length > 0) && (
        <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-line bg-surface-sunken/40 p-4">
          {inserted ? (
            <div className="text-[12px] text-fg-muted">Related records appear once the row is committed.</div>
          ) : (
            <RelatedRecords
              tabId={tab.id}
              connectionId={tab.connectionId}
              structure={tab.structure}
              record={rowRecord(tab, current)}
              sampleRows={RELATED_SAMPLE}
            />
          )}
        </aside>
      )}
    </div>
  );
}
