// Large editor for multi-line, JSON and enum values.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Select, Switch } from "@/components/ui/Controls";
import { TextArea } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Overlay";
import { isValidJson } from "@/core/exchange/export";
import { detailText, prettyJson } from "@/core/format/values";
import { cellValue, setCell } from "@/state/actions/tableTab";
import { closeDialog, useAppStore, type TableTab } from "@/state/store";

export function ValueEditorDialog({ tabId, row, column }: { tabId: string; row: number; column: number }) {
  const tab = useAppStore((s) => s.tabs.find((t): t is TableTab => t.id === tabId && t.kind === "table"));
  const resultColumn = tab?.result?.columns[column];
  const info = tab?.structure?.columns.find((c) => c.name === resultColumn?.name);
  const kind = info?.kind ?? resultColumn?.kind ?? "text";
  const initial = useMemo(() => (tab ? cellValue(tab, row, column) : undefined), [tab, row, column]);
  const [isNull, setIsNull] = useState(initial === null || initial === undefined);
  const [text, setText] = useState(
    initial === null || initial === undefined ? "" : detailText(initial, kind),
  );
  const editable = info !== undefined && !info.isGenerated;

  if (!tab || !resultColumn) return null;
  const jsonError =
    kind === "json" && !isNull && text.trim() !== "" && !isValidJson(text) ? "Not valid JSON" : null;

  const apply = () => {
    setCell(tabId, row, column, isNull ? { kind: "null" } : { kind: "text", value: text });
    closeDialog();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={resultColumn.name}
      description={`${info?.typeName ?? resultColumn.typeName} · row ${row + 1}`}
      width={680}
      footer={
        <>
          {jsonError && <span className="mr-auto text-[12px] text-danger">{jsonError}</span>}
          <Button onClick={closeDialog}>Cancel</Button>
          {editable && (
            <Button variant="primary" disabled={jsonError !== null} onClick={apply}>
              Apply
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {editable && (
          <div className="flex items-center justify-between gap-4">
            {info.enumValues && !isNull ? (
              <Select
                value={text}
                onChange={setText}
                options={info.enumValues.map((v) => ({ value: v, label: v }))}
                className="w-64"
                ariaLabel="Value"
              />
            ) : (
              <div className="flex gap-2">
                {kind === "json" && (
                  <Button
                    size="sm"
                    disabled={isNull || jsonError !== null || text.trim() === ""}
                    onClick={() => setText(prettyJson(text) ?? text)}
                  >
                    Format JSON
                  </Button>
                )}
              </div>
            )}
            {info.isNullable && <Switch checked={isNull} onChange={setIsNull} label="NULL" />}
          </div>
        )}
        {!(info?.enumValues && !isNull) && (
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isNull || !editable}
            className="h-72"
            autoFocus
          />
        )}
      </div>
    </Dialog>
  );
}
