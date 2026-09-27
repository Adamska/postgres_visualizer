// SQL pretty-printing for the editor, through sql-formatter's PostgreSQL dialect.

import { format } from "sql-formatter";

/** Formats a script: upper-case keywords, two-space indent, one blank line between statements. */
export function formatSql(sql: string): string {
  const leading = /^\s*/.exec(sql)?.[0] ?? "";
  const trailing = /\s*$/.exec(sql)?.[0] ?? "";
  if (sql.trim() === "") return sql;
  const formatted = format(sql.trim(), {
    language: "postgresql",
    keywordCase: "upper",
    dataTypeCase: "upper",
    functionCase: "lower",
    tabWidth: 2,
    linesBetweenQueries: 1,
  });
  // Keep the surrounding whitespace of a selection so it slots back in place.
  return `${leading}${formatted}${trailing.includes("\n") ? trailing : ""}`;
}
