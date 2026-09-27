// In-memory backend for tests and previews.

import type { Backend } from "@/lib/backend";
import type {
  AppError,
  FunctionInfo,
  QueryResult,
  RelationInfo,
  SchemaGraph,
  SchemaInfo,
  TableStructure,
} from "@/lib/types";

export const USERS = { schema: "public", name: "users" };

export const USERS_STRUCTURE: TableStructure = {
  schema: "public",
  name: "users",
  kind: "table",
  comment: "People",
  columns: [
    {
      name: "id",
      ordinal: 1,
      typeName: "integer",
      typeOid: 23,
      kind: "integer",
      isNullable: false,
      defaultValue: null,
      isPrimaryKey: true,
      isIdentity: true,
      isGenerated: false,
      comment: null,
      enumValues: null,
    },
    {
      name: "email",
      ordinal: 2,
      typeName: "text",
      typeOid: 25,
      kind: "text",
      isNullable: false,
      defaultValue: null,
      isPrimaryKey: false,
      isIdentity: false,
      isGenerated: false,
      comment: null,
      enumValues: null,
    },
    {
      name: "is_active",
      ordinal: 3,
      typeName: "boolean",
      typeOid: 16,
      kind: "boolean",
      isNullable: true,
      defaultValue: "true",
      isPrimaryKey: false,
      isIdentity: false,
      isGenerated: false,
      comment: null,
      enumValues: null,
    },
    {
      name: "profile",
      ordinal: 4,
      typeName: "jsonb",
      typeOid: 3802,
      kind: "json",
      isNullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      isIdentity: false,
      isGenerated: false,
      comment: null,
      enumValues: null,
    },
    {
      name: "team_id",
      ordinal: 5,
      typeName: "integer",
      typeOid: 23,
      kind: "integer",
      isNullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      isIdentity: false,
      isGenerated: false,
      comment: null,
      enumValues: null,
    },
  ],
  indexes: [
    {
      name: "users_pkey",
      definition: "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)",
      isUnique: true,
      isPrimary: true,
      columns: ["id"],
    },
  ],
  constraints: [{ name: "users_pkey", kind: "primaryKey", definition: "PRIMARY KEY (id)", columns: ["id"] }],
  foreignKeys: [
    {
      name: "users_team_fk",
      columns: ["team_id"],
      referencedSchema: "public",
      referencedTable: "teams",
      referencedColumns: ["id"],
    },
  ],
  referencedBy: [
    {
      name: "orders_user_fk",
      schema: "public",
      table: "orders",
      columns: ["user_id"],
      referencedColumns: ["id"],
    },
  ],
};

export const TEAMS_STRUCTURE: TableStructure = {
  schema: "public",
  name: "teams",
  kind: "table",
  comment: null,
  columns: [
    { ...USERS_STRUCTURE.columns[0]!, name: "id" },
    { ...USERS_STRUCTURE.columns[1]!, name: "name", ordinal: 2 },
  ],
  indexes: [],
  constraints: [],
  foreignKeys: [],
  referencedBy: [
    {
      name: "users_team_fk",
      schema: "public",
      table: "users",
      columns: ["team_id"],
      referencedColumns: ["id"],
    },
  ],
};

export const TEAMS_RESULT: QueryResult = {
  columns: [
    { name: "id", typeOid: 23, typeName: "integer", kind: "integer" },
    { name: "name", typeOid: 25, typeName: "text", kind: "text" },
  ],
  rows: [["1", "Core"]],
  affectedRows: null,
  durationMs: 1,
  truncated: false,
};

export const PUBLIC_GRAPH: SchemaGraph = {
  schema: "public",
  tables: [
    {
      name: "teams",
      kind: "table",
      estimatedRows: 1,
      columns: [
        { name: "id", typeName: "integer", isPrimaryKey: true, isNullable: false },
        { name: "name", typeName: "text", isPrimaryKey: false, isNullable: false },
      ],
    },
    {
      name: "users",
      kind: "table",
      estimatedRows: 3,
      columns: USERS_STRUCTURE.columns.map((c) => ({
        name: c.name,
        typeName: c.typeName,
        isPrimaryKey: c.isPrimaryKey,
        isNullable: c.isNullable,
      })),
    },
  ],
  foreignKeys: [
    {
      name: "users_team_fk",
      table: "users",
      columns: ["team_id"],
      referencedSchema: "public",
      referencedTable: "teams",
      referencedColumns: ["id"],
    },
  ],
};

export const USERS_RESULT: QueryResult = {
  columns: USERS_STRUCTURE.columns.map((c) => ({
    name: c.name,
    typeOid: c.typeOid,
    typeName: c.typeName,
    kind: c.kind,
  })),
  rows: [
    [
      "1",
      "ann@example.com",
      "true",
      '{"theme": "dark", "notifications": {"email": true, "push": false, "digest": "weekly"}, "tags": ["admin", "beta"], "score": 42.5, "bio": null}',
      "1",
    ],
    ["2", "bob@example.com", "false", null, null],
    ["3", "cy@example.com", "true", "[]", "1"],
  ],
  affectedRows: null,
  durationMs: 3,
  truncated: false,
};

export interface MockOptions {
  connectError?: AppError;
  executeError?: AppError;
  results?: Record<string, QueryResult>;
  /** Answers statements not covered by `results`, before the built-in defaults. */
  resolve?: (sql: string) => QueryResult | undefined;
}

export interface MockBackend extends Backend {
  executed: string[];
  documents: Record<string, unknown>;
  passwords: Record<string, string>;
  /** Password reads, to check the cache. */
  passwordReads: string[];
  sessions: string[];
  closed: string[];
  /** Answer of `ping`; flip it to simulate a lost server. */
  alive: boolean;
  /** Extra statement answers, replaceable after creation (previews). */
  resolve: ((sql: string) => QueryResult | undefined) | undefined;
}

export function createMockBackend(options: MockOptions = {}): MockBackend {
  const relations: RelationInfo[] = [
    { schema: "public", name: "users", kind: "table", estimatedRows: 3, comment: null },
    { schema: "public", name: "teams", kind: "table", estimatedRows: 1, comment: null },
    { schema: "public", name: "active_users", kind: "view", estimatedRows: null, comment: null },
  ];
  const functions: FunctionInfo[] = [
    {
      schema: "public",
      name: "user_count",
      arguments: "",
      returnType: "bigint",
      language: "sql",
      isProcedure: false,
    },
  ];
  const schemas: SchemaInfo[] = [
    { name: "public", owner: "postgres", isSystem: false },
    { name: "pg_catalog", owner: "postgres", isSystem: true },
  ];
  let counter = 0;
  const mock: MockBackend = {
    executed: [],
    documents: {},
    passwords: {},
    passwordReads: [],
    sessions: [],
    closed: [],
    alive: true,
    resolve: options.resolve,
    connect: (params) => {
      if (options.connectError) return Promise.reject(options.connectError);
      if (!mock.alive) {
        const error: AppError = {
          kind: "connection",
          message: "Could not connect to the server.",
          detail: null,
          hint: null,
          sqlState: null,
          position: null,
        };
        return Promise.reject(error);
      }
      if (params.password === "wrong") {
        const error: AppError = {
          kind: "authentication",
          message: "password authentication failed",
          detail: null,
          hint: null,
          sqlState: "28P01",
          position: null,
        };
        return Promise.reject(error);
      }
      counter += 1;
      const id = `session-${counter}`;
      mock.sessions.push(id);
      return Promise.resolve(id);
    },
    testConnection: () => Promise.resolve("17.0"),
    disconnect: (sessionId) => {
      mock.closed.push(sessionId);
      return Promise.resolve();
    },
    serverVersion: () => Promise.resolve("17.0 (mock)"),
    executeSql: (_sessionId, sql) => {
      mock.executed.push(sql);
      if (options.executeError) return Promise.reject(options.executeError);
      if (!mock.alive) {
        const error: AppError = {
          kind: "connection",
          message: "The connection was closed.",
          detail: null,
          hint: null,
          sqlState: null,
          position: null,
        };
        return Promise.reject(error);
      }
      const custom = options.results?.[sql] ?? mock.resolve?.(sql);
      if (custom) return Promise.resolve(custom);
      if (sql.includes(`FROM "public"."teams"`)) return Promise.resolve(TEAMS_RESULT);
      if (sql.startsWith("SELECT count(*)")) {
        return Promise.resolve({
          columns: [{ name: "count", typeOid: 20, typeName: "int8", kind: "integer" }],
          rows: [["3"]],
          affectedRows: null,
          durationMs: 1,
          truncated: false,
        });
      }
      if (/^\s*(insert|update|delete)/i.test(sql)) {
        return Promise.resolve({ columns: [], rows: [], affectedRows: 1, durationMs: 1, truncated: false });
      }
      if (/^\s*(begin|commit|rollback|create|drop)/i.test(sql)) {
        return Promise.resolve({
          columns: [],
          rows: [],
          affectedRows: null,
          durationMs: 1,
          truncated: false,
        });
      }
      return Promise.resolve(USERS_RESULT);
    },
    executeTransaction: async (sessionId, statements) => {
      const results: QueryResult[] = [];
      mock.executed.push("BEGIN");
      for (const statement of statements) results.push(await mock.executeSql(sessionId, statement, null));
      mock.executed.push("COMMIT");
      return results;
    },
    ping: (sessionId) => Promise.resolve(mock.alive && mock.sessions.includes(sessionId)),
    cancelQuery: () => Promise.resolve(),
    listSchemas: () => Promise.resolve(schemas),
    listRelations: (_s, schema) => Promise.resolve(relations.filter((r) => r.schema === schema)),
    listFunctions: (_s, schema) => Promise.resolve(functions.filter((f) => f.schema === schema)),
    tableStructure: (_s, schema, name) => {
      if (schema === "public" && name === "users") return Promise.resolve(USERS_STRUCTURE);
      if (schema === "public" && name === "teams") return Promise.resolve(TEAMS_STRUCTURE);
      if (schema === "public" && name === "active_users") {
        return Promise.resolve({
          ...USERS_STRUCTURE,
          name: "active_users",
          kind: "view",
          foreignKeys: [],
          referencedBy: [],
        });
      }
      const error: AppError = {
        kind: "server",
        message: `relation "${name}" does not exist`,
        detail: null,
        hint: null,
        sqlState: "42P01",
        position: null,
      };
      return Promise.reject(error);
    },
    schemaGraph: (_s, schema) =>
      Promise.resolve(schema === "public" ? PUBLIC_GRAPH : { schema, tables: [], foreignKeys: [] }),
    loadDocument: <T>(name: string) => Promise.resolve((mock.documents[name] as T | undefined) ?? null),
    saveDocument: (name, value) => {
      mock.documents[name] = JSON.parse(JSON.stringify(value)) as unknown;
      return Promise.resolve();
    },
    getPassword: (profileId) => {
      mock.passwordReads.push(profileId);
      return Promise.resolve(mock.passwords[profileId] ?? null);
    },
    setPassword: (profileId, password) => {
      if (password === null) {
        mock.passwords = Object.fromEntries(
          Object.entries(mock.passwords).filter(([id]) => id !== profileId),
        );
      } else {
        mock.passwords[profileId] = password;
      }
      return Promise.resolve();
    },
  };
  return mock;
}
