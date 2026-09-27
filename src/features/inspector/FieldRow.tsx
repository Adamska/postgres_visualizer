// One field of a row, editable in place: text input, boolean switch, JSON tree or read-only text.

import { Braces, MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import { DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import type { EditValue } from "@/core/changes/changeSet";
import { booleanLabel, booleanValue, detailText, prefersLargeEditor } from "@/core/format/values";
import { jsonValueOf } from "@/core/json/tree";
import { JsonViewer } from "@/features/json/JsonViewer";
import { cn } from "@/lib/cn";
import type { CellValue, ResultColumn, ValueKind } from "@/lib/types";

export function FieldRow({
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
          placeholder={isDefault ? "DEFAULT" : isNull ? "NULL" : "empty string"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            // ⇧⌘N sets NULL, as in the grid.
            if (nullable && e.key.toLowerCase() === "n" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              setDraft("");
              onCommit({ kind: "null" });
            }
          }}
          trailing={
            nullable && !isNull ? (
              <button
                type="button"
                title="Set NULL (⇧⌘N)"
                // Keep the input's blur from committing the draft first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDraft("");
                  onCommit({ kind: "null" });
                }}
                className="rounded-[4px] px-1 font-mono text-[10px] font-semibold text-fg-subtle hover:bg-fg/10 hover:text-fg"
              >
                NULL
              </button>
            ) : undefined
          }
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
