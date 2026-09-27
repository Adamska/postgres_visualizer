import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  Download,
  Filter,
  LayoutList,
  ListTree,
  Minus,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Divider } from "@/components/Primitives";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import { DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import { changeCount, isChangeSetEmpty } from "@/core/changes/changeSet";
import { matchesView, viewsForTable } from "@/core/query/savedView";
import { pageSql } from "@/core/query/tableQuery";
import { copyText } from "@/lib/files";
import { FOCUS_SEARCH_EVENT } from "@/state/actions/commands";
import {
  addRow,
  commitChanges,
  discardChanges,
  duplicateRows,
  goBack,
  goForward,
  isTabEditable,
  loadTable,
  setSearch,
  setViewMode,
  toggleDeleteRows,
  toggleFilterBar,
} from "@/state/actions/tableTab";
import { deleteSavedView, openSavedView } from "@/state/actions/views";
import { openDiagram, openStructure } from "@/state/actions/workspace";
import { useSettings } from "@/state/settings";
import { openDialog, useAppStore, type TableTab, type TableViewMode } from "@/state/store";

function SearchField({ tab }: { tab: TableTab }) {
  const [draft, setDraft] = useState(tab.query.search);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(tab.query.search), [tab.query.search]);
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);
  // Apply shortly after typing stops.
  useEffect(() => {
    if (draft === tab.query.search) return undefined;
    const timer = setTimeout(() => void setSearch(tab.id, draft), 500);
    return () => clearTimeout(timer);
  }, [draft, tab.id, tab.query.search]);
  return (
    <Input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void setSearch(tab.id, draft);
        if (e.key === "Escape") {
          setDraft("");
          void setSearch(tab.id, "");
          input.current?.blur();
        }
      }}
      placeholder="Search all columns"
      aria-label="Search all columns (⌘F)"
      leading={<Search className="size-3.5" />}
      trailing={
        draft !== "" ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              void setSearch(tab.id, "");
            }}
            className="flex size-4 items-center justify-center rounded-full text-fg-subtle hover:bg-fg/10 hover:text-fg"
          >
            <X className="size-3" />
          </button>
        ) : undefined
      }
      className="w-52 [&>input]:h-7 [&>input]:text-[12px]"
    />
  );
}

function ViewsMenu({ tab }: { tab: TableTab }) {
  const savedViews = useAppStore((s) => s.savedViews);
  const views = viewsForTable(savedViews, tab.connectionId, tab.query.table);
  const current = views.find((v) => matchesView(v, tab.query, tab.layout.hidden));
  const items: MenuItem[] = views.map((view) => ({
    id: `view-${view.id}`,
    label: view.name,
    checked: view.id === current?.id,
    icon: <Bookmark className="size-3.5" />,
    onSelect: () => void openSavedView(view, tab.id),
  }));
  items.push({
    id: "save",
    label: current ? "Save as new view…" : "Save view…",
    icon: <BookmarkPlus className="size-3.5" />,
    separatorBefore: views.length > 0,
    onSelect: () => openDialog({ kind: "saveView", tabId: tab.id, viewId: null }),
  });
  if (current) {
    items.push({
      id: "delete",
      label: `Delete “${current.name}”`,
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onSelect: () => void deleteSavedView(current.id),
    });
  }
  return (
    <DropdownMenu
      trigger={
        <Button size="sm" variant="ghost" icon={<Bookmark className="size-3.5" />} title="Saved views">
          <span className="max-w-32 truncate">{current?.name ?? "Views"}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      }
      items={items}
    />
  );
}

export function TableToolbar({ tab }: { tab: TableTab }) {
  const confirmBeforeCommit = useSettings((s) => s.settings.confirmBeforeCommit);
  const production = useAppStore(
    (s) => s.connections[tab.connectionId]?.profile.environment === "production",
  );
  const editable = isTabEditable(tab);
  const selected = tab.selection.rows;
  const pending = changeCount(tab.changes);
  const filtered = tab.query.filters.length > 0 || tab.query.rawWhere.trim() !== "";
  const dirty = !isChangeSetEmpty(tab.changes);

  const commit = () => {
    if (confirmBeforeCommit || production) openDialog({ kind: "commit", tabId: tab.id });
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
      id: "diagram",
      label: `ER diagram of ${tab.query.table.schema}`,
      icon: <Network className="size-3.5" />,
      onSelect: () => openDiagram(tab.connectionId, tab.query.table.schema),
    },
    {
      id: "export",
      label: "Export…",
      icon: <Download className="size-3.5" />,
      shortcut: "⇧⌘E",
      separatorBefore: true,
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
        label="Back (⌘[)"
        size="sm"
        disabled={tab.history.back.length === 0 || dirty}
        onClick={() => void goBack(tab.id)}
      >
        <ArrowLeft className="size-4" />
      </IconButton>
      <IconButton
        label="Forward (⌘])"
        size="sm"
        disabled={tab.history.forward.length === 0 || dirty}
        onClick={() => void goForward(tab.id)}
      >
        <ArrowRight className="size-4" />
      </IconButton>
      <Divider vertical />
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
      <ViewsMenu tab={tab} />
      <DropdownMenu
        trigger={
          <IconButton label="More">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
        items={more}
      />
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <SearchField tab={tab} />
        <Segmented<TableViewMode>
          size="sm"
          value={tab.viewMode}
          onChange={(mode) => setViewMode(tab.id, mode)}
          options={[
            { value: "grid", label: <Table2 className="size-3.5" aria-label="Grid view" /> },
            { value: "form", label: <LayoutList className="size-3.5" aria-label="Form view" /> },
          ]}
        />
        {dirty && (
          <>
            <Divider vertical />
            <span className="text-[12px] whitespace-nowrap text-fg-muted">
              {pending} pending {pending === 1 ? "change" : "changes"}
            </span>
            <Button size="sm" onClick={() => discardChanges(tab.id)} title="Discard (⌥⌘Z)">
              Discard
            </Button>
            <Button
              size="sm"
              variant={production ? "danger" : "primary"}
              icon={<Check className="size-3.5" />}
              loading={tab.committing}
              onClick={commit}
              title="Commit (⌘S)"
            >
              Commit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
