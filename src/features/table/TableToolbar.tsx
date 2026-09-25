import {
  Check,
  Copy,
  CopyPlus,
  Download,
  Filter,
  ListTree,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";

import { Divider } from "@/components/Primitives";
import { Button, IconButton } from "@/components/ui/Button";
import { DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import { changeCount, isChangeSetEmpty } from "@/core/changes/changeSet";
import { hasActiveFilters, pageSql } from "@/core/query/tableQuery";
import { copyText } from "@/lib/files";
import {
  addRow,
  commitChanges,
  discardChanges,
  duplicateRows,
  loadTable,
  toggleDeleteRows,
  toggleFilterBar,
} from "@/state/actions/tableTab";
import { openStructure } from "@/state/actions/workspace";
import { useSettings } from "@/state/settings";
import { openDialog, type TableTab } from "@/state/store";

export function TableToolbar({ tab }: { tab: TableTab }) {
  const confirmBeforeCommit = useSettings((s) => s.settings.confirmBeforeCommit);
  const editable =
    tab.structure !== null &&
    tab.structure.columns.some((c) => c.isPrimaryKey) &&
    tab.structure.kind !== "view" &&
    tab.structure.kind !== "materializedView";
  const selected = tab.selection.rows;
  const pending = changeCount(tab.changes);
  const filtered = hasActiveFilters(tab.query);

  const commit = () => {
    if (confirmBeforeCommit) openDialog({ kind: "commit", tabId: tab.id });
    else void commitChanges(tab.id);
  };

  const more: MenuItem[] = [
    {
      id: "structure",
      label: "Structure",
      icon: <ListTree className="size-3.5" />,
      onSelect: () => openStructure(tab.connectionId, tab.query.table),
    },
    {
      id: "export",
      label: "Export…",
      icon: <Download className="size-3.5" />,
      shortcut: "⇧⌘E",
      onSelect: () => openDialog({ kind: "export", tabId: tab.id }),
    },
    {
      id: "import",
      label: "Import CSV…",
      icon: <Upload className="size-3.5" />,
      disabled: !editable,
      onSelect: () => openDialog({ kind: "importCsv", tabId: tab.id }),
    },
    {
      id: "copy-sql",
      label: "Copy SELECT",
      icon: <Copy className="size-3.5" />,
      separatorBefore: true,
      onSelect: () =>
        void copyText(
          pageSql(tab.query, tab.structure?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name) ?? []),
        ),
    },
  ];

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-2">
      <IconButton
        label="Filters (⇧⌘F)"
        active={tab.filterBarVisible || filtered}
        onClick={() => toggleFilterBar(tab.id)}
      >
        <Filter className="size-4" />
      </IconButton>
      <IconButton label="Refresh (⌘R)" onClick={() => void loadTable(tab.id)}>
        <RefreshCw className="size-4" />
      </IconButton>
      <Divider vertical />
      <IconButton label="Add row (⌥⌘N)" disabled={!editable} onClick={() => addRow(tab.id)}>
        <Plus className="size-4" />
      </IconButton>
      <IconButton
        label="Delete selected rows"
        disabled={!editable || selected.length === 0}
        onClick={() => toggleDeleteRows(tab.id, selected)}
      >
        <Minus className="size-4" />
      </IconButton>
      <IconButton
        label="Duplicate selected rows"
        disabled={!editable || selected.length === 0}
        onClick={() => duplicateRows(tab.id, selected)}
      >
        <CopyPlus className="size-4" />
      </IconButton>
      <Divider vertical />
      <DropdownMenu
        trigger={
          <IconButton label="More">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
        items={more}
      />
      <div className="flex-1" />
      {!isChangeSetEmpty(tab.changes) && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-fg-muted">
            {pending} pending {pending === 1 ? "change" : "changes"}
          </span>
          <Button size="sm" onClick={() => discardChanges(tab.id)} title="Discard (⌥⌘Z)">
            Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Check className="size-3.5" />}
            loading={tab.committing}
            onClick={commit}
            title="Commit (⌘S)"
          >
            Commit
          </Button>
        </div>
      )}
    </div>
  );
}
