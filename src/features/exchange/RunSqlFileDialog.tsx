import { CheckCircle2, FileUp, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { ErrorBanner } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Overlay";
import { reviewStatements } from "@/core/sql/safety";
import { splitStatements, type Statement } from "@/core/sql/splitter";
import { openTextFile } from "@/lib/files";
import { toAppError, type AppError } from "@/lib/types";
import { executeOn, refreshSchemas } from "@/state/actions/connections";
import { closeDialog, useAppStore } from "@/state/store";

export function RunSqlFileDialog({ connectionId }: { connectionId: string }) {
  const [file, setFile] = useState<{ name: string; statements: Statement[] } | null>(null);
  const [transaction, setTransaction] = useState(true);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const profile = useAppStore((s) => s.connections[connectionId]?.profile);
  const production = profile?.environment === "production";
  const warnings = useMemo(
    () =>
      file
        ? reviewStatements(
            file.statements.map((st) => st.text),
            false,
          )
        : [],
    [file],
  );

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
              variant={production || warnings.length > 0 ? "danger" : "primary"}
              disabled={!file || file.statements.length === 0 || profile?.readOnly === true}
              loading={running}
              onClick={() => void run()}
            >
              Run {file ? `${file.statements.length} statements` : ""}
              {production ? " on production" : ""}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {production && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium">
            <ShieldAlert className="size-4 shrink-0 text-danger" /> This connection is a production database.
          </div>
        )}
        {profile?.readOnly && (
          <div className="flex items-center gap-2 rounded-lg bg-fg/6 px-3 py-2 text-[12.5px]">
            <Lock className="size-4 shrink-0 text-fg-muted" /> The connection is read-only: scripts cannot
            run.
          </div>
        )}
        {warnings.map((warning) => (
          <div key={warning.index} className="flex items-center gap-2 text-[12px] text-warning">
            <TriangleAlert className="size-3.5 shrink-0" />
            Statement {warning.index + 1}: {warning.message}
          </div>
        ))}
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
