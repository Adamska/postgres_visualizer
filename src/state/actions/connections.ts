// Opening connections, watching their health and caching their schema objects.

import { tableKey } from "@/core/completion/engine";
import { backend } from "@/lib/backend";
import { withoutKey } from "@/lib/records";
import { toAppError, type ConnectionProfile, type TableRef, type TableStructure } from "@/lib/types";

import { getState, mutate, mutateConnection, pushToast, type ConnectionState } from "../store";
import { loadPassword, markConnected } from "./profiles";
import { persistWorkspace } from "./workspace";

/** Makes a session refuse writes on the server side. */
export const READ_ONLY_SQL = "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY";

/** How often open connections are pinged. */
export const HEALTH_CHECK_INTERVAL_MS = 30_000;

function emptyConnection(profile: ConnectionProfile): ConnectionState {
  return {
    id: profile.id,
    profile,
    sessionId: null,
    status: "connecting",
    error: null,
    serverVersion: "",
    schemas: [],
    relations: {},
    functions: {},
    structures: {},
    expandedSchemas: ["public"],
    loadingSchemas: [],
    schemaLoading: false,
  };
}

export function connectionParams(profile: ConnectionProfile, password: string | null) {
  return {
    host: profile.host,
    port: profile.port,
    database: profile.database,
    username: profile.username,
    password,
    sslMode: profile.sslMode,
  };
}

/** Opens the shared session of a connection and loads its schemas. Throws on failure. */
async function openSession(profile: ConnectionProfile): Promise<void> {
  const password = await loadPassword(profile.id);
  const sessionId = await backend().connect(connectionParams(profile, password));
  if (profile.readOnly) await backend().executeSql(sessionId, READ_ONLY_SQL, null);
  let serverVersion = "";
  try {
    serverVersion = await backend().serverVersion(sessionId);
  } catch {
    // Version is informational only.
  }
  mutateConnection(profile.id, (connection) => {
    connection.sessionId = sessionId;
    connection.status = "connected";
    connection.error = null;
    connection.serverVersion = serverVersion;
  });
  await markConnected(profile.id);
  await refreshSchemas(profile.id);
}

/** Opens (or re-opens) a connection for a profile. Returns whether it succeeded. */
export async function connect(profile: ConnectionProfile): Promise<boolean> {
  const existing = getState().connections[profile.id];
  if (existing?.status === "connected") {
    mutate((draft) => {
      draft.activeConnectionId = profile.id;
    });
    return true;
  }
  if (existing?.status === "disconnected") return reconnect(profile.id);
  mutate((draft) => {
    draft.connections[profile.id] = emptyConnection(profile);
    if (!draft.connectionOrder.includes(profile.id)) draft.connectionOrder.push(profile.id);
    draft.activeConnectionId = profile.id;
  });
  try {
    await openSession(profile);
    persistWorkspace();
    return true;
  } catch (error) {
    const message = toAppError(error).message;
    mutate((draft) => {
      draft.connections = withoutKey(draft.connections, profile.id);
      draft.connectionOrder = draft.connectionOrder.filter((id) => id !== profile.id);
      if (draft.activeConnectionId === profile.id) {
        draft.activeConnectionId = draft.connectionOrder[0] ?? null;
      }
    });
    pushToast({ tone: "error", title: `Could not connect to ${profile.name || profile.host}`, message });
    return false;
  }
}

/** Closes the sessions of a connection's query tabs; they are reopened lazily. */
async function dropTabSessions(id: string): Promise<void> {
  const tabs = getState().tabs.filter((t) => t.connectionId === id);
  for (const tab of tabs) {
    if (tab.kind === "query" && tab.sessionId) {
      await backend()
        .disconnect(tab.sessionId)
        .catch(() => undefined);
    }
  }
  mutate((draft) => {
    for (const tab of draft.tabs) {
      if (tab.connectionId === id && tab.kind === "query") {
        tab.sessionId = null;
        tab.inTransaction = false;
      }
    }
  });
}

/**
 * Marks a connection as lost. Tabs keep what they last loaded; the banner offers to reconnect.
 * Query-tab sessions are dropped so they do not report the same failure again.
 */
export function markDisconnected(id: string, message: string): void {
  const connection = getState().connections[id];
  if (!connection || connection.status === "disconnected" || connection.status === "connecting") return;
  const sessionId = connection.sessionId;
  mutateConnection(id, (c) => {
    c.status = "disconnected";
    c.error = message;
    c.sessionId = null;
  });
  if (sessionId) {
    void backend()
      .disconnect(sessionId)
      .catch(() => undefined);
  }
  void dropTabSessions(id);
}

/** Re-opens a lost connection, keeping its tabs. Returns whether it succeeded. */
export async function reconnect(id: string): Promise<boolean> {
  const connection = getState().connections[id];
  if (!connection || connection.status === "connecting") return false;
  const previous = connection.sessionId;
  mutateConnection(id, (c) => {
    c.status = "connecting";
    c.error = null;
    c.sessionId = null;
  });
  if (previous) {
    await backend()
      .disconnect(previous)
      .catch(() => undefined);
  }
  await dropTabSessions(id);
  try {
    await openSession(connection.profile);
    pushToast({
      tone: "success",
      title: `Reconnected to ${connection.profile.name || connection.profile.host}`,
    });
    return true;
  } catch (error) {
    mutateConnection(id, (c) => {
      c.status = "disconnected";
      c.error = toAppError(error).message;
    });
    return false;
  }
}

/** Pings a connection and marks it lost when the server no longer answers. */
export async function checkConnection(id: string): Promise<boolean> {
  const connection = getState().connections[id];
  if (!connection?.sessionId || connection.status !== "connected") return false;
  const alive = await backend()
    .ping(connection.sessionId)
    .catch(() => false);
  if (!alive) markDisconnected(id, "The server stopped answering.");
  return alive;
}

/** Pings every open connection. */
export async function checkConnections(): Promise<void> {
  await Promise.all(getState().connectionOrder.map((id) => checkConnection(id)));
}

/** Starts the periodic health check; also checks when the window regains focus. Returns a stop function. */
export function startConnectionWatch(): () => void {
  const timer = setInterval(() => void checkConnections(), HEALTH_CHECK_INTERVAL_MS);
  const onFocus = () => void checkConnections();
  window.addEventListener("focus", onFocus);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  };
}

/** Called with any error from a session; connection errors trigger a health check. */
export async function noteFailure(id: string, error: unknown): Promise<void> {
  if (toAppError(error).kind === "connection") await checkConnection(id);
}

export async function disconnect(id: string): Promise<void> {
  const state = getState();
  const connection = state.connections[id];
  await dropTabSessions(id);
  if (connection?.sessionId) {
    await backend()
      .disconnect(connection.sessionId)
      .catch(() => undefined);
  }
  mutate((draft) => {
    draft.tabs = draft.tabs.filter((t) => t.connectionId !== id);
    draft.connections = withoutKey(draft.connections, id);
    draft.connectionOrder = draft.connectionOrder.filter((c) => c !== id);
    if (draft.activeConnectionId === id) draft.activeConnectionId = draft.connectionOrder[0] ?? null;
    if (!draft.tabs.some((t) => t.id === draft.activeTabId)) {
      draft.activeTabId = draft.tabs.at(-1)?.id ?? null;
    }
  });
  persistWorkspace();
}

export async function refreshSchemas(id: string): Promise<void> {
  const connection = getState().connections[id];
  if (!connection?.sessionId) return;
  mutateConnection(id, (c) => {
    c.schemaLoading = true;
  });
  try {
    const schemas = await backend().listSchemas(connection.sessionId);
    mutateConnection(id, (c) => {
      c.schemas = schemas;
      c.relations = {};
      c.functions = {};
      c.structures = {};
    });
    for (const schema of connection.expandedSchemas) await loadSchemaObjects(id, schema);
  } catch (error) {
    mutateConnection(id, (c) => {
      c.status = "failed";
      c.error = toAppError(error).message;
    });
    await noteFailure(id, error);
  } finally {
    mutateConnection(id, (c) => {
      c.schemaLoading = false;
    });
  }
}

/** Loads the relations and functions of a schema on first expansion. */
export async function loadSchemaObjects(id: string, schema: string): Promise<void> {
  const connection = getState().connections[id];
  if (
    !connection?.sessionId ||
    schema in connection.relations ||
    connection.loadingSchemas.includes(schema)
  ) {
    return;
  }
  const sessionId = connection.sessionId;
  mutateConnection(id, (c) => {
    c.loadingSchemas.push(schema);
  });
  try {
    const [relations, functions] = await Promise.all([
      backend().listRelations(sessionId, schema),
      backend().listFunctions(sessionId, schema),
    ]);
    mutateConnection(id, (c) => {
      c.relations[schema] = relations;
      c.functions[schema] = functions;
    });
  } catch (error) {
    mutateConnection(id, (c) => {
      c.relations[schema] = [];
      c.functions[schema] = [];
    });
    await noteFailure(id, error);
    pushToast({
      tone: "error",
      title: `Could not load schema ${schema}`,
      message: toAppError(error).message,
    });
  } finally {
    mutateConnection(id, (c) => {
      c.loadingSchemas = c.loadingSchemas.filter((s) => s !== schema);
    });
  }
}

export function toggleSchema(id: string, schema: string): void {
  const connection = getState().connections[id];
  if (!connection) return;
  const expanded = connection.expandedSchemas.includes(schema);
  mutateConnection(id, (c) => {
    c.expandedSchemas = expanded
      ? c.expandedSchemas.filter((s) => s !== schema)
      : [...c.expandedSchemas, schema];
  });
  if (!expanded) void loadSchemaObjects(id, schema);
}

function notConnected(connection: ConnectionState | undefined) {
  const message =
    connection?.status === "disconnected"
      ? "The connection was lost. Reconnect to continue."
      : "Not connected.";
  return toAppError({ kind: "connection", message });
}

/** Loads (and caches) the structure of a relation. */
export async function loadStructure(id: string, table: TableRef, force = false): Promise<TableStructure> {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw notConnected(connection);
  const key = tableKey(table);
  const cached = connection.structures[key];
  if (cached && !force) return cached;
  try {
    const structure = await backend().tableStructure(connection.sessionId, table.schema, table.name);
    mutateConnection(id, (c) => {
      c.structures[key] = structure;
    });
    return structure;
  } catch (error) {
    await noteFailure(id, error);
    throw error;
  }
}

/** Executes on the connection's shared session. */
export async function executeOn(id: string, sql: string, rowLimit: number | null = null) {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw notConnected(connection);
  try {
    return await backend().executeSql(connection.sessionId, sql, rowLimit);
  } catch (error) {
    await noteFailure(id, error);
    throw error;
  }
}

export async function executeTransactionOn(id: string, statements: string[]) {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw notConnected(connection);
  try {
    return await backend().executeTransaction(connection.sessionId, statements);
  } catch (error) {
    await noteFailure(id, error);
    throw error;
  }
}

/** Every loaded relation across schemas, for completion and quick open. */
export function allRelations(connection: ConnectionState) {
  return Object.values(connection.relations).flat();
}
