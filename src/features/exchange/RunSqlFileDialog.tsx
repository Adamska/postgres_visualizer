import { CheckCircle2, FileUp } from "lucide-react";
import { useState } from "react";

import { ErrorBanner } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Overlay";
import { splitStatements, type Statement } from "@/core/sql/splitter";
import { openTextFile } from "@/lib/files";
import { toAppError, type AppError } from "@/lib/types";
import { executeOn, refreshSchemas } from "@/state/actions/connections";
import { closeDialog } from "@/state/store";

export function RunSqlFileDialog({ connectionId }: { connectionId: string }) {
  const [file, setFile] = useState<{ name: string; statements: Statement[] } | null>(null);
  const [transaction, setTransaction] = useState(true);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const choose = async () => {
    const opened = await openTextFile(["sql", "txt"]);
    if (opened) {
      setFile({ name: opened.name, statements: splitStatements(opened.contents) });
      setDone(0);
      setFinished(false);
      setError(null);
    }
  };

  const run = async () => {
    if (!file) return;
    setRunning(true);
    setError(null);
    try {
      if (transaction) await executeOn(connectionId, "BEGIN");
      for (const statement of file.statements) {
        await executeOn(connectionId, statement.text);
        setDone((d) => d + 1);
      }
      if (transaction) await executeOn(connectionId, "COMMIT");
      void refreshSchemas(connectionId);
    } catch (e) {
      if (transaction) await executeOn(connectionId, "ROLLBACK").catch(() => undefined);
      setError(toAppError(e));
    } finally {
      setRunning(false);
      setFinished(true);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title="Run SQL file"
      width={520}
      footer={
        <>
          <Button onClick={closeDialog}>{finished ? "Close" : "Cancel"}</Button>
          {!finished && (
            <Button
              variant="primary"
              disabled={!file || file.statements.length === 0}
              loading={running}
              onClick={() => void run()}
            >
              Run {file ? `${file.statements.length} statements` : ""}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Button icon={<FileUp className="size-4" />} onClick={() => void choose()} disabled={running}>
            Choose file…
          </Button>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
            {file?.name ?? "No file selected"}
          </span>
        </div>
        <Switch
          checked={transaction}
          onChange={setTransaction}
          label="Wrap in a single transaction"
          description="Everything is rolled back if a statement fails."
        />
        {(running || finished) && file && (
          <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${(done / Math.max(1, file.statements.length)) * 100}%` }}
            />
          </div>
        )}
        {error && <ErrorBanner error={error} className="mx-0 mt-0" />}
        {finished && !error && (
          <div className="flex items-center gap-2 text-[12.5px] text-success">
            <CheckCircle2 className="size-4" /> All statements executed successfully.
          </div>
        )}
      </div>
    </Dialog>
  );
}
