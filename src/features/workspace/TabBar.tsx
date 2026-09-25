import { ListTree, Plus, Table2, Terminal, X } from "lucide-react";

import { ColorDot } from "@/components/Primitives";
import { IconButton } from "@/components/ui/Button";
import { ContextMenu, type MenuItem } from "@/components/ui/Menu";
import { displayName } from "@/core/sql/quote";
import { cn } from "@/lib/cn";
import { queryTitle } from "@/state/actions/queryTab";
import {
  closeOtherTabs,
  closeTab,
  openQuery,
  openTable,
  selectTab,
  tabHasUnsavedWork,
} from "@/state/actions/workspace";
import { openDialog, useAppStore, type Tab } from "@/state/store";

export function tabTitle(tab: Tab): string {
  switch (tab.kind) {
    case "table":
      return displayName(tab.query.table);
    case "structure":
      return displayName(tab.table);
    case "query":
      return queryTitle(tab);
  }
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const hasConnection = useAppStore((s) => s.connectionOrder.length > 0);
  return (
    <div className="flex h-[52px] shrink-0 items-end gap-1 px-2 pb-1.5" data-tauri-drag-region>
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto" data-tauri-drag-region>
        {tabs.map((tab) => (
          <TabChip key={tab.id} tab={tab} active={tab.id === activeTabId} />
        ))}
      </div>
      <IconButton
        label="New query tab (⌘T)"
        size="sm"
        disabled={!hasConnection}
        onClick={() => openQuery()}
        className="mb-0.5"
      >
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}

function TabChip({ tab, active }: { tab: Tab; active: boolean }) {
  const color = useAppStore((s) => s.connections[tab.connectionId]?.profile.color ?? "none");
  const dirty = tabHasUnsavedWork(tab);
  const requestClose = () => {
    if (dirty) openDialog({ kind: "commit", tabId: tab.id });
    else void closeTab(tab.id);
  };
  const items: MenuItem[] = [
    { id: "close", label: "Close tab", shortcut: "⌘W", onSelect: requestClose },
    { id: "close-others", label: "Close other tabs", onSelect: () => void closeOtherTabs(tab.id) },
  ];
  if (tab.kind === "table") {
    items.push({
      id: "duplicate",
      label: "Duplicate tab",
      separatorBefore: true,
      onSelect: () => openTable(tab.connectionId, tab.query.table, tab.query.filters, false),
    });
  }
  const Icon = tab.kind === "table" ? Table2 : tab.kind === "query" ? Terminal : ListTree;
  return (
    <ContextMenu items={items}>
      <div
        role="tab"
        aria-selected={active}
        onMouseDown={(e) => {
          if (e.button === 1) requestClose();
          else selectTab(tab.id);
        }}
        className={cn(
          "group flex h-8 max-w-56 min-w-0 shrink-0 cursor-default items-center gap-2 rounded-lg pr-1.5 pl-2.5 text-[12.5px] transition-colors",
          active
            ? "bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]"
            : "text-fg-muted hover:bg-fg/5 hover:text-fg",
        )}
      >
        <ColorDot color={color} size={6} />
        <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-fg-subtle")} />
        <span className="min-w-0 flex-1 truncate">{tabTitle(tab)}</span>
        {dirty && <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />}
        <button
          type="button"
          aria-label="Close tab"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={requestClose}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-[5px] text-fg-subtle hover:bg-fg/10 hover:text-fg",
            active ? "opacity-70" : "opacity-0 group-hover:opacity-70",
          )}
        >
          <X className="size-3" />
        </button>
      </div>
    </ContextMenu>
  );
}
