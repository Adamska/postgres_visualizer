// Asks before running risky statements: UPDATE/DELETE without WHERE, and writes or schema changes
// on a production connection.

import { ShieldAlert, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlay";
import { profileDisplayName } from "@/core/connection/url";
import type { StatementWarning } from "@/core/sql/safety";
import type { Statement } from "@/core/sql/splitter";
import { runStatements } from "@/state/actions/queryTab";
import { closeDialog, useAppStore } from "@/state/store";

export function ConfirmRunDialog({
  tabId,
  statements,
  warnings,
}: {
  tabId: string;
  statements: Statement[];
  warnings: StatementWarning[];
}) {
  const profile = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    return tab ? s.connections[tab.connectionId]?.profile : undefined;
  });
  const production = profile?.environment === "production";
  const destructive = warnings.some((w) => w.kind !== "write");
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={production ? `Run on ${profileDisplayName(profile)}?` : "Run this statement?"}
      description={
        production
          ? "This connection is marked as production. Check the statements below before running them."
          : "This statement changes more than you might expect."
      }
      width={620}
      footer={
        <>
          <Button onClick={closeDialog} autoFocus>
            Cancel
          </Button>
          <Button
            variant={destructive || production ? "danger" : "primary"}
            onClick={() => {
              closeDialog();
              void runStatements(tabId, statements, true);
            }}
          >
            Run anyway
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 pb-2">
        {production && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium">
            <ShieldAlert className="size-4 shrink-0 text-danger" /> Production database
          </div>
        )}
        {warnings.map((warning) => (
          <div key={warning.index} className="rounded-lg border border-line">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px]">
              <TriangleAlert className="size-4 shrink-0 text-warning" />
              {warning.message}
            </div>
            <pre className="max-h-40 overflow-auto px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-fg-muted select-text">
              {statements[warning.index]?.text}
            </pre>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
