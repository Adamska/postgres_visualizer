// Splits scripts into statements and classifies them.

import { tokenize } from "./tokenizer";

export interface Statement {
  text: string;
  /** UTF-16 offset of the statement in the script. */
  start: number;
  /** UTF-16 offset after the statement (semicolon excluded). */
  end: number;
}

export function splitStatements(script: string): Statement[] {
  const statements: Statement[] = [];
  let statementStart: number | null = null;

  const append = (start: number, end: number): void => {
    let trimmedEnd = end;
    while (trimmedEnd > start && /\s/.test(script[trimmedEnd - 1] ?? "")) trimmedEnd -= 1;
    if (trimmedEnd <= start) return;
    const text = script.slice(start, trimmedEnd);
    if (text.trim() === "") return;
    statements.push({ text, start, end: trimmedEnd });
  };

  for (const token of tokenize(script)) {
    if (token.kind === "punctuation" && token.text === ";") {
      if (statementStart !== null) append(statementStart, token.start);
      statementStart = null;
      continue;
    }
    if (statementStart === null && token.kind !== "whitespace" && token.kind !== "comment") {
      statementStart = token.start;
    }
  }
  if (statementStart !== null) append(statementStart, script.length);
  return statements;
}

/**
 * The statement containing the caret. Between statements, the preceding one wins unless a
 * blank line separates it from the caret.
 */
export function statementAt(script: string, caret: number): Statement | null {
  const statements = splitStatements(script);
  const containing = statements.find((s) => s.start <= caret && caret <= s.end);
  if (containing) return containing;
  const previous = [...statements].reverse().find((s) => s.end < caret);
  if (previous) {
    const gap = script.slice(previous.end, caret);
    const newlines = gap.split("\n").length - 1;
    if (newlines <= 1) return previous;
  }
  return statements.find((s) => s.start > caret) ?? statements[statements.length - 1] ?? null;
}

export type StatementKind =
  "select" | "insert" | "update" | "delete" | "merge" | "explain" | "begin" | "commit" | "rollback" | "other";

export function leadingKeywords(sql: string, limit: number): string[] {
  const words: string[] = [];
  for (const token of tokenize(sql)) {
    if (token.kind === "whitespace" || token.kind === "comment") continue;
    if (token.kind === "punctuation" && token.text === "(") continue;
    if (token.kind !== "keyword" && token.kind !== "identifier") break;
    words.push(token.text.toLowerCase());
    if (words.length === limit) break;
  }
  return words;
}

export function classifyStatement(sql: string): StatementKind {
  const first = leadingKeywords(sql, 1)[0];
  switch (first) {
    case "select":
    case "with":
    case "table":
    case "values":
      return "select";
    case "insert":
      return "insert";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "merge":
      return "merge";
    case "explain":
      return "explain";
    case "begin":
    case "start":
      return "begin";
    case "commit":
    case "end":
      return "commit";
    case "rollback":
    case "abort":
      return "rollback";
    default:
      return "other";
  }
}

export function isDataModification(kind: StatementKind): boolean {
  return kind === "insert" || kind === "update" || kind === "delete" || kind === "merge";
}
