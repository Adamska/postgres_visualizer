// Server monitoring: SQL for sessions (pg_stat_activity), table and index statistics, and the
// typed rows parsed from their results, with the flags shown in the UI.

import type { CellValue, QueryResult } from "@/lib/types";

import { booleanValue } from "../format/values";

export const ACTIVITY_SQL = `SELECT pid, usename, datname, application_name, client_addr::text AS client,
  backend_type, state, wait_event_type, wait_event,
  (extract(epoch FROM now() - query_start) * 1000)::bigint AS query_ms,
  (extract(epoch FROM now() - xact_start) * 1000)::bigint AS xact_ms,
  (extract(epoch FROM now() - state_change) * 1000)::bigint AS state_ms,
  pg_blocking_pids(pid)::text AS blocked_by,
  pid = pg_backend_pid() AS is_self,
  current_setting('max_connections') AS max_connections,
  query
FROM pg_stat_activity
ORDER BY query_start NULLS LAST`;

export const TABLE_HEALTH_SQL = `SELECT s.schemaname AS schema, s.relname AS name,
  pg_total_relation_size(s.relid) AS total_bytes,
  pg_relation_size(s.relid) AS table_bytes,
  pg_indexes_size(s.relid) AS index_bytes,
  s.n_live_tup AS live_rows, s.n_dead_tup AS dead_rows,
  s.seq_scan, s.seq_tup_read, coalesce(s.idx_scan, 0) AS idx_scan,
  greatest(s.last_vacuum, s.last_autovacuum)::text AS last_vacuum,
  greatest(s.last_analyze, s.last_autoanalyze)::text AS last_analyze,
  (SELECT stats_reset::text FROM pg_stat_database WHERE datname = current_database()) AS stats_reset
FROM pg_stat_user_tables s
ORDER BY pg_total_relation_size(s.relid) DESC, s.schemaname, s.relname
LIMIT 1000`;

export const INDEX_USAGE_SQL = `SELECT s.schemaname AS schema, s.relname AS table_name, s.indexrelname AS name,
  pg_relation_size(s.indexrelid) AS bytes, s.idx_scan AS scans,
  i.indisunique AS is_unique, i.indisprimary AS is_primary,
  pg_get_indexdef(s.indexrelid) AS definition
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
ORDER BY pg_relation_size(s.indexrelid) DESC, s.schemaname, s.indexrelname
LIMIT 1000`;

export function cancelBackendSql(pid: number): string {
  return `SELECT pg_cancel_backend(${Math.trunc(pid)})`;
}

export function terminateBackendSql(pid: number): string {
  return `SELECT pg_terminate_backend(${Math.trunc(pid)})`;
}

/** Rows of a result as objects keyed by column name. */
export function recordsOf(result: QueryResult): Record<string, CellValue>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((c, i) => [c.name, row[i] ?? null])));
}

function int(value: CellValue | undefined): number {
  const parsed = value === null || value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalInt(value: CellValue | undefined): number | null {
  return value === null || value === undefined ? null : int(value);
}

/** `{12,34}` → [12, 34]. */
export function parsePidList(value: CellValue | undefined): number[] {
  if (!value) return [];
  return value
    .replace(/[{}]/g, "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export interface ActivityRow {
  pid: number;
  user: string | null;
  database: string | null;
  application: string | null;
  client: string | null;
  backendType: string | null;
  state: string | null;
  waitEventType: string | null;
  waitEvent: string | null;
  queryMs: number | null;
  transactionMs: number | null;
  stateMs: number | null;
  blockedBy: number[];
  isSelf: boolean;
  query: string;
}

export interface ActivitySnapshot {
  rows: ActivityRow[];
  maxConnections: number | null;
}

export function parseActivity(result: QueryResult): ActivitySnapshot {
  const records = recordsOf(result);
  const rows = records.map((r) => ({
    pid: int(r.pid),
    user: r.usename ?? null,
    database: r.datname ?? null,
    application: r.application_name === "" ? null : (r.application_name ?? null),
    client: r.client ?? null,
    backendType: r.backend_type ?? null,
    state: r.state ?? null,
    waitEventType: r.wait_event_type ?? null,
    waitEvent: r.wait_event ?? null,
    queryMs: optionalInt(r.query_ms),
    transactionMs: optionalInt(r.xact_ms),
    stateMs: optionalInt(r.state_ms),
    blockedBy: parsePidList(r.blocked_by),
    isSelf: booleanValue(r.is_self) === true,
    query: r.query ?? "",
  }));
  return { rows, maxConnections: optionalInt(records[0]?.max_connections) };
}

/** Client sessions, as opposed to autovacuum, WAL writers and other background processes. */
export function isClientBackend(row: ActivityRow): boolean {
  return row.backendType === null || row.backendType === "client backend";
}

export interface ActivitySummary {
  total: number;
  active: number;
  idle: number;
  idleInTransaction: number;
  waiting: number;
  blocked: number;
}

export function summarizeActivity(rows: readonly ActivityRow[]): ActivitySummary {
  const clients = rows.filter(isClientBackend);
  return {
    total: clients.length,
    active: clients.filter((r) => r.state === "active").length,
    idle: clients.filter((r) => r.state === "idle").length,
    idleInTransaction: clients.filter((r) => r.state?.startsWith("idle in transaction") ?? false).length,
    waiting: clients.filter((r) => r.state === "active" && r.waitEventType === "Lock").length,
    blocked: clients.filter((r) => r.blockedBy.length > 0).length,
  };
}

/** Longest running first; idle sessions last. */
export function sortActivity(rows: readonly ActivityRow[]): ActivityRow[] {
  const rank = (row: ActivityRow) => (row.state === "active" ? 0 : row.state?.startsWith("idle in") ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || (b.queryMs ?? -1) - (a.queryMs ?? -1) || a.pid - b.pid,
  );
}

export interface TableHealth {
  schema: string;
  name: string;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  liveRows: number;
  deadRows: number;
  seqScans: number;
  seqRowsRead: number;
  indexScans: number;
  lastVacuum: string | null;
  lastAnalyze: string | null;
  issues: string[];
}

export const DEAD_ROW_THRESHOLD = 1000;
export const DEAD_RATIO_THRESHOLD = 0.2;
export const LARGE_TABLE_ROWS = 10_000;

export function tableIssues(table: Omit<TableHealth, "issues">): string[] {
  const issues: string[] = [];
  const total = table.liveRows + table.deadRows;
  const ratio = total === 0 ? 0 : table.deadRows / total;
  if (table.deadRows >= DEAD_ROW_THRESHOLD && ratio >= DEAD_RATIO_THRESHOLD) {
    issues.push(`${Math.round(ratio * 100)}% dead rows: needs VACUUM`);
  }
  if (table.liveRows >= LARGE_TABLE_ROWS && table.seqScans > table.indexScans && table.seqScans >= 50) {
    issues.push("Mostly read by sequential scans");
  }
  if (table.lastAnalyze === null && table.liveRows > 0) issues.push("Never analyzed");
  return issues;
}

export function parseTableHealth(result: QueryResult): { tables: TableHealth[]; statsReset: string | null } {
  const records = recordsOf(result);
  const tables = records.map((r) => {
    const table = {
      schema: r.schema ?? "",
      name: r.name ?? "",
      totalBytes: int(r.total_bytes),
      tableBytes: int(r.table_bytes),
      indexBytes: int(r.index_bytes),
      liveRows: int(r.live_rows),
      deadRows: int(r.dead_rows),
      seqScans: int(r.seq_scan),
      seqRowsRead: int(r.seq_tup_read),
      indexScans: int(r.idx_scan),
      lastVacuum: r.last_vacuum ?? null,
      lastAnalyze: r.last_analyze ?? null,
    };
    return { ...table, issues: tableIssues(table) };
  });
  return { tables, statsReset: records[0]?.stats_reset ?? null };
}

export interface IndexUsage {
  schema: string;
  table: string;
  name: string;
  bytes: number;
  scans: number;
  isUnique: boolean;
  isPrimary: boolean;
  definition: string;
  /** Never scanned and not enforcing uniqueness: a candidate for removal. */
  unused: boolean;
}

export function parseIndexUsage(result: QueryResult): IndexUsage[] {
  return recordsOf(result).map((r) => {
    const isUnique = booleanValue(r.is_unique) === true;
    const isPrimary = booleanValue(r.is_primary) === true;
    const scans = int(r.scans);
    return {
      schema: r.schema ?? "",
      table: r.table_name ?? "",
      name: r.name ?? "",
      bytes: int(r.bytes),
      scans,
      isUnique,
      isPrimary,
      definition: r.definition ?? "",
      unused: scans === 0 && !isUnique && !isPrimary,
    };
  });
}

/** 1536 → "1.5 kB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** "3.2 s", "4 min 12 s", "2 h 5 min". */
export function formatElapsed(ms: number | null): string {
  if (ms === null || ms < 0) return "";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
