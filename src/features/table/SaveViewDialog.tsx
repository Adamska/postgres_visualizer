// Names the current filters, search, sort and hidden columns of a table tab as a saved view.

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Overlay";
import { displayName } from "@/core/sql/quote";
import { saveView } from "@/state/actions/views";
import { closeDialog, useAppStore } from "@/state/store";

export function SaveViewDialog({ tabId, viewId }: { tabId: string; viewId: string | null }) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const existing = useAppStore((s) => s.savedViews.find((v) => v.id === viewId));
  const [name, setName] = useState(existing?.name ?? "");
  if (tab?.kind !== "table") return null;
  const { query, layout } = tab;
  const summary = [
    query.filters.filter((f) => f.enabled).length > 0 &&
      `${query.filters.filter((f) => f.enabled).length} filter(s)`,
    query.rawWhere.trim() !== "" && "a WHERE clause",
    query.search.trim() !== "" && `search “${query.search.trim()}”`,
    query.sort[0] && `sorted by ${query.sort[0].column}`,
    layout.hidden.length > 0 && `${layout.hidden.length} hidden column(s)`,
  ].filter((part): part is string => typeof part === "string");
  const save = () => {
    if (name.trim() === "") return;
    void saveView(tabId, name.trim(), viewId).then(() => closeDialog());
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={`Save a view of ${displayName(query.table)}`}
      description="Saved views appear under the table in the sidebar and in the command palette."
      width={460}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={name.trim() === ""} onClick={save}>
            Save view
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <Field label="Name">
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Active customers in France"
          />
        </Field>
        <p className="text-[12px] text-fg-muted">
          {summary.length > 0
            ? `Keeps ${summary.join(", ")}.`
            : "No filters yet: the view opens the whole table."}
        </p>
      </div>
    </Dialog>
  );
}
