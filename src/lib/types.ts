// Types shared with the Rust backend (serde camelCase) and app-level models.

export type ValueKind =
  | "boolean"
  | "integer"
  | "decimal"
  | "text"
  | "uuid"
  | "date"
  | "time"
  | "timestamp"
  | "interval"
  | "json"
  | "binary"
  | "array"
  | "enumeration"
  | "network"
  | "geometric"
  | "bitString"
  | "range"
  | "composite"
  | "other";

export type SslMode = "disable" | "require" | "verify-full";

export interface ConnectionParams {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string | null;
  sslMode: SslMode;
}

export interface ResultColumn {
  name: string;
  typeOid: number;
  typeName: string;
  kind: ValueKind;
}

/** A cell value: `null` is SQL NULL, otherwise PostgreSQL's text representation. */
export type CellValue = string | null;

export interface QueryResult {
  columns: ResultColumn[];
  rows: CellValue[][];
  affectedRows: number | null;
  durationMs: number;
  truncated: boolean;
}

/** Where profile passwords are kept. */
export type PasswordStorage = "keychain" | "file";

export type ErrorKind = "connection" | "authentication" | "server" | "storage" | "cancelled" | "internal";

export interface AppError {
  kind: ErrorKind;
  message: string;
  detail: string | null;
  hint: string | null;
  sqlState: string | null;
  position: number | null;
}

export interface SchemaInfo {
  name: string;
  owner: string;
  isSystem: boolean;
}

export type RelationKind = "table" | "view" | "materializedView" | "foreignTable" | "partitionedTable";

export interface RelationInfo {
  schema: string;
  name: string;
  kind: RelationKind;
  estimatedRows: number | null;
  comment: string | null;
}

export interface FunctionInfo {
  schema: string;
  name: string;
  arguments: string;
  returnType: string;
  language: string;
  isProcedure: boolean;
}

export interface ColumnInfo {
  name: string;
  ordinal: number;
  typeName: string;
  typeOid: number;
  kind: ValueKind;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isIdentity: boolean;
  isGenerated: boolean;
  comment: string | null;
  enumValues: string[] | null;
}

export interface IndexInfo {
  name: string;
  definition: string;
  isUnique: boolean;
  isPrimary: boolean;
  columns: string[];
}

export type ConstraintKind = "primaryKey" | "foreignKey" | "unique" | "check" | "exclusion" | "other";

export interface ConstraintInfo {
  name: string;
  kind: ConstraintKind;
  definition: string;
  columns: string[];
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
}

/** A foreign key of another table pointing at this one. */
export interface ReferencingKey {
  name: string;
  schema: string;
  table: string;
  /** Columns of the referencing table. */
  columns: string[];
  /** Columns of this table they point at. */
  referencedColumns: string[];
}

export interface TableStructure {
  schema: string;
  name: string;
  kind: RelationKind;
  comment: string | null;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  constraints: ConstraintInfo[];
  foreignKeys: ForeignKeyInfo[];
  referencedBy: ReferencingKey[];
}

export interface GraphColumn {
  name: string;
  typeName: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
}

export interface GraphTable {
  name: string;
  kind: RelationKind;
  estimatedRows: number | null;
  columns: GraphColumn[];
}

export interface GraphForeignKey {
  name: string;
  table: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
}

/** Tables of a schema and their foreign keys, for the ER diagram. */
export interface SchemaGraph {
  schema: string;
  tables: GraphTable[];
  foreignKeys: GraphForeignKey[];
}

// App-level models

export type ProfileColor =
  "none" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

/** How carefully a connection is treated: production gets a tinted window and confirmations. */
export type ConnectionEnvironment = "none" | "development" | "staging" | "production";

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: SslMode;
  color: ProfileColor;
  group: string | null;
  environment: ConnectionEnvironment;
  /** Sessions are opened read-only and writes are refused. */
  readOnly: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
}

export interface TableRef {
  schema: string;
  name: string;
}

export interface QueryHistoryEntry {
  id: string;
  profileId: string;
  sql: string;
  executedAt: string;
  durationMs: number;
  succeeded: boolean;
  rowCount: number | null;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/** Normalises anything thrown by the backend or the runtime into an `AppError`. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "internal", message, detail: null, hint: null, sqlState: null, position: null };
}
