import { Activity, ListTree, Lock, Network, Plus, ShieldAlert, Table2, Terminal, X } from "lucide-react";

import { ColorDot } from "@/components/Primitives";
import { IconButton } from "@/components/ui/Button";
import { ContextMenu, type MenuItem } from "@/components/ui/Menu";
import { productionColor } from "@/lib/colors";
import { cn } from "@/lib/cn";
import {
  closeOtherTabs,
  closeTab,
  openQuery,
  openTable,
  selectTab,
  tabHasUnsavedWork,
} from "@/state/actions/workspace";
import { openDialog, useAppStore, type Tab } from "@/state/store";

import { tabTitle } from "./tabTitle";

/** Badges for the active connection: production and read-only. */
function EnvironmentBadges() {
  const profile = useAppStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const id = active?.connectionId ?? s.activeConnectionId;
    return id === null ? undefined : s.connections[id]?.profile;
  });
  if (!profile) return null;
  return (
    <div className="mb-1 flex shrink-0 items-center gap-1.5">
      {profile.environment === "production" && (
        <span
          className="flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-bold tracking-wide text-white uppercase"
          style={{ background: productionColor(profile.color) }}
          title="Production connection: writes ask for confirmation"
        >
          <ShieldAlert className="size-3.5" /> Production
        </span>
      )}
      {profile.environment === "development" && (
        <span className="flex h-6 items-center rounded-full bg-success-soft px-2 text-[10.5px] font-semibold tracking-wide text-success uppercase">
          Dev
        </span>
      )}
      {profile.environment === "staging" && (
        <span className="flex h-6 items-center rounded-full bg-warning-soft px-2 text-[10.5px] font-semibold tracking-wide text-warning uppercase">
          Staging
        </span>
      )}
      {profile.readOnly && (
        <span
          className="flex h-6 items-center gap-1 rounded-full bg-fg/8 px-2 text-[10.5px] font-semibold tracking-wide text-fg-muted uppercase"
          title="Read-only connection"
        >
          <Lock className="size-3" /> Read-only
        </span>
      )}
    </div>
  );
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
      <EnvironmentBadges />
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
  const production = useAppStore(
    (s) => s.connections[tab.connectionId]?.profile.environment === "production",
  );
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
  const Icon = { table: Table2, query: Terminal, structure: ListTree, diagram: Network, server: Activity }[
    tab.kind
  ];
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
        style={
          production
            ? {
                boxShadow: `${active ? "0 1px 2px rgb(0 0 0 / 0.08), 0 0 0 1px var(--line), " : ""}inset 0 -2px 0 ${productionColor(color)}`,
              }
            : undefined
        }
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
