import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Segmented, Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Overlay";
import { EXPORT_FORMATS, type ExportFormat } from "@/core/exchange/export";
import { copyText, saveTextFile } from "@/lib/files";
import { exportQueryResult } from "@/state/actions/queryTab";
import { exportTable } from "@/state/actions/tableTab";
import { closeDialog, pushToast, useAppStore } from "@/state/store";

export function ExportDialog({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const [format, setFormat] = useState<ExportFormat>("csv");
  const selectedCount =
    tab?.kind === "table"
      ? tab.selection.rows.length
      : tab?.kind === "query"
        ? tab.gridSelection.rows.length
        : 0;
  const [selectionOnly, setSelectionOnly] = useState(selectedCount > 0);
  if (!tab || tab.kind === "structure") return null;

  const render = () =>
    tab.kind === "table"
      ? exportTable(tab, format, selectionOnly)
      : exportQueryResult(tab, format, selectionOnly);
  const name = tab.kind === "table" ? tab.query.table.name : "result";
  const extension = EXPORT_FORMATS.find((f) => f.value === format)?.extension ?? "txt";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={`Export ${name}`}
      description="Exports the rows currently loaded in this tab."
      width={440}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              void copyText(render());
              pushToast({ tone: "success", title: "Copied to the clipboard" });
              closeDialog();
            }}
          >
            Copy
          </Button>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              void saveTextFile(`${name}.${extension}`, render()).then((saved) => {
                if (saved) closeDialog();
              });
            }}
          >
            Save…
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Segmented
          value={format}
          onChange={setFormat}
          options={EXPORT_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
        />
        {selectedCount > 0 && (
          <Switch
            checked={selectionOnly}
            onChange={setSelectionOnly}
            label={`Only the ${selectedCount} selected rows`}
          />
        )}
      </div>
    </Dialog>
  );
}
