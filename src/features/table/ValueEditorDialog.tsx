// Large editor and viewer for multi-line, JSON and enum values.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Segmented, Select, Switch } from "@/components/ui/Controls";
import { TextArea } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Overlay";
import { detailText } from "@/core/format/values";
import { formatJson, jsonValueOf, minifyJson, parseJson } from "@/core/json/tree";
import { JsonViewer } from "@/features/json/JsonViewer";
import type { CellValue, ResultColumn, ValueKind } from "@/lib/types";
import { cellValue, setCell } from "@/state/actions/tableTab";
import { closeDialog, useAppStore, type QueryTab, type TableTab } from "@/state/store";

/** What the dialog shows and whether it may change it. */
interface ValueTarget {
  column: ResultColumn;
  typeName: string;
  kind: ValueKind;
  value: CellValue | undefined;
  editable: boolean;
  nullable: boolean;
  enumValues: string[] | null;
  subtitle: string;
}

function targetOf(tab: TableTab | QueryTab, row: number, column: number): ValueTarget | null {
  if (tab.kind === "table") {
    const resultColumn = tab.result?.columns[column];
    if (!resultColumn) return null;
    const info = tab.structure?.columns.find((c) => c.name === resultColumn.name);
    return {
      column: resultColumn,
      typeName: info?.typeName ?? resultColumn.typeName,
      kind: info?.kind ?? resultColumn.kind,
      value: cellValue(tab, row, column),
      editable: info !== undefined && !info.isGenerated,
      nullable: info?.isNullable ?? true,
      enumValues: info?.enumValues ?? null,
      subtitle: `row ${row + 1}`,
    };
  }
  const result = tab.results[tab.selectedResult];
  const resultColumn = result?.columns[column];
  if (!result || !resultColumn) return null;
  return {
    column: resultColumn,
    typeName: resultColumn.typeName,
    kind: resultColumn.kind,
    value: result.rows[row]?.[column] ?? null,
    editable: false,
    nullable: true,
    enumValues: null,
    subtitle: `row ${row + 1} · read-only`,
  };
}

type ViewMode = "tree" | "text";

export function ValueEditorDialog({ tabId, row, column }: { tabId: string; row: number; column: number }) {
  const tab = useAppStore((s) =>
    s.tabs.find(
      (t): t is TableTab | QueryTab => t.id === tabId && (t.kind === "table" || t.kind === "query"),
    ),
  );
  const target = useMemo(() => (tab ? targetOf(tab, row, column) : null), [tab, row, column]);
  const initial = target?.value;
  const kind = target?.kind ?? "text";
  const [isNull, setIsNull] = useState(initial === null || initial === undefined);
  const [text, setText] = useState(
    initial === null || initial === undefined ? "" : detailText(initial, kind),
  );
  const jsonCapable = kind === "json" || jsonValueOf(initial, kind) !== undefined;
  const [mode, setMode] = useState<ViewMode>(jsonCapable ? "tree" : "text");
  const jsonValue = useMemo(
    () => (jsonCapable && !isNull && text.trim() !== "" ? parseJson(text) : undefined),
    [jsonCapable, isNull, text],
  );

  if (!tab || !target) return null;
  const { editable, enumValues } = target;
  const jsonError =
    kind === "json" && !isNull && text.trim() !== "" && jsonValue === undefined ? "Not valid JSON" : null;
  const showEnum = editable && enumValues !== null && !isNull;

  const apply = () => {
    setCell(tabId, row, column, isNull ? { kind: "null" } : { kind: "text", value: text });
    closeDialog();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={target.column.name}
      description={`${target.typeName} · ${target.subtitle}`}
      width={720}
      footer={
        <>
          {jsonError && <span className="mr-auto text-[12px] text-danger">{jsonError}</span>}
          <Button onClick={closeDialog}>{editable ? "Cancel" : "Close"}</Button>
          {editable && (
            <Button variant="primary" disabled={jsonError !== null} onClick={apply}>
              Apply
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex min-h-7 items-center justify-between gap-4">
          {showEnum ? (
            <Select
              value={text}
              onChange={setText}
              options={enumValues.map((v) => ({ value: v, label: v }))}
              className="w-64"
              ariaLabel="Value"
            />
          ) : (
            <div className="flex items-center gap-2">
              {jsonCapable && (
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "tree", label: "Tree" },
                    { value: "text", label: "Text" },
                  ]}
                />
              )}
              {jsonCapable && mode === "text" && editable && (
                <>
                  <Button
                    size="sm"
                    disabled={jsonValue === undefined}
                    onClick={() => setText(formatJson(text) ?? text)}
                  >
                    Format
                  </Button>
                  <Button
                    size="sm"
                    disabled={jsonValue === undefined}
                    onClick={() => setText(minifyJson(text) ?? text)}
                  >
                    Minify
                  </Button>
                </>
              )}
            </div>
          )}
          {editable && target.nullable && <Switch checked={isNull} onChange={setIsNull} label="NULL" />}
        </div>
        {!showEnum &&
          (jsonCapable && mode === "tree" ? (
            <div className="flex h-96 flex-col rounded-lg border border-line bg-surface-sunken p-2">
              {jsonValue !== undefined ? (
                <JsonViewer value={jsonValue} columnName={target.column.name} initialDepth={2} toolbar />
              ) : (
                <div className="flex flex-1 items-center justify-center text-[12.5px] text-fg-subtle italic">
                  {isNull ? "NULL" : text.trim() === "" ? "Empty" : "Not valid JSON — fix it in Text mode."}
                </div>
              )}
            </div>
          ) : (
            <TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isNull || !editable}
              className="h-96"
              autoFocus
            />
          ))}
      </div>
    </Dialog>
  );
}
