// ⌘K palette: fuzzy search over tables, saved views and queries, open tabs, connections and
// commands, all runnable from the keyboard.

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Bookmark,
  ChevronRight,
  Database,
  Eye,
  FileCode2,
  LayoutList,
  Network,
  Search,
  Table2,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ColorDot } from "@/components/Primitives";
import { Kbd } from "@/components/ui/Controls";
import { profileDisplayName } from "@/core/connection/url";
import { fuzzyFilter, type FuzzyMatch } from "@/core/search/fuzzy";
import { displayName } from "@/core/sql/quote";
import { tabTitle } from "@/features/workspace/tabTitle";
import { cn } from "@/lib/cn";
import type { SavedQuery } from "@/lib/types";
import { COMMANDS, isCommandAvailable, runCommand } from "@/state/actions/commands";
import { connect, loadSchemaObjects } from "@/state/actions/connections";
import { loadSavedQueries } from "@/state/actions/storage";
import { openSavedView } from "@/state/actions/views";
import { openDiagram, openQuery, openTable, selectTab } from "@/state/actions/workspace";
import { useSettings } from "@/state/settings";
import { closeDialog, getState, useAppStore } from "@/state/store";

export interface PaletteItem {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
}

const MAX_RESULTS = 60;
const SECTION_ORDER = [
  "Tabs",
  "Tables",
  "Saved views",
  "Saved queries",
  "Schemas",
  "Connections",
  "Commands",
];

function Highlighted({ text, match }: { text: string; match: FuzzyMatch | undefined }) {
  if (!match || match.indices.length === 0) return <>{text}</>;
  const marked = new Set(match.indices);
  return (
    <>
      {Array.from(text).map((char, i) =>
        marked.has(i) ? (
          <span key={i} className="font-semibold text-accent">
            {char}
          </span>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </>
  );
}

/** Everything the palette can offer right now. */
function useItems(savedQueries: SavedQuery[]): PaletteItem[] {
  const tabs = useAppStore((s) => s.tabs);
  const connections = useAppStore((s) => s.connections);
  const connectionOrder = useAppStore((s) => s.connectionOrder);
  const profiles = useAppStore((s) => s.profiles);
  const savedViews = useAppStore((s) => s.savedViews);
  const showSystem = useSettings((s) => s.settings.showSystemSchemas);

  return useMemo(() => {
    const items: PaletteItem[] = [];
    const several = connectionOrder.length > 1;
    const connectionName = (id: string) => {
      const connection = connections[id];
      return connection ? profileDisplayName(connection.profile) : "";
    };
    for (const tab of tabs) {
      items.push({
        id: `tab:${tab.id}`,
        section: "Tabs",
        title: tabTitle(tab),
        subtitle: `${tab.kind} · ${connectionName(tab.connectionId)}`,
        icon: <LayoutList />,
        run: () => selectTab(tab.id),
      });
    }
    for (const id of connectionOrder) {
      const connection = connections[id];
      if (connection?.status !== "connected") continue;
      for (const relations of Object.values(connection.relations)) {
        for (const relation of relations) {
          const table = { schema: relation.schema, name: relation.name };
          items.push({
            id: `table:${id}:${relation.schema}.${relation.name}`,
            section: "Tables",
            title: displayName(table),
            subtitle: several ? connectionName(id) : relation.kind === "table" ? undefined : relation.kind,
            icon: relation.kind === "table" || relation.kind === "partitionedTable" ? <Table2 /> : <Eye />,
            run: () => void openTable(id, table),
          });
        }
      }
      for (const schema of connection.schemas) {
        if (schema.isSystem && !showSystem) continue;
        items.push({
          id: `diagram:${id}:${schema.name}`,
          section: "Schemas",
          title: `ER diagram of ${schema.name}`,
          subtitle: several ? connectionName(id) : undefined,
          icon: <Network />,
          run: () => void openDiagram(id, schema.name),
        });
      }
    }
    for (const view of savedViews) {
      if (connections[view.profileId]?.status !== "connected") continue;
      items.push({
        id: `view:${view.id}`,
        section: "Saved views",
        title: view.name,
        subtitle: displayName(view.table),
        icon: <Bookmark />,
        run: () => void openSavedView(view),
      });
    }
    for (const query of savedQueries) {
      const target = query.profileId !== null && query.profileId in connections ? query.profileId : null;
      items.push({
        id: `query:${query.id}`,
        section: "Saved queries",
        title: query.name,
        subtitle: query.sql.replace(/\s+/g, " ").slice(0, 80),
        icon: <FileCode2 />,
        run: () => void openQuery(target, query.sql, query.name),
      });
    }
    for (const profile of profiles) {
      if (connections[profile.id]?.status === "connected") continue;
      items.push({
        id: `connect:${profile.id}`,
        section: "Connections",
        title: `Connect to ${profileDisplayName(profile)}`,
        subtitle: profile.group ?? undefined,
        icon: <ColorDot color={profile.color} size={9} />,
        run: () => void connect(profile),
      });
    }
    for (const command of COMMANDS) {
      if (command.id === "palette" || !isCommandAvailable(command.id)) continue;
      items.push({
        id: `command:${command.id}`,
        section: "Commands",
        title: command.label,
        subtitle: command.group,
        shortcut: "shortcut" in command ? command.shortcut : undefined,
        icon: command.group === "Query" ? <Terminal /> : command.group === "Server" ? <Database /> : <Zap />,
        run: () => runCommand(command.id),
      });
    }
    return items;
  }, [tabs, connections, connectionOrder, profiles, savedViews, savedQueries, showSystem]);
}

export function CommandPalette() {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const items = useItems(savedQueries);

  useEffect(() => {
    void loadSavedQueries().then(setSavedQueries);
    // Load every visible schema so all tables are searchable.
    const state = getState();
    const showSystem = useSettings.getState().settings.showSystemSchemas;
    for (const id of state.connectionOrder) {
      const connection = state.connections[id];
      if (connection?.status !== "connected") continue;
      for (const schema of connection.schemas) {
        if (!schema.isSystem || showSystem) void loadSchemaObjects(id, schema.name);
      }
    }
  }, []);

  const results = useMemo(() => {
    if (query.trim() === "") {
      // Without a query: open tabs, then commands.
      return items
        .filter((item) => item.section === "Tabs" || item.section === "Commands")
        .slice(0, MAX_RESULTS)
        .map((item) => ({ item, match: undefined as FuzzyMatch | undefined, key: 0 }));
    }
    return fuzzyFilter(items, query, (item) => [item.title, item.subtitle ?? ""], MAX_RESULTS);
  }, [items, query]);

  const grouped = useMemo(() => {
    if (query.trim() !== "") return [{ section: null as string | null, entries: results }];
    return SECTION_ORDER.map((section) => ({
      section,
      entries: results.filter((r) => r.item.section === section),
    })).filter((group) => group.entries.length > 0);
  }, [results, query]);
  const flat = grouped.flatMap((group) => group.entries);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const run = (index: number) => {
    const entry = flat[index];
    if (!entry) return;
    closeDialog();
    entry.item.run();
  };

  let index = -1;
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && closeDialog()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[640px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised/95 text-fg shadow-pop backdrop-blur-xl outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => Math.min(flat.length - 1, c + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(cursor);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tables, views, queries, commands…"
              spellCheck={false}
              aria-label="Search"
              className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
            />
            <Kbd>esc</Kbd>
          </div>
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox">
            {flat.length === 0 && (
              <div className="px-3 py-8 text-center text-[12.5px] text-fg-muted">
                Nothing matches “{query}”.
              </div>
            )}
            {grouped.map((group) => (
              <div key={group.section ?? "results"}>
                {group.section && (
                  <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                    {group.section}
                  </div>
                )}
                {group.entries.map(({ item, match, key }) => {
                  index += 1;
                  const position = index;
                  const selected = position === cursor;
                  return (
                    <div
                      key={item.id}
                      data-index={position}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => setCursor(position)}
                      onClick={() => run(position)}
                      className={cn(
                        "flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5",
                        selected ? "bg-accent text-accent-fg" : "text-fg",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
                          selected ? "text-accent-fg" : "text-fg-subtle",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        <Highlighted text={item.title} match={key === 0 && !selected ? match : undefined} />
                        {item.subtitle && (
                          <span
                            className={cn(
                              "ml-2 text-[11.5px]",
                              selected ? "text-accent-fg/75" : "text-fg-subtle",
                            )}
                          >
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {query.trim() !== "" && (
                        <span
                          className={cn("text-[10.5px]", selected ? "text-accent-fg/75" : "text-fg-subtle")}
                        >
                          {item.section}
                        </span>
                      )}
                      {item.shortcut && (
                        <span
                          className={cn("text-[11px]", selected ? "text-accent-fg/80" : "text-fg-subtle")}
                        >
                          {item.shortcut}
                        </span>
                      )}
                      {selected && <ChevronRight className="size-3.5" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↩</Kbd> open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
