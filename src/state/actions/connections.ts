// Opening connections and caching their schema objects.

import { tableKey } from "@/core/completion/engine";
import { backend } from "@/lib/backend";
import { withoutKey } from "@/lib/records";
import { toAppError, type ConnectionProfile, type TableRef, type TableStructure } from "@/lib/types";

import { getState, mutate, mutateConnection, pushToast, type ConnectionState } from "../store";
import { loadPassword, markConnected } from "./profiles";
import { persistWorkspace } from "./workspace";

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

/** Opens (or re-opens) a connection for a profile. Returns whether it succeeded. */
export async function connect(profile: ConnectionProfile): Promise<boolean> {
  const existing = getState().connections[profile.id];
  if (existing?.status === "connected") {
    mutate((draft) => {
      draft.activeConnectionId = profile.id;
    });
    return true;
  }
  mutate((draft) => {
    draft.connections[profile.id] = emptyConnection(profile);
    if (!draft.connectionOrder.includes(profile.id)) draft.connectionOrder.push(profile.id);
    draft.activeConnectionId = profile.id;
  });
  try {
    const password = await loadPassword(profile.id);
    const sessionId = await backend().connect(connectionParams(profile, password));
    let serverVersion = "";
    try {
      serverVersion = await backend().serverVersion(sessionId);
    } catch {
      // Version is informational only.
    }
    mutateConnection(profile.id, (connection) => {
      connection.sessionId = sessionId;
      connection.status = "connected";
      connection.serverVersion = serverVersion;
    });
    await markConnected(profile.id);
    await refreshSchemas(profile.id);
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

export async function disconnect(id: string): Promise<void> {
  const state = getState();
  const connection = state.connections[id];
  const tabs = state.tabs.filter((t) => t.connectionId === id);
  for (const tab of tabs) {
    if (tab.kind === "query" && tab.sessionId) {
      await backend()
        .disconnect(tab.sessionId)
        .catch(() => undefined);
    }
  }
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

/** Loads (and caches) the structure of a relation. */
export async function loadStructure(id: string, table: TableRef, force = false): Promise<TableStructure> {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw toAppError({ kind: "connection", message: "Not connected." });
  const key = tableKey(table);
  const cached = connection.structures[key];
  if (cached && !force) return cached;
  const structure = await backend().tableStructure(connection.sessionId, table.schema, table.name);
  mutateConnection(id, (c) => {
    c.structures[key] = structure;
  });
  return structure;
}

/** Executes on the connection's shared session. */
export async function executeOn(id: string, sql: string, rowLimit: number | null = null) {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw toAppError({ kind: "connection", message: "Not connected." });
  return backend().executeSql(connection.sessionId, sql, rowLimit);
}

export async function executeTransactionOn(id: string, statements: string[]) {
  const connection = getState().connections[id];
  if (!connection?.sessionId) throw toAppError({ kind: "connection", message: "Not connected." });
  return backend().executeTransaction(connection.sessionId, statements);
}

/** Every loaded relation across schemas, for completion and quick open. */
export function allRelations(connection: ConnectionState) {
  return Object.values(connection.relations).flat();
}
