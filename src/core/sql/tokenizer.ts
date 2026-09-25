// Lexer for PostgreSQL SQL. Never fails: unknown input becomes operator tokens.

export type TokenKind =
  | "keyword"
  | "identifier"
  | "quotedIdentifier"
  | "string"
  | "number"
  | "comment"
  | "whitespace"
  | "punctuation"
  | "operator"
  | "parameter";

export interface Token {
  kind: TokenKind;
  text: string;
  /** UTF-16 offset of the first character. */
  start: number;
  /** UTF-16 offset after the last character. */
  end: number;
}

export const KEYWORDS = new Set([
  "abort",
  "add",
  "all",
  "alter",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "begin",
  "between",
  "by",
  "cascade",
  "case",
  "cast",
  "check",
  "column",
  "commit",
  "conflict",
  "constraint",
  "create",
  "cross",
  "current_date",
  "current_time",
  "current_timestamp",
  "current_user",
  "database",
  "default",
  "deferrable",
  "delete",
  "desc",
  "distinct",
  "do",
  "drop",
  "else",
  "end",
  "except",
  "exclude",
  "exists",
  "explain",
  "false",
  "fetch",
  "filter",
  "first",
  "for",
  "foreign",
  "from",
  "full",
  "function",
  "grant",
  "group",
  "having",
  "if",
  "ilike",
  "in",
  "index",
  "inner",
  "insert",
  "intersect",
  "into",
  "is",
  "isnull",
  "join",
  "key",
  "last",
  "lateral",
  "left",
  "like",
  "limit",
  "materialized",
  "merge",
  "natural",
  "not",
  "notnull",
  "null",
  "nulls",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "outer",
  "over",
  "overlaps",
  "partition",
  "primary",
  "procedure",
  "references",
  "refresh",
  "rename",
  "replace",
  "returning",
  "revoke",
  "right",
  "rollback",
  "row",
  "rows",
  "schema",
  "select",
  "sequence",
  "session_user",
  "set",
  "show",
  "similar",
  "some",
  "start",
  "symmetric",
  "table",
  "then",
  "to",
  "transaction",
  "trigger",
  "true",
  "truncate",
  "type",
  "union",
  "unique",
  "update",
  "using",
  "vacuum",
  "values",
  "view",
  "when",
  "where",
  "window",
  "with",
  "within",
  "without",
  "call",
  "declare",
  "cursor",
  "execute",
  "prepare",
  "listen",
  "notify",
  "lock",
  "savepoint",
  "release",
  "copy",
  "comment",
  "owner",
  "collate",
  "temporary",
  "temp",
  "unlogged",
  "recursive",
  "returns",
  "language",
  "immutable",
  "stable",
  "volatile",
  "security",
  "definer",
  "invoker",
  "each",
  "before",
  "after",
  "instead",
  "of",
  "trim",
  "leading",
  "trailing",
  "both",
  "extract",
  "interval",
  "zone",
  "localtime",
  "localtimestamp",
  "asymmetric",
  "authorization",
  "binary",
  "concurrently",
  "freeze",
  "verbose",
  "tablesample",
  "variadic",
  "grouping",
  "cube",
  "rollup",
  "sets",
  "ordinality",
  "unnest",
  "coalesce",
  "nullif",
  "greatest",
  "least",
  "position",
  "substring",
  "overlay",
  "int",
  "integer",
  "bigint",
  "smallint",
  "boolean",
  "text",
  "varchar",
  "char",
  "numeric",
  "decimal",
  "real",
  "float",
  "double",
  "precision",
  "date",
  "time",
  "timestamp",
  "timestamptz",
  "json",
  "jsonb",
  "uuid",
  "serial",
  "bigserial",
  "bytea",
  "inherits",
  "increment",
  "restart",
  "identity",
  "always",
  "generated",
  "stored",
  "virtual",
  "enum",
  "domain",
  "extension",
  "role",
  "user",
  "password",
  "login",
  "nologin",
  "superuser",
  "inherit",
  "valid",
  "validate",
  "no",
  "action",
  "restrict",
]);

const PUNCTUATION = new Set(["(", ")", ",", ";", "[", "]", "."]);
const OPERATOR_CHARS = new Set([
  "+",
  "-",
  "*",
  "/",
  "<",
  ">",
  "=",
  "~",
  "!",
  "@",
  "#",
  "%",
  "^",
  "&",
  "|",
  "`",
  "?",
  ":",
  "$",
]);

const isDigit = (c: string): boolean => c >= "0" && c <= "9";
const isIdentifierStart = (c: string): boolean => /[A-Za-z_\u0080-￿]/.test(c);
const isIdentifierPart = (c: string): boolean => isIdentifierStart(c) || isDigit(c) || c === "$";
const isWhitespace = (c: string): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

export function isKeyword(word: string): boolean {
  return KEYWORDS.has(word.toLowerCase());
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const length = sql.length;
  let index = 0;

  const push = (kind: TokenKind, start: number, end: number): void => {
    tokens.push({ kind, text: sql.slice(start, end), start, end });
  };

  while (index < length) {
    const start = index;
    const c = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (isWhitespace(c)) {
      while (index < length && isWhitespace(sql[index] ?? "")) index += 1;
      push("whitespace", start, index);
    } else if (c === "-" && next === "-") {
      while (index < length && sql[index] !== "\n") index += 1;
      push("comment", start, index);
    } else if (c === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (depth > 0 && index < length) {
        if (sql.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      push("comment", start, index);
    } else if (c === "'") {
      index = scanQuoted(sql, index, "'", false);
      push("string", start, index);
    } else if ((c === "E" || c === "e") && next === "'") {
      index = scanQuoted(sql, index + 1, "'", true);
      push("string", start, index);
    } else if (c === '"') {
      index = scanQuoted(sql, index, '"', false);
      push("quotedIdentifier", start, index);
    } else if (c === "$" && scanDollarQuote(sql, index) !== null) {
      index = scanDollarQuote(sql, index) ?? index + 1;
      push("string", start, index);
    } else if (c === "$" && isDigit(next)) {
      index += 1;
      while (index < length && isDigit(sql[index] ?? "")) index += 1;
      push("parameter", start, index);
    } else if (isDigit(c) || (c === "." && isDigit(next))) {
      index = scanNumber(sql, index);
      push("number", start, index);
    } else if (isIdentifierStart(c)) {
      while (index < length && isIdentifierPart(sql[index] ?? "")) index += 1;
      const text = sql.slice(start, index);
      tokens.push({ kind: isKeyword(text) ? "keyword" : "identifier", text, start, end: index });
    } else if (PUNCTUATION.has(c)) {
      index += 1;
      push("punctuation", start, index);
    } else if (OPERATOR_CHARS.has(c)) {
      while (index < length && OPERATOR_CHARS.has(sql[index] ?? "")) index += 1;
      push("operator", start, index);
    } else {
      index += 1;
      push("operator", start, index);
    }
  }
  return tokens;
}

function scanQuoted(sql: string, start: number, quote: string, allowsBackslash: boolean): number {
  let index = start + 1;
  while (index < sql.length) {
    const c = sql[index];
    if (allowsBackslash && c === "\\") {
      index += 2;
      continue;
    }
    if (c === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

function scanDollarQuote(sql: string, start: number): number | null {
  let index = start + 1;
  let tag = "";
  while (index < sql.length && sql[index] !== "$") {
    const c = sql[index] ?? "";
    if (!isIdentifierPart(c) || (tag === "" && isDigit(c))) return null;
    tag += c;
    index += 1;
  }
  if (index >= sql.length) return null;
  index += 1;
  const terminator = `$${tag}$`;
  const end = sql.indexOf(terminator, index);
  return end === -1 ? sql.length : end + terminator.length;
}

function scanNumber(sql: string, start: number): number {
  let index = start;
  let seenDot = false;
  let seenExponent = false;
  while (index < sql.length) {
    const c = sql[index] ?? "";
    if (isDigit(c) || c === "_") {
      index += 1;
    } else if (c === "." && !seenDot && !seenExponent) {
      seenDot = true;
      index += 1;
    } else if ((c === "e" || c === "E") && !seenExponent) {
      seenExponent = true;
      index += 1;
      if (sql[index] === "+" || sql[index] === "-") index += 1;
    } else {
      break;
    }
  }
  return index;
}
