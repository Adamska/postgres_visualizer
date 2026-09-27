// Statement review before running: UPDATE/DELETE without WHERE, destructive DDL, and writes on
// connections flagged as production or read-only.

import { tokenize, type Token } from "./tokenizer";

export type StatementVerb =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "merge"
  | "drop"
  | "truncate"
  | "alter"
  | "create"
  | "session"
  | "other";

export interface StatementWarning {
  /** Index of the statement in the reviewed list. */
  index: number;
  kind: "noWhere" | "destructive" | "write";
  message: string;
}

const WORD_KINDS = new Set<Token["kind"]>(["keyword", "identifier"]);
const QUERY_VERBS = new Set(["select", "insert", "update", "delete", "merge", "values", "table"]);
/** Statements that only read or manage the session. */
const SESSION_WORDS = new Set([
  "show",
  "set",
  "reset",
  "begin",
  "start",
  "commit",
  "end",
  "rollback",
  "abort",
  "savepoint",
  "release",
  "fetch",
  "declare",
  "close",
  "discard",
  "listen",
  "unlisten",
]);

interface Word {
  text: string;
  depth: number;
}

/** Keywords and identifiers of a statement, lowercased, with their parenthesis depth. */
function words(sql: string): Word[] {
  const out: Word[] = [];
  let depth = 0;
  for (const token of tokenize(sql)) {
    if (token.kind === "punctuation" && token.text === "(") depth += 1;
    else if (token.kind === "punctuation" && token.text === ")") depth = Math.max(0, depth - 1);
    else if (WORD_KINDS.has(token.kind)) out.push({ text: token.text.toLowerCase(), depth });
  }
  return out;
}

/** Drops a leading `EXPLAIN [options]`; `analyzed` tells whether the statement really runs. */
function unwrapExplain(list: Word[]): { rest: Word[]; explain: boolean; analyzed: boolean } {
  if (list[0]?.text !== "explain") return { rest: list, explain: false, analyzed: false };
  let i = 1;
  let analyzed = false;
  while (i < list.length && !QUERY_VERBS.has(list[i]?.text ?? "") && list[i]?.text !== "with") {
    if (list[i]?.text === "analyze" || list[i]?.text === "analyse") analyzed = true;
    i += 1;
  }
  // `EXPLAIN (ANALYZE false)` does not run the statement.
  if (analyzed && list.slice(1, i).some((w) => w.text === "false" || w.text === "off")) analyzed = false;
  return { rest: list.slice(i), explain: true, analyzed };
}

/** The verb that decides what a statement does, looking through CTEs and EXPLAIN. */
export function statementVerb(sql: string): StatementVerb {
  const { rest, explain, analyzed } = unwrapExplain(words(sql));
  let list = rest;
  if (list[0]?.text === "with") {
    // The main statement is the first top-level verb after the CTE list.
    const main = list.findIndex((w, i) => i > 0 && w.depth === 0 && QUERY_VERBS.has(w.text));
    list = main === -1 ? [] : list.slice(main);
  }
  const first = list[0]?.text ?? "";
  let verb: StatementVerb;
  switch (first) {
    case "select":
    case "values":
    case "table":
      verb = list.some((w) => w.depth === 0 && w.text === "into") ? "create" : "select";
      break;
    case "insert":
    case "update":
    case "delete":
    case "merge":
    case "drop":
    case "truncate":
    case "alter":
    case "create":
      verb = first;
      break;
    default:
      verb = SESSION_WORDS.has(first) ? "session" : "other";
  }
  if (explain && !analyzed) return "select";
  return verb;
}

/** Whether a DELETE/UPDATE lacks a top-level WHERE clause (and so touches every row). */
export function lacksWhere(sql: string): boolean {
  const { rest } = unwrapExplain(words(sql));
  let list = rest;
  if (list[0]?.text === "with") {
    const main = list.findIndex((w, i) => i > 0 && w.depth === 0 && QUERY_VERBS.has(w.text));
    list = main === -1 ? [] : list.slice(main);
  }
  const first = list[0]?.text;
  if (first !== "update" && first !== "delete") return false;
  return !list.some((w) => w.depth === 0 && w.text === "where");
}

/** The table a statement targets, for messages. */
function targetOf(sql: string): string {
  const match =
    /\b(?:update|delete\s+from|truncate(?:\s+table)?|drop\s+table(?:\s+if\s+exists)?)\s+(?:only\s+)?([^\s(;,]+)/i.exec(
      sql,
    );
  return match?.[1] ?? "the table";
}

/** Whether a statement can run on a read-only connection. */
export function isReadOnlyStatement(sql: string): boolean {
  const verb = statementVerb(sql);
  if (verb === "select") return true;
  if (verb !== "session") return false;
  // Never let a session switch itself back to read-write.
  return !/read[\s_]+write|transaction_read_only|default_transaction_read_only/i.test(sql);
}

/**
 * Warnings for a batch of statements. UPDATE/DELETE without WHERE is always flagged; on a
 * production connection every write and schema change is flagged too.
 */
export function reviewStatements(statements: readonly string[], production: boolean): StatementWarning[] {
  const warnings: StatementWarning[] = [];
  statements.forEach((sql, index) => {
    const verb = statementVerb(sql);
    if ((verb === "update" || verb === "delete") && lacksWhere(sql)) {
      warnings.push({
        index,
        kind: "noWhere",
        message: `${verb.toUpperCase()} without WHERE affects every row of ${targetOf(sql)}.`,
      });
      return;
    }
    if (!production) return;
    if (verb === "drop" || verb === "truncate") {
      warnings.push({
        index,
        kind: "destructive",
        message: `${verb.toUpperCase()} on ${targetOf(sql)} cannot be undone.`,
      });
    } else if (verb !== "select" && verb !== "session") {
      warnings.push({ index, kind: "write", message: "Writes to a production database." });
    }
  });
  return warnings;
}
