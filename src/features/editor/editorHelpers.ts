// Pure helpers shared by the SQL editor extensions. Kept free of CodeMirror so they are trivially testable.

import type { CompletionKind } from "@/core/completion/engine";

/** The identifier being typed at the caret, with the qualifier before the dot, if any. */
export interface WordContext {
  /** Identifier characters immediately before the caret (case preserved). */
  prefix: string;
  /** Identifier immediately before the `.` that precedes `prefix`, or null when there is no dot. */
  qualifier: string | null;
  /** Offset where `prefix` starts; completions replace `[from, caret)`. */
  from: number;
}

/** Characters that may appear in an unquoted identifier. */
const IDENTIFIER_CHAR = /[\p{L}\p{N}_$]/u;

function identifierStart(text: string, end: number): number {
  let start = end;
  while (start > 0 && IDENTIFIER_CHAR.test(text[start - 1] ?? "")) start -= 1;
  return start;
}

/**
 * Extracts the word before `caret` and the qualifier preceding it.
 *
 * - `u.na|` → `{ prefix: "na", qualifier: "u", from: 2 }`
 * - `public.|` → `{ prefix: "", qualifier: "public", from: 7 }`
 * - `SEL|` → `{ prefix: "SEL", qualifier: null, from: 0 }`
 */
export function wordContext(doc: string, caret: number): WordContext {
  const end = Math.max(0, Math.min(caret, doc.length));
  const from = identifierStart(doc, end);
  const prefix = doc.slice(from, end);
  let qualifier: string | null = null;
  if (from > 0 && doc[from - 1] === ".") {
    const qualifierEnd = from - 1;
    const qualifierStart = identifierStart(doc, qualifierEnd);
    if (qualifierStart < qualifierEnd) qualifier = doc.slice(qualifierStart, qualifierEnd);
  }
  return { prefix, qualifier, from };
}

/**
 * Returns `completionText` in the case the user is typing: uppercase when `prefix` starts with an
 * uppercase letter, lowercase when it starts with a lowercase letter, unchanged otherwise.
 */
export function matchCase(prefix: string, completionText: string): string {
  const first = prefix[0];
  if (first === undefined) return completionText;
  if (first !== first.toLowerCase()) return completionText.toUpperCase();
  if (first !== first.toUpperCase()) return completionText.toLowerCase();
  return completionText;
}

/** CodeMirror completion `type` (which picks the icon) for a completion kind. */
export function mapCompletionType(kind: CompletionKind): string {
  switch (kind) {
    case "keyword":
      return "keyword";
    case "table":
      return "class";
    case "view":
      return "interface";
    case "column":
      return "property";
    case "schema":
      return "namespace";
    case "function":
      return "function";
  }
}

/** Clamps `[from, to]` into `[0, length]`, swapping the ends when they are reversed. */
export function clampRange(from: number, to: number, length: number): { from: number; to: number } {
  const clamp = (n: number): number => Math.max(0, Math.min(Math.floor(n), length));
  const a = clamp(from);
  const b = clamp(to);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}
