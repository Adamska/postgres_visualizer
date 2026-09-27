// Typed bridge to the Rust commands. Swappable so the UI can run against a mock in tests.

import { invoke } from "@tauri-apps/api/core";

import type {
  ConnectionParams,
  FunctionInfo,
  PasswordStorage,
  QueryResult,
  RelationInfo,
  SchemaGraph,
  SchemaInfo,
  TableStructure,
} from "./types";

export interface Backend {
  connect(params: ConnectionParams): Promise<string>;
  testConnection(params: ConnectionParams): Promise<string>;
  disconnect(sessionId: string): Promise<void>;
  serverVersion(sessionId: string): Promise<string>;
  executeSql(sessionId: string, sql: string, rowLimit: number | null): Promise<QueryResult>;
  executeTransaction(sessionId: string, statements: string[]): Promise<QueryResult[]>;
  /** Whether the session still answers; `false` for unknown sessions. */
  ping(sessionId: string): Promise<boolean>;
  cancelQuery(sessionId: string): Promise<void>;
  listSchemas(sessionId: string): Promise<SchemaInfo[]>;
  listRelations(sessionId: string, schema: string): Promise<RelationInfo[]>;
  listFunctions(sessionId: string, schema: string): Promise<FunctionInfo[]>;
  tableStructure(sessionId: string, schema: string, name: string): Promise<TableStructure>;
  schemaGraph(sessionId: string, schema: string): Promise<SchemaGraph>;
  loadDocument<T>(name: string): Promise<T | null>;
  saveDocument(name: string, value: unknown): Promise<void>;
  getPassword(profileId: string, storage: PasswordStorage): Promise<string | null>;
  setPassword(profileId: string, password: string | null, storage: PasswordStorage): Promise<void>;
}

const tauriBackend: Backend = {
  connect: (params) => invoke("connect", { params }),
  testConnection: (params) => invoke("test_connection", { params }),
  disconnect: (sessionId) => invoke("disconnect", { sessionId }),
  serverVersion: (sessionId) => invoke("server_version", { sessionId }),
  executeSql: (sessionId, sql, rowLimit) => invoke("execute_sql", { sessionId, sql, rowLimit }),
  executeTransaction: (sessionId, statements) => invoke("execute_transaction", { sessionId, statements }),
  ping: (sessionId) => invoke("ping", { sessionId }),
  cancelQuery: (sessionId) => invoke("cancel_query", { sessionId }),
  listSchemas: (sessionId) => invoke("list_schemas", { sessionId }),
  listRelations: (sessionId, schema) => invoke("list_relations", { sessionId, schema }),
  listFunctions: (sessionId, schema) => invoke("list_functions", { sessionId, schema }),
  tableStructure: (sessionId, schema, name) => invoke("table_structure", { sessionId, schema, name }),
  schemaGraph: (sessionId, schema) => invoke("schema_graph", { sessionId, schema }),
  loadDocument: <T>(name: string) => invoke<T | null>("load_document", { name }),
  saveDocument: (name, value) => invoke("save_document", { name, value }),
  getPassword: (profileId, storage) => invoke("get_password", { profileId, storage }),
  setPassword: (profileId, password, storage) => invoke("set_password", { profileId, password, storage }),
};

let current: Backend = tauriBackend;

/** The active backend. */
export function backend(): Backend {
  return current;
}

/** Replaces the backend, for tests and previews. Returns a restore function. */
export function installBackend(replacement: Backend): () => void {
  const previous = current;
  current = replacement;
  return () => {
    current = previous;
  };
}
