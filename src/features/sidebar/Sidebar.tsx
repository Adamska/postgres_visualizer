import {
  ChevronRight,
  Database,
  Eye,
  FolderClosed,
  FunctionSquare,
  MoreHorizontal,
  Plus,
  Search,
  Table2,
  WifiOff,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ColorDot } from "@/components/Primitives";
import { IconButton, Spinner } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContextMenu, DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import { connectionUrl, profileDisplayName, profileEndpoint } from "@/core/connection/url";
import { compactCount } from "@/core/format/values";
import { qualifiedName } from "@/core/sql/quote";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/files";
import type { ConnectionProfile, FunctionInfo, RelationInfo, SchemaInfo } from "@/lib/types";
import {
  connect,
  disconnect,
  loadSchemaObjects,
  reconnect,
  refreshSchemas,
  toggleSchema,
} from "@/state/actions/connections";
import { deleteProfile } from "@/state/actions/profiles";
import { openQuery, openStructure, openTable } from "@/state/actions/workspace";
import { useSettings } from "@/state/settings";
import { mutate, openDialog, useAppStore, type ConnectionState } from "@/state/store";

export function Sidebar() {
  const [search, setSearch] = useState("");
  const connectionOrder = useAppStore((s) => s.connectionOrder);
  const profiles = useAppStore((s) => s.profiles);
  const openIds = new Set(connectionOrder);
  const closedProfiles = profiles.filter((p) => !openIds.has(p.id));

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line/70 bg-[var(--sidebar-bg)]">
      <div className="h-[52px] shrink-0" data-tauri-drag-region />
      <div className="px-3 pb-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter tables"
          leading={<Search className="size-3.5" />}
          className="[&>input]:h-7 [&>input]:bg-fg/5 [&>input]:border-transparent [&>input]:shadow-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {connectionOrder.map((id) => (
          <ConnectionSection key={id} id={id} search={search} />
        ))}
        {closedProfiles.length > 0 && <SavedProfiles profiles={closedProfiles} search={search} />}
      </div>
      <div className="border-t border-line/70 p-2">
        <button
          type="button"
          onClick={() => openDialog({ kind: "connection", profileId: null })}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12.5px] text-fg-muted hover:bg-fg/6 hover:text-fg"
        >
          <Plus className="size-4" />
          New connection
        </button>
      </div>
    </aside>
  );
}

function SavedProfiles({ profiles, search }: { profiles: ConnectionProfile[]; search: string }) {
  const filtered = profiles.filter(
    (p) => search === "" || profileDisplayName(p).toLowerCase().includes(search.toLowerCase()),
  );
  const groups = useMemo(() => {
    const map = new Map<string, ConnectionProfile[]>();
    for (const profile of filtered) {
      const key = profile.group?.trim() ?? "";
      map.set(key, [...(map.get(key) ?? []), profile]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [filtered]);
  if (filtered.length === 0) return null;
  return (
    <div className="mt-3">
      <SectionLabel>Saved connections</SectionLabel>
      {groups.map(([group, members]) => (
        <div key={group}>
          {group !== "" && (
            <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-fg-subtle">{group}</div>
          )}
          {members
            .sort((a, b) => profileDisplayName(a).localeCompare(profileDisplayName(b)))
            .map((profile) => (
              <SavedProfileRow key={profile.id} profile={profile} />
            ))}
        </div>
      ))}
    </div>
  );
}

function SavedProfileRow({ profile }: { profile: ConnectionProfile }) {
  const items: MenuItem[] = [
    { id: "connect", label: "Connect", onSelect: () => void connect(profile) },
    { id: "edit", label: "Edit…", onSelect: () => openDialog({ kind: "connection", profileId: profile.id }) },
    { id: "copy", label: "Copy URL", onSelect: () => void copyText(connectionUrl(profile)) },
    {
      id: "delete",
      label: "Delete",
      danger: true,
      separatorBefore: true,
      onSelect: () => void deleteProfile(profile.id),
    },
  ];
  return (
    <ContextMenu items={items}>
      <button
        type="button"
        onClick={() => void connect(profile)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-fg/6"
      >
        <ColorDot color={profile.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-fg">{profileDisplayName(profile)}</span>
          <span className="block truncate text-[11px] text-fg-subtle">{profileEndpoint(profile)}</span>
        </span>
      </button>
    </ContextMenu>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
      {children}
    </div>
  );
}

function ConnectionSection({ id, search }: { id: string; search: string }) {
  const connection = useAppStore((s) => s.connections[id]);
  const isActive = useAppStore((s) => s.activeConnectionId === id);
  const showSystem = useSettings((s) => s.settings.showSystemSchemas);
  if (!connection) return null;
  const { profile } = connection;
  const lost = connection.status === "disconnected";
  const items: MenuItem[] = [
    ...(lost ? [{ id: "reconnect", label: "Reconnect", onSelect: () => void reconnect(id) }] : []),
    { id: "query", label: "New query tab", onSelect: () => void openQuery(id) },
    { id: "refresh", label: "Refresh schema", disabled: lost, onSelect: () => void refreshSchemas(id) },
    {
      id: "edit",
      label: "Edit connection…",
      onSelect: () => openDialog({ kind: "connection", profileId: id }),
    },
    {
      id: "sql",
      label: "Run SQL file…",
      onSelect: () => openDialog({ kind: "runSqlFile", connectionId: id }),
    },
    { id: "copy", label: "Copy URL", onSelect: () => void copyText(connectionUrl(profile)) },
    {
      id: "disconnect",
      label: "Disconnect",
      danger: true,
      separatorBefore: true,
      onSelect: () => void disconnect(id),
    },
  ];
  const schemas = connection.schemas.filter((s) => showSystem || !s.isSystem);
  return (
    <div className="mb-1">
      <div
        className={cn(
          "group flex h-8 items-center gap-2 rounded-md px-2",
          isActive ? "text-fg" : "text-fg-muted hover:text-fg",
        )}
        onClick={() =>
          mutate((draft) => {
            draft.activeConnectionId = id;
          })
        }
      >
        <ColorDot color={profile.color} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {profileDisplayName(profile)}
        </span>
        {connection.schemaLoading && <Spinner className="size-3 text-fg-subtle" />}
        {lost && <WifiOff className="size-3.5 text-warning" aria-label="Connection lost" />}
        <DropdownMenu
          trigger={
            <IconButton
              label="Connection menu"
              size="sm"
              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </IconButton>
          }
          items={items}
          align="end"
        />
      </div>
      {connection.status === "connecting" && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-fg-muted">
          <Spinner className="size-3" /> Connecting…
        </div>
      )}
      {connection.status === "failed" && (
        <div className="px-3 py-1.5 text-[12px] text-danger">{connection.error}</div>
      )}
      {lost && (
        <div className="mx-1 flex items-center gap-2 rounded-md bg-warning-soft px-2 py-1.5 text-[12px] text-fg-muted">
          <span className="min-w-0 flex-1 truncate">Connection lost</span>
          <button
            type="button"
            onClick={() => void reconnect(id)}
            className="shrink-0 font-medium text-accent hover:underline"
          >
            Reconnect
          </button>
        </div>
      )}
      {connection.status === "connected" &&
        schemas.map((schema) => (
          <SchemaGroup key={schema.name} connection={connection} schema={schema} search={search} />
        ))}
    </div>
  );
}

function SchemaGroup({
  connection,
  schema,
  search,
}: {
  connection: ConnectionState;
  schema: SchemaInfo;
  search: string;
}) {
  const searching = search.trim() !== "";
  const expanded = connection.expandedSchemas.includes(schema.name) || searching;
  const loading = connection.loadingSchemas.includes(schema.name);
  const relations = connection.relations[schema.name];
  if (searching && relations === undefined && !loading) void loadSchemaObjects(connection.id, schema.name);
  const needle = search.trim().toLowerCase();
  const visibleRelations = (relations ?? []).filter(
    (r) => needle === "" || r.name.toLowerCase().includes(needle),
  );
  const visibleFunctions = (connection.functions[schema.name] ?? []).filter(
    (f) => needle === "" || f.name.toLowerCase().includes(needle),
  );
  if (searching && visibleRelations.length === 0 && visibleFunctions.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleSchema(connection.id, schema.name)}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-fg-muted hover:bg-fg/6 hover:text-fg"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        <FolderClosed className="size-3.5" />
        <span className={cn("truncate", schema.isSystem && "italic")}>{schema.name}</span>
      </button>
      {expanded && (
        <div className="ml-3.5 border-l border-line/80 pl-1.5">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-fg-subtle">
              <Spinner className="size-3" /> Loading…
            </div>
          )}
          {!loading && relations?.length === 0 && visibleFunctions.length === 0 && (
            <div className="px-2 py-1 text-[12px] text-fg-subtle">Empty schema</div>
          )}
          {visibleRelations.map((relation) => (
            <RelationRow key={relation.name} connection={connection} relation={relation} />
          ))}
          {visibleFunctions.length > 0 && (
            <FunctionsGroup connection={connection} functions={visibleFunctions} />
          )}
        </div>
      )}
    </div>
  );
}

function RelationRow({ connection, relation }: { connection: ConnectionState; relation: RelationInfo }) {
  const table = { schema: relation.schema, name: relation.name };
  const isOpen = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (
      tab?.kind === "table" &&
      tab.connectionId === connection.id &&
      tab.query.table.name === relation.name &&
      tab.query.table.schema === relation.schema
    );
  });
  const isTable =
    relation.kind === "table" || relation.kind === "partitionedTable" || relation.kind === "foreignTable";
  const items: MenuItem[] = [
    { id: "open", label: "Open", onSelect: () => openTable(connection.id, table) },
    { id: "open-new", label: "Open in new tab", onSelect: () => openTable(connection.id, table, [], false) },
    { id: "structure", label: "Structure", onSelect: () => openStructure(connection.id, table) },
    {
      id: "query",
      label: "Query",
      onSelect: () => openQuery(connection.id, `SELECT * FROM ${qualifiedName(table)}\nLIMIT 100;`),
    },
    {
      id: "copy",
      label: "Copy name",
      separatorBefore: true,
      onSelect: () => void copyText(qualifiedName(table)),
    },
  ];
  return (
    <ContextMenu items={items}>
      <button
        type="button"
        onClick={() => openTable(connection.id, table)}
        title={relation.comment ?? relation.kind}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12.5px] hover:bg-fg/6",
          isOpen ? "bg-accent-soft text-accent hover:bg-accent-soft" : "text-fg",
        )}
      >
        {isTable ? (
          <Table2 className={cn("size-3.5 shrink-0", isOpen ? "text-accent" : "text-fg-subtle")} />
        ) : (
          <Eye className="size-3.5 shrink-0 text-fg-subtle" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{relation.name}</span>
        {relation.estimatedRows !== null && (
          <span className="font-mono text-[10.5px] tabular-nums text-fg-subtle">
            {compactCount(relation.estimatedRows)}
          </span>
        )}
      </button>
    </ContextMenu>
  );
}

function FunctionsGroup({
  connection,
  functions,
}: {
  connection: ConnectionState;
  functions: FunctionInfo[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-fg-muted hover:bg-fg/6 hover:text-fg"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <FunctionSquare className="size-3.5" />
        <span>Functions</span>
        <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">{functions.length}</span>
      </button>
      {open &&
        functions.map((fn) => (
          <button
            key={`${fn.name}(${fn.arguments})`}
            type="button"
            title={`${fn.language} → ${fn.returnType}`}
            onClick={() =>
              openQuery(connection.id, fn.isProcedure ? `CALL ${fn.name}();` : `SELECT * FROM ${fn.name}();`)
            }
            className="ml-3.5 flex h-7 w-[calc(100%-14px)] items-center gap-2 rounded-md px-2 text-[12.5px] text-fg hover:bg-fg/6"
          >
            <Database className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="truncate">
              {fn.name}
              <span className="text-fg-subtle">({fn.arguments})</span>
            </span>
          </button>
        ))}
    </div>
  );
}
