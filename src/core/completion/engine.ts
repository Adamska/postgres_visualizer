// Schema-aware completion proposals for the SQL editor.

import type { ColumnInfo, FunctionInfo, RelationInfo, TableRef } from "@/lib/types";

import { KEYWORDS, tokenize, type Token } from "../sql/tokenizer";

export type CompletionKind = "keyword" | "schema" | "table" | "view" | "column" | "function";

export interface Completion {
  text: string;
  kind: CompletionKind;
  detail?: string;
}

export interface SchemaSnapshot {
  schemas: string[];
  relations: RelationInfo[];
  functions: FunctionInfo[];
  /** Columns of tables whose structure is loaded, keyed by `schema.name`. */
  columns: Record<string, ColumnInfo[]>;
}

export interface TableReference {
  alias: string | null;
  table: TableRef;
}

export const MAX_COMPLETIONS = 60;

export function tableKey(table: TableRef): string {
  return `${table.schema}.${table.name}`;
}

function identifierName(token: Token): string | null {
  if (token.kind === "identifier") return token.text;
  if (token.kind === "quotedIdentifier") return token.text.slice(1, -1).replace(/""/g, '"');
  return null;
}

/** Tables referenced by `FROM`, `JOIN`, `UPDATE` and `INTO`, with aliases and comma lists. */
export function referencedTables(sql: string, relations: RelationInfo[]): TableReference[] {
  const tokens = tokenize(sql).filter((t) => t.kind !== "whitespace" && t.kind !== "comment");
  const references: TableReference[] = [];
  let index = 0;

  const parseReference = (cursor: number): [TableReference, number] | null => {
    let position = cursor;
    const first = tokens[position];
    if (first?.kind === "keyword" && ["only", "lateral"].includes(first.text.toLowerCase())) position += 1;
    const nameToken = tokens[position];
    if (!nameToken) return null;
    const name = identifierName(nameToken);
    if (name === null) return null;
    let table: TableRef = { schema: "public", name };
    position += 1;
    const dot = tokens[position];
    const second = tokens[position + 1];
    const secondName = dot?.text === "." && second ? identifierName(second) : null;
    if (secondName !== null) {
      table = { schema: name, name: secondName };
      position += 2;
    }
    const known = relations.find(
      (r) => r.name === table.name && (table.schema === "public" || r.schema === table.schema),
    );
    if (known) table = { schema: known.schema, name: known.name };
    let alias: string | null = null;
    const asToken = tokens[position];
    if (asToken?.kind === "keyword" && asToken.text.toLowerCase() === "as") position += 1;
    const aliasToken = tokens[position];
    if (aliasToken?.kind === "identifier") {
      alias = aliasToken.text;
      position += 1;
    }
    return [{ alias, table }, position];
  };

  while (index < tokens.length) {
    const token = tokens[index];
    const opensReference =
      token?.kind === "keyword" && ["from", "join", "update", "into"].includes(token.text.toLowerCase());
    if (!opensReference) {
      index += 1;
      continue;
    }
    let cursor = index + 1;
    for (;;) {
      const parsed = parseReference(cursor);
      if (!parsed) break;
      references.push(parsed[0]);
      cursor = parsed[1];
      const comma = tokens[cursor];
      if (comma?.kind !== "punctuation" || comma.text !== ",") break;
      cursor += 1;
    }
    index = Math.max(cursor, index + 1);
  }
  return references;
}

function relationCompletion(relation: RelationInfo): Completion {
  const isTable =
    relation.kind === "table" || relation.kind === "partitionedTable" || relation.kind === "foreignTable";
  return {
    text: relation.schema === "public" ? relation.name : `${relation.schema}.${relation.name}`,
    kind: isTable ? "table" : "view",
    detail: relation.kind,
  };
}

function columnCompletions(snapshot: SchemaSnapshot, table: TableRef): Completion[] {
  return (snapshot.columns[tableKey(table)] ?? []).map((c) => ({
    text: c.name,
    kind: "column",
    detail: `${c.typeName} · ${table.name}`,
  }));
}

/** Filters by prefix (case-insensitive); prefix matches outrank substring matches; keywords rank last. */
export function rankCompletions(candidates: Completion[], prefix: string): Completion[] {
  const lowered = prefix.toLowerCase();
  const seen = new Set<string>();
  const scored: [Completion, number][] = [];
  for (const candidate of candidates) {
    const text = candidate.text.toLowerCase();
    let quality: number;
    if (lowered === "" || text.startsWith(lowered)) {
      quality = text === lowered && lowered !== "" ? -1 : 0;
    } else if (text.includes(lowered)) {
      quality = 1;
    } else {
      continue;
    }
    const key = `${candidate.kind}:${text}:${candidate.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push([candidate, quality * 2 + (candidate.kind === "keyword" ? 1 : 0)]);
  }
  return scored
    .sort((a, b) => a[1] - b[1] || a[0].text.toLowerCase().localeCompare(b[0].text.toLowerCase()))
    .slice(0, MAX_COMPLETIONS)
    .map(([completion]) => completion);
}

/** Completions for `prefix`, optionally qualified by a schema, table or alias. */
export function completions(
  snapshot: SchemaSnapshot,
  sql: string,
  prefix: string,
  qualifier: string | null,
): Completion[] {
  const references = referencedTables(sql, snapshot.relations);
  const candidates: Completion[] = [];

  if (qualifier !== null) {
    const lowered = qualifier.toLowerCase();
    const reference = references.find(
      (r) => r.alias?.toLowerCase() === lowered || r.table.name.toLowerCase() === lowered,
    );
    if (reference) {
      candidates.push(...columnCompletions(snapshot, reference.table));
    } else {
      const relation = snapshot.relations.find((r) => r.name.toLowerCase() === lowered);
      if (relation) {
        candidates.push(...columnCompletions(snapshot, { schema: relation.schema, name: relation.name }));
      }
    }
    if (snapshot.schemas.some((s) => s.toLowerCase() === lowered)) {
      candidates.push(
        ...snapshot.relations.filter((r) => r.schema.toLowerCase() === lowered).map(relationCompletion),
      );
      candidates.push(
        ...snapshot.functions
          .filter((f) => f.schema.toLowerCase() === lowered)
          .map((f) => ({ text: `${f.name}()`, kind: "function" as const, detail: f.returnType })),
      );
    }
  } else {
    for (const reference of references) candidates.push(...columnCompletions(snapshot, reference.table));
    candidates.push(...snapshot.relations.map(relationCompletion));
    candidates.push(...snapshot.schemas.map((s) => ({ text: s, kind: "schema" as const })));
    candidates.push(
      ...snapshot.functions
        .filter((f) => f.schema === "public")
        .map((f) => ({ text: `${f.name}()`, kind: "function" as const, detail: f.returnType })),
    );
    candidates.push(
      ...[...KEYWORDS].sort().map((k) => ({ text: k.toUpperCase(), kind: "keyword" as const })),
    );
  }
  return rankCompletions(candidates, prefix);
}
