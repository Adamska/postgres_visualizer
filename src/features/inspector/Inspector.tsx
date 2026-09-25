// Right-hand panel listing every column of the focused row.

import { Braces, Copy, MoreHorizontal, PanelRightClose, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/Primitives";
import { IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import { DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import type { EditValue } from "@/core/changes/changeSet";
import { exportJson } from "@/core/exchange/export";
import { booleanLabel, booleanValue, detailText, prefersLargeEditor } from "@/core/format/values";
import { jsonValueOf } from "@/core/json/tree";
import { JsonViewer } from "@/features/json/JsonViewer";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/files";
import type { CellValue, ResultColumn, ValueKind } from "@/lib/types";
import { cellValue, setCell } from "@/state/actions/tableTab";
import { mutate, openDialog, useAppStore, type QueryTab, type TableTab } from "@/state/store";

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
  const editable =
    tab.structure !== null &&
    tab.structure.columns.some((c) => c.isPrimaryKey) &&
    tab.structure.kind !== "view" &&
    tab.structure.kind !== "materializedView";
  const values = tab.result.columns.map((_, index) => cellValue(tab, row, index) ?? null);
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

function FieldRow({
  column,
  typeName,
  kind,
  value,
  editable,
  nullable,
  onCommit,
  onOpenEditor,
}: {
  column: ResultColumn;
  typeName: string;
  kind: ValueKind;
  value: CellValue | undefined;
  editable: boolean;
  nullable: boolean;
  onCommit: (value: EditValue) => void;
  onOpenEditor: () => void;
}) {
  const isNull = value === null;
  const isDefault = value === undefined;
  const [draft, setDraft] = useState(value ?? "");
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);
  const json = useMemo(() => jsonValueOf(value, kind), [value, kind]);
  const boolean = kind === "boolean" ? booleanValue(value) : null;
  const inline =
    editable &&
    json === undefined &&
    kind !== "boolean" &&
    !prefersLargeEditor(kind) &&
    !(value ?? "").includes("\n");
  const commit = () => {
    if (draft !== (value ?? "") || (isNull && draft !== "")) onCommit({ kind: "text", value: draft });
  };
  const items: MenuItem[] = [
    { id: "null", label: "Set NULL", disabled: !nullable, onSelect: () => onCommit({ kind: "null" }) },
    { id: "default", label: "Set DEFAULT", onSelect: () => onCommit({ kind: "default" }) },
    { id: "edit", label: "Edit in window…", separatorBefore: true, onSelect: onOpenEditor },
  ];
  return (
    <div className="border-t border-line/70 px-4 py-2.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-fg-muted">{column.name}</span>
        <span className="truncate font-mono text-[10.5px] text-fg-subtle">{typeName}</span>
        <span className="flex-1" />
        {json !== undefined && (
          <IconButton
            label={showRaw ? "Show as tree" : "Show raw JSON"}
            size="sm"
            active={!showRaw}
            className={cn("size-6", !editable && "-mr-2")}
            onClick={() => setShowRaw((current) => !current)}
          >
            <Braces className="size-3.5" />
          </IconButton>
        )}
        {editable && (
          <DropdownMenu
            trigger={
              <IconButton label="Field actions" size="sm" className="-mr-2 size-6">
                <MoreHorizontal className="size-3.5" />
              </IconButton>
            }
            items={items}
            align="end"
          />
        )}
      </div>
      {kind === "boolean" && !isDefault && (editable || boolean !== null) ? (
        <BooleanField
          value={boolean}
          editable={editable}
          onChange={(next) => onCommit({ kind: "text", value: next ? "true" : "false" })}
        />
      ) : json !== undefined && !showRaw ? (
        <div
          onDoubleClick={() => editable && onOpenEditor()}
          className="max-h-72 overflow-auto rounded-md bg-surface-sunken px-1 py-1"
        >
          <JsonViewer value={json} columnName={column.name} dense />
        </div>
      ) : inline ? (
        <Input
          value={draft}
          placeholder={isDefault ? "DEFAULT" : "NULL"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          mono
          className={cn("[&>input]:h-7", (isNull || isDefault) && draft === "" && "[&>input]:italic")}
        />
      ) : (
        <pre
          onDoubleClick={() => editable && onOpenEditor()}
          className={cn(
            "max-h-48 select-text overflow-auto rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap",
            (isNull || isDefault) && "text-fg-subtle italic",
          )}
        >
          {isDefault ? "DEFAULT" : detailText(value, kind)}
        </pre>
      )}
    </div>
  );
}

function BooleanField({
  value,
  editable,
  onChange,
}: {
  value: boolean | null;
  editable: boolean;
  onChange: (value: boolean) => void;
}) {
  if (!editable) {
    return (
      <div className="px-0.5 py-1 font-mono text-[11.5px] font-semibold">
        {value === null ? (
          <span className="text-fg-subtle italic">NULL</span>
        ) : (
          <span className={value ? "text-success" : "text-danger"}>{booleanLabel(value)}</span>
        )}
      </div>
    );
  }
  return (
    <Segmented<"true" | "false" | "null">
      size="sm"
      value={value === null ? "null" : value ? "true" : "false"}
      onChange={(next) => next !== "null" && onChange(next === "true")}
      options={[
        { value: "true", label: <span className="text-success">TRUE</span> },
        { value: "false", label: <span className="text-danger">FALSE</span> },
        ...(value === null ? [{ value: "null" as const, label: <span className="italic">NULL</span> }] : []),
      ]}
    />
  );
}
