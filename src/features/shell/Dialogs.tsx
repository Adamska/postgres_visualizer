// Mounts whichever dialog the store says is open.

import { ConnectionDialog } from "@/features/connections/ConnectionDialog";
import { ExportDialog } from "@/features/exchange/ExportDialog";
import { ImportCsvDialog } from "@/features/exchange/ImportCsvDialog";
import { RunSqlFileDialog } from "@/features/exchange/RunSqlFileDialog";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { CommitDialog } from "@/features/table/CommitDialog";
import { ValueEditorDialog } from "@/features/table/ValueEditorDialog";
import { useAppStore } from "@/state/store";

export function Dialogs() {
  const dialog = useAppStore((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "connection":
      return <ConnectionDialog profileId={dialog.profileId} />;
    case "settings":
      return <SettingsDialog />;
    case "export":
      return <ExportDialog tabId={dialog.tabId} />;
    case "importCsv":
      return <ImportCsvDialog tabId={dialog.tabId} />;
    case "runSqlFile":
      return <RunSqlFileDialog connectionId={dialog.connectionId} />;
    case "commit":
      return <CommitDialog tabId={dialog.tabId} />;
    case "valueEditor":
      return <ValueEditorDialog tabId={dialog.tabId} row={dialog.row} column={dialog.column} />;
  }
}
