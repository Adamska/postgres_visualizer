// Server tab: live sessions with cancel/terminate, table health (size, dead rows, scans, vacuum)
// and index usage (size, scans, unused indexes).

import {
  Activity,
  ArrowDown,
  Ban,
  Copy,
  Database,
  Gauge,
  HardDrive,
  Pause,
  Play,
  Power,
  RefreshCw,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorBanner } from "@/components/Primitives";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { Badge, Segmented, Switch } from "@/components/ui/Controls";
import { relativeTime, parseTemporal } from "@/core/format/temporal";
import {
  formatBytes,
  formatElapsed,
  isClientBackend,
  sortActivity,
  summarizeActivity,
  type ActivityRow,
  type IndexUsage,
  type TableHealth,
} from "@/core/monitor/monitor";
import { quoteIdent } from "@/core/sql/quote";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/files";
import {
  ACTIVITY_REFRESH_MS,
  refreshServerTab,
  setServerPane,
  signalBackend,
  updateServerTab,
} from "@/state/actions/serverTab";
import { openQuery, openTable } from "@/state/actions/workspace";
import { pushToast, useAppStore, type ServerPane, type ServerTab as ServerTabState } from "@/state/store";

function Tile({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div className="min-w-36 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle [&>svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[20px] font-semibold",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      {detail && <div className="text-[11px] text-fg-muted">{detail}</div>}
    </div>
  );
}

function StatePill({ row }: { row: ActivityRow }) {
  if (row.blockedBy.length > 0) return <Badge tone="danger">blocked</Badge>;
  switch (row.state) {
    case "active":
      return <Badge tone={row.waitEventType === "Lock" ? "warning" : "success"}>active</Badge>;
    case "idle":
      return <Badge>idle</Badge>;
    case null:
      return <Badge>{row.backendType ?? "background"}</Badge>;
    default:
      return row.state.startsWith("idle in transaction") ? (
        <Badge tone="warning">{row.state}</Badge>
      ) : (
        <Badge>{row.state}</Badge>
      );
  }
}

/** A button that asks for a second click before acting. */
function ConfirmButton({
  label,
  confirm,
  icon,
  onConfirm,
}: {
  label: string;
  confirm: string;
  icon: React.ReactNode;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant={armed ? "danger" : "ghost"}
      icon={icon}
      onClick={(event) => {
        event.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirm : label}
    </Button>
  );
}

function ActivityPane({ tab }: { tab: ServerTabState }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const snapshot = tab.activity;
  const rows = useMemo(() => {
    if (!snapshot) return [];
    return sortActivity(
      snapshot.rows.filter(
        (row) => (tab.showBackground || isClientBackend(row)) && (tab.showIdle || row.state !== "idle"),
      ),
    );
  }, [snapshot, tab.showBackground, tab.showIdle]);
  if (!snapshot) return null;
  const summary = summarizeActivity(snapshot.rows);
  const usage = snapshot.maxConnections ? summary.total / snapshot.maxConnections : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Tile
          icon={<Gauge />}
          label="Connections"
          value={`${summary.total}${snapshot.maxConnections ? ` / ${snapshot.maxConnections}` : ""}`}
          detail={snapshot.maxConnections ? `${Math.round(usage * 100)}% of max_connections` : undefined}
          tone={usage > 0.8 ? "danger" : usage > 0.6 ? "warning" : "neutral"}
        />
        <Tile icon={<Activity />} label="Active" value={String(summary.active)} />
        <Tile
          icon={<TriangleAlert />}
          label="Idle in transaction"
          value={String(summary.idleInTransaction)}
          tone={summary.idleInTransaction > 0 ? "warning" : "neutral"}
          detail="holding locks and snapshots"
        />
        <Tile
          icon={<Ban />}
          label="Blocked"
          value={String(summary.blocked)}
          tone={summary.blocked > 0 ? "danger" : "neutral"}
          detail={`${summary.waiting} waiting on locks`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div>
          <Switch
            checked={tab.showIdle}
            onChange={(showIdle) => updateServerTab(tab.id, { showIdle })}
            label="Show idle"
          />
        </div>
        <div>
          <Switch
            checked={tab.showBackground}
            onChange={(showBackground) => updateServerTab(tab.id, { showBackground })}
            label="Show background processes"
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full table-fixed text-[12px]">
          <thead className="bg-surface-sunken text-left text-[11px] text-fg-muted">
            <tr>
              <th className="w-16 px-3 py-2 font-medium">PID</th>
              <th className="w-44 px-3 py-2 font-medium">State</th>
              <th className="w-44 px-3 py-2 font-medium">Who</th>
              <th className="w-28 px-3 py-2 font-medium">
                <span className="flex items-center gap-1">
                  Duration <ArrowDown className="size-3" />
                </span>
              </th>
              <th className="px-3 py-2 font-medium">Query</th>
              <th className="w-48 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = expanded === row.pid;
              const duration = row.state === "active" ? row.queryMs : row.stateMs;
              const long = row.state === "active" && (row.queryMs ?? 0) > 60_000;
              return (
                <tr
                  key={row.pid}
                  onClick={() => setExpanded(open ? null : row.pid)}
                  className={cn(
                    "border-t border-line align-top hover:bg-fg/3",
                    row.blockedBy.length > 0 && "bg-danger-soft/50",
                  )}
                >
                  <td className="px-3 py-2 font-mono tabular-nums">{row.pid}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <StatePill row={row} />
                      {row.waitEvent && (
                        <span className="text-[10.5px] text-fg-subtle">
                          {row.waitEventType}: {row.waitEvent}
                        </span>
                      )}
                      {row.blockedBy.length > 0 && (
                        <span className="text-[10.5px] text-danger">
                          blocked by {row.blockedBy.join(", ")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="truncate">{row.user ?? "—"}</div>
                    <div className="truncate text-[10.5px] text-fg-subtle">
                      {row.isSelf
                        ? "this app (monitor)"
                        : [row.application, row.client].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 whitespace-nowrap tabular-nums",
                      long && "font-semibold text-warning",
                    )}
                  >
                    {formatElapsed(duration)}
                  </td>
                  <td className="px-3 py-2">
                    <div
                      className={cn(
                        "font-mono text-[11.5px] break-words select-text",
                        open ? "whitespace-pre-wrap" : "truncate",
                      )}
                    >
                      {row.query || <span className="text-fg-subtle italic">no query</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-0.5">
                      {row.query && (
                        <IconButton
                          label="Open in a query tab"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openQuery(tab.connectionId, row.query);
                          }}
                        >
                          <Terminal className="size-3.5" />
                        </IconButton>
                      )}
                      {!row.isSelf && isClientBackend(row) && (
                        <>
                          {row.state === "active" && (
                            <ConfirmButton
                              label="Cancel"
                              confirm="Cancel?"
                              icon={<Ban className="size-3.5" />}
                              onConfirm={() => void signalBackend(tab.id, row.pid, false)}
                            />
                          )}
                          <ConfirmButton
                            label="Kill"
                            confirm="Terminate?"
                            icon={<Power className="size-3.5" />}
                            onConfirm={() => void signalBackend(tab.id, row.pid, true)}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-fg-muted">No sessions to show.</div>
        )}
      </div>
    </div>
  );
}

function SizeBar({ value, max, split }: { value: number; max: number; split?: number }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  const first = split !== undefined && value > 0 ? (split / value) * 100 : 100;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-fg/6">
      <div className="flex h-full" style={{ width: `${Math.max(width, value > 0 ? 1 : 0)}%` }}>
        <div className="h-full bg-accent" style={{ width: `${first}%` }} />
        {split !== undefined && <div className="ml-[2px] h-full flex-1 bg-accent/45" />}
      </div>
    </div>
  );
}

function when(value: string | null): string {
  if (value === null) return "never";
  const time = parseTemporal(value, "timestamp");
  return time === null ? value : relativeTime(time, Date.now());
}

function TablesPane({ tab }: { tab: ServerTabState }) {
  const data = tab.tables;
  const [sort, setSort] = useState<"size" | "rows" | "dead" | "scans">("size");
  const tables = useMemo(() => {
    const list = [...(data?.tables ?? [])];
    const dead = (t: TableHealth) => t.deadRows / Math.max(1, t.deadRows + t.liveRows);
    list.sort((a, b) => {
      switch (sort) {
        case "size":
          return b.totalBytes - a.totalBytes;
        case "rows":
          return b.liveRows - a.liveRows;
        case "dead":
          return dead(b) - dead(a);
        case "scans":
          return b.seqScans - a.seqScans;
      }
    });
    return list;
  }, [data, sort]);
  if (!data) return null;
  const max = Math.max(1, ...tables.map((t) => t.totalBytes));
  const total = tables.reduce((sum, t) => sum + t.totalBytes, 0);
  const flagged = tables.filter((t) => t.issues.length > 0).length;
  const header = (key: typeof sort, label: string, className = "") => (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button
        type="button"
        onClick={() => setSort(key)}
        className={cn("flex items-center gap-1", sort === key ? "text-fg" : "hover:text-fg")}
      >
        {label}
        {sort === key && <ArrowDown className="size-3" />}
      </button>
    </th>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Tile
          icon={<HardDrive />}
          label="Total size"
          value={formatBytes(total)}
          detail={`${tables.length} tables`}
        />
        <Tile
          icon={<TriangleAlert />}
          label="Tables needing attention"
          value={String(flagged)}
          tone={flagged > 0 ? "warning" : "neutral"}
        />
      </div>
      {data.statsReset && (
        <div className="text-[11.5px] text-fg-subtle">
          Scan counts since the statistics were reset {when(data.statsReset)}.
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-sunken text-left text-[11px] text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Table</th>
              {header("size", "Size", "w-72")}
              {header("rows", "Rows", "w-24")}
              {header("dead", "Dead", "w-20")}
              {header("scans", "Seq / index scans", "w-36")}
              <th className="w-44 px-3 py-2 font-medium">Vacuum · analyze</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => {
              const dead = t.deadRows / Math.max(1, t.deadRows + t.liveRows);
              return (
                <tr key={`${t.schema}.${t.name}`} className="border-t border-line align-top hover:bg-fg/3">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openTable(tab.connectionId, { schema: t.schema, name: t.name })}
                      className="font-medium hover:text-accent hover:underline"
                    >
                      {t.schema === "public" ? t.name : `${t.schema}.${t.name}`}
                    </button>
                    {t.issues.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.issues.map((issue) => (
                          <Badge key={issue} tone="warning">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="mb-1 flex justify-between gap-2 text-[11px] whitespace-nowrap tabular-nums">
                      <span>{formatBytes(t.totalBytes)}</span>
                      <span className="text-fg-subtle">
                        {formatBytes(t.tableBytes)} data · {formatBytes(t.indexBytes)} idx
                      </span>
                    </div>
                    <SizeBar value={t.totalBytes} max={max} split={t.tableBytes} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{t.liveRows.toLocaleString("en-US")}</td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      dead >= 0.2 && t.deadRows >= 1000 && "font-semibold text-warning",
                    )}
                  >
                    {Math.round(dead * 100)}%
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {t.seqScans.toLocaleString("en-US")} / {t.indexScans.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-fg-muted">
                    {when(t.lastVacuum)} · {when(t.lastAnalyze)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tables.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-fg-muted">No user tables.</div>
        )}
      </div>
    </div>
  );
}

function IndexesPane({ tab }: { tab: ServerTabState }) {
  const indexes = tab.indexes;
  if (!indexes) return null;
  const unused = indexes.filter((i) => i.unused);
  const wasted = unused.reduce((sum, i) => sum + i.bytes, 0);
  const max = Math.max(1, ...indexes.map((i) => i.bytes));
  const drop = (index: IndexUsage) =>
    `DROP INDEX CONCURRENTLY ${quoteIdent(index.schema)}.${quoteIdent(index.name)};`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Tile icon={<Database />} label="Indexes" value={String(indexes.length)} />
        <Tile
          icon={<TriangleAlert />}
          label="Never used"
          value={String(unused.length)}
          detail={unused.length > 0 ? `${formatBytes(wasted)} that every write still maintains` : undefined}
          tone={unused.length > 0 ? "warning" : "neutral"}
        />
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-sunken text-left text-[11px] text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Index</th>
              <th className="w-48 px-3 py-2 font-medium">Size</th>
              <th className="w-24 px-3 py-2 font-medium">Scans</th>
              <th className="w-40 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {indexes.map((index) => (
              <tr
                key={`${index.schema}.${index.name}`}
                className="border-t border-line align-top hover:bg-fg/3"
              >
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{index.name}</span>
                    <span className="text-fg-subtle">on {index.table}</span>
                    {index.isPrimary && <Badge tone="accent">primary</Badge>}
                    {index.isUnique && !index.isPrimary && <Badge>unique</Badge>}
                    {index.unused && <Badge tone="warning">unused</Badge>}
                  </div>
                  <div
                    className="mt-0.5 truncate font-mono text-[10.5px] text-fg-subtle"
                    title={index.definition}
                  >
                    {index.definition}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="mb-1 text-[11px] tabular-nums">{formatBytes(index.bytes)}</div>
                  <SizeBar value={index.bytes} max={max} />
                </td>
                <td className={cn("px-3 py-2 tabular-nums", index.unused && "text-warning")}>
                  {index.scans.toLocaleString("en-US")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {index.unused && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy className="size-3.5" />}
                      onClick={() => {
                        void copyText(drop(index));
                        pushToast({ tone: "info", title: `Copied DROP INDEX for ${index.name}` });
                      }}
                    >
                      Copy DROP
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {indexes.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-fg-muted">No indexes.</div>
        )}
      </div>
    </div>
  );
}

export function ServerTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is ServerTabState => t.id === tabId && t.kind === "server"),
  );
  const pane = tab?.pane;
  const paused = tab?.paused ?? false;
  const hasData = tab
    ? (pane === "activity" ? tab.activity : pane === "tables" ? tab.tables : tab.indexes) !== null
    : false;

  useEffect(() => {
    if (!hasData) void refreshServerTab(tabId);
  }, [tabId, pane, hasData]);

  useEffect(() => {
    if (pane !== "activity" || paused) return undefined;
    const timer = setInterval(() => void refreshServerTab(tabId), ACTIVITY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tabId, pane, paused]);

  if (!tab) return null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Segmented<ServerPane>
          size="sm"
          value={tab.pane}
          onChange={(next) => void setServerPane(tabId, next)}
          options={[
            { value: "activity", label: "Activity" },
            { value: "tables", label: "Tables" },
            { value: "indexes", label: "Indexes" },
          ]}
        />
        <span className="flex-1" />
        {tab.loading && <Spinner className="size-3.5 text-fg-muted" />}
        {tab.refreshedAt !== null && (
          <span className="text-[11.5px] text-fg-subtle">
            Updated {new Date(tab.refreshedAt).toLocaleTimeString("en-GB")}
          </span>
        )}
        {tab.pane === "activity" && (
          <IconButton
            label={tab.paused ? "Resume live updates" : "Pause live updates"}
            size="sm"
            active={!tab.paused}
            onClick={() => updateServerTab(tabId, { paused: !tab.paused })}
          >
            {tab.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </IconButton>
        )}
        <IconButton label="Refresh" size="sm" onClick={() => void refreshServerTab(tabId)}>
          <RefreshCw className="size-3.5" />
        </IconButton>
      </div>
      {tab.error && <ErrorBanner error={tab.error} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!hasData && !tab.error ? (
          <EmptyState icon={<Spinner className="size-5" />} title="Loading statistics…" />
        ) : tab.pane === "activity" ? (
          <ActivityPane tab={tab} />
        ) : tab.pane === "tables" ? (
          <TablesPane tab={tab} />
        ) : (
          <IndexesPane tab={tab} />
        )}
      </div>
    </div>
  );
}
