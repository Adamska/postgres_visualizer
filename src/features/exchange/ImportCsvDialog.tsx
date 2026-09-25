import { FileUp } from "lucide-react";
import { useState } from "react";

import { ErrorBanner } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { Select, Switch } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Overlay";
import { detectDelimiter, parseCsv, type CsvDocument } from "@/core/exchange/csv";
import { automaticImportPlan, importStatements, type ImportPlan } from "@/core/exchange/importPlan";
import { formatCount } from "@/core/format/values";
import { openTextFile } from "@/lib/files";
import { toAppError, type AppError } from "@/lib/types";
import { executeTransactionOn } from "@/state/actions/connections";
import { loadTable } from "@/state/actions/tableTab";
import { closeDialog, pushToast, useAppStore, type TableTab } from "@/state/store";

const DELIMITERS = [
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe" },
];

export function ImportCsvDialog({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) => s.tabs.find((t): t is TableTab => t.id === tabId && t.kind === "table"));
  const [raw, setRaw] = useState<{ name: string; text: string } | null>(null);
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [nullMarker, setNullMarker] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [document, setDocument] = useState<CsvDocument | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const structure = tab?.structure;
  if (!tab || !structure) return null;

  const parse = (text: string, d: string, header: boolean) => {
    const parsed = parseCsv(text, { delimiter: d, hasHeader: header });
    setDocument(parsed);
    setPlan(automaticImportPlan(parsed, structure));
  };
  const choose = async () => {
    const file = await openTextFile(["csv", "tsv", "txt"]);
    if (!file) return;
    const d = detectDelimiter(file.contents);
    setRaw({ name: file.name, text: file.contents });
    setDelimiter(d);
    parse(file.contents, d, hasHeader);
  };
  const run = async () => {
    if (!plan || !document) return;
    setBusy(true);
    setError(null);
    try {
      await executeTransactionOn(
        tab.connectionId,
        importStatements({ ...plan, nullRepresentation: nullMarker }, document, structure),
      );
      pushToast({
        tone: "success",
        title: `Imported ${formatCount(document.rows.length)} into ${structure.name}`,
      });
      closeDialog();
      void loadTable(tabId);
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  };
  const targets = [
    { value: "", label: "Skip" },
    ...structure.columns
      .filter((c) => !c.isGenerated)
      .map((c) => ({ value: c.name, label: `${c.name}  (${c.typeName})` })),
  ];
  const active = plan?.mappings.filter((m) => m.tableColumn !== null).length ?? 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={`Import CSV into ${structure.name}`}
      width={720}
      footer={
        <>
          <Input
            value={nullMarker}
            onChange={(e) => setNullMarker(e.target.value)}
            placeholder="NULL marker (empty by default)"
            className="mr-auto w-64 [&>input]:h-7"
          />
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!document || active === 0}
            loading={busy}
            onClick={() => void run()}
          >
            Import {document ? formatCount(document.rows.length) : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Button icon={<FileUp className="size-4" />} onClick={() => void choose()}>
            Choose file…
          </Button>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
            {raw?.name ?? "No file selected"}
          </span>
          <Select
            size="sm"
            value={delimiter}
            onChange={(d) => {
              setDelimiter(d);
              if (raw) parse(raw.text, d, hasHeader);
            }}
            options={DELIMITERS}
            ariaLabel="Delimiter"
          />
          <Switch
            checked={hasHeader}
            onChange={(h) => {
              setHasHeader(h);
              if (raw) parse(raw.text, delimiter, h);
            }}
            label="Header row"
          />
        </div>
        {error && <ErrorBanner error={error} className="mx-0 mt-0" />}
        {plan && document && (
          <>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-fg-muted">Column mapping</div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
                {plan.mappings.map((mapping) => (
                  <div
                    key={mapping.csvColumn}
                    className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0"
                  >
                    <span className="w-48 truncate font-mono text-[12px]">{mapping.csvColumn}</span>
                    <span className="text-fg-subtle">→</span>
                    <Select
                      size="sm"
                      value={mapping.tableColumn ?? ""}
                      onChange={(target) =>
                        setPlan({
                          ...plan,
                          mappings: plan.mappings.map((m) =>
                            m.csvColumn === mapping.csvColumn
                              ? { ...m, tableColumn: target === "" ? null : target }
                              : m,
                          ),
                        })
                      }
                      options={targets}
                      className="w-64"
                      ariaLabel={`Target for ${mapping.csvColumn}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-fg-muted">
                Preview · {formatCount(document.rows.length)} in file
              </div>
              <div className="max-h-40 overflow-auto rounded-lg bg-surface-sunken p-2">
                <table className="text-[11.5px]">
                  <thead>
                    <tr>
                      {document.header.map((h) => (
                        <th
                          key={h}
                          className="px-2 py-0.5 text-left font-semibold whitespace-nowrap text-fg-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {document.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className={`px-2 py-0.5 font-mono whitespace-nowrap ${cell === "" ? "text-fg-subtle" : ""}`}
                          >
                            {cell === "" ? "∅" : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
