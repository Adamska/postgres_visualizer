// Shows the SQL a commit will run and asks for confirmation. Also used when closing a dirty tab.

import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlay";
import { changeCount } from "@/core/changes/changeSet";
import { profileDisplayName } from "@/core/connection/url";
import { displayName } from "@/core/sql/quote";
import { copyText } from "@/lib/files";
import { commitChanges, discardChanges, pendingStatements } from "@/state/actions/tableTab";
import { closeTab, tabHasUnsavedWork } from "@/state/actions/workspace";
import { closeDialog, useAppStore } from "@/state/store";

export function CommitDialog({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const profile = useAppStore((s) => (tab ? s.connections[tab.connectionId]?.profile : undefined));
  const production = profile?.environment === "production";
  if (!tab) return null;

  if (tab.kind !== "table") {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && closeDialog()}
        title="Close this tab?"
        description="A transaction is still open on this tab. Closing it rolls the transaction back."
        width={440}
        footer={
          <>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                closeDialog();
                void closeTab(tabId);
              }}
            >
              Close and roll back
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    );
  }

  const statements = pendingStatements(tab);
  const script = statements.map((s) => `${s};`).join("\n\n");
  const count = changeCount(tab.changes);
  const closing = tabHasUnsavedWork(tab);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={`Commit ${count} ${count === 1 ? "change" : "changes"} to ${displayName(tab.query.table)}`}
      description="The statements below run in a single transaction. Nothing is written if one of them fails."
      width={680}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => void copyText(script)}>
            Copy SQL
          </Button>
          {closing && (
            <Button
              variant="danger"
              onClick={() => {
                discardChanges(tabId);
                closeDialog();
                void closeTab(tabId);
              }}
            >
              Discard and close
            </Button>
          )}
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant={production ? "danger" : "primary"}
            loading={tab.committing}
            onClick={() => {
              void commitChanges(tabId).then((ok) => {
                if (ok) closeDialog();
              });
            }}
          >
            {production ? "Commit to production" : "Commit"}
          </Button>
        </>
      }
    >
      {production && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium">
          <ShieldAlert className="size-4 shrink-0 text-danger" />
          {profileDisplayName(profile)} is a production database.
        </div>
      )}
      <pre className="max-h-[50vh] select-text overflow-auto rounded-lg bg-surface-sunken p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg">
        {script}
      </pre>
    </Dialog>
  );
}
