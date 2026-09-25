import { describe, expect, it } from "vitest";

import { quoteIdent, quoteIdentIfNeeded, quoteLiteral, renderLiteral } from "./quote";
import { classifyStatement, isDataModification, splitStatements, statementAt } from "./splitter";
import { tokenize } from "./tokenizer";

describe("tokenizer", () => {
  const kinds = (sql: string) =>
    tokenize(sql)
      .filter((t) => t.kind !== "whitespace")
      .map((t) => t.kind);
  const texts = (sql: string) =>
    tokenize(sql)
      .filter((t) => t.kind !== "whitespace")
      .map((t) => t.text);

  it("classifies keywords, identifiers, numbers and strings", () => {
    expect(texts("SELECT id, 'a''b', 1.5e3 FROM users")).toEqual([
      "SELECT",
      "id",
      ",",
      "'a''b'",
      ",",
      "1.5e3",
      "FROM",
      "users",
    ]);
    expect(kinds("SELECT id, 'a''b', 1.5e3 FROM users")).toEqual([
      "keyword",
      "identifier",
      "punctuation",
      "string",
      "punctuation",
      "number",
      "keyword",
      "identifier",
    ]);
  });

  it("handles dollar quotes, comments, escapes and casts", () => {
    const sql = "CREATE FUNCTION f() RETURNS int AS $body$ select 1; $x$ $body$ LANGUAGE sql; $$;$$";
    expect(
      tokenize(sql)
        .filter((t) => t.kind === "string")
        .map((t) => t.text),
    ).toEqual(["$body$ select 1; $x$ $body$", "$$;$$"]);
    const comments = tokenize("/* outer /* inner */ still */ SELECT 1 -- trailing\n;").filter(
      (t) => t.kind === "comment",
    );
    expect(comments.map((t) => t.text)).toEqual(["/* outer /* inner */ still */", "-- trailing"]);
    const tokens = tokenize('SELECT E\'a\\\'b\', "we""ird", $1::text, a <> b').filter(
      (t) => t.kind !== "whitespace",
    );
    expect(tokens[1]).toMatchObject({ kind: "string", text: "E'a\\'b'" });
    expect(tokens[3]).toMatchObject({ kind: "quotedIdentifier", text: '"we""ird"' });
    expect(tokens[5]).toMatchObject({ kind: "parameter", text: "$1" });
    expect(tokens[6]).toMatchObject({ kind: "operator", text: "::" });
  });

  it("covers the whole input contiguously", () => {
    const sql = "select café, 42 -- x";
    const tokens = tokenize(sql);
    expect(tokens.map((t) => t.text).join("")).toBe(sql);
    expect(tokens.every((t) => sql.slice(t.start, t.end) === t.text)).toBe(true);
    expect(tokenize("select 'abc").at(-1)).toMatchObject({ kind: "string", text: "'abc" });
  });
});

describe("splitter", () => {
  it("splits on semicolons outside strings and comments", () => {
    const script = "select 1; -- a; comment\nselect ';'; insert into t values ($$x;y$$);\n\n";
    expect(splitStatements(script).map((s) => s.text)).toEqual([
      "select 1",
      "select ';'",
      "insert into t values ($$x;y$$)",
    ]);
    expect(splitStatements("select 1;\nselect 2").map((s) => s.text)).toEqual(["select 1", "select 2"]);
    expect(splitStatements(";;  ; /* nothing */ ;")).toEqual([]);
    const [, second] = splitStatements("select a from t;\nselect b from u;");
    expect(second).toEqual({ text: "select b from u", start: 17, end: 32 });
  });

  it("finds the statement under the caret", () => {
    const script = "select 1;\n\nselect 2;\nselect 3";
    expect(statementAt(script, script.indexOf("select 2") + 3)?.text).toBe("select 2");
    expect(statementAt(script, 8)?.text).toBe("select 1");
    expect(statementAt(script, 9)?.text).toBe("select 1");
    expect(statementAt(script, 10)?.text).toBe("select 1");
    expect(statementAt(script, script.length)?.text).toBe("select 3");
    expect(statementAt("", 0)).toBeNull();
  });

  it.each([
    ["SELECT 1", "select"],
    ["  with x as (select 1) select * from x", "select"],
    ["/* c */ insert into t values (1)", "insert"],
    ["UPDATE t SET a = 1", "update"],
    ["delete from t", "delete"],
    ["explain analyze select 1", "explain"],
    ["begin", "begin"],
    ["START TRANSACTION", "begin"],
    ["commit", "commit"],
    ["rollback", "rollback"],
    ["create table t (id int)", "other"],
    ["(select 1)", "select"],
  ])("classifies %s", (sql, kind) => {
    expect(classifyStatement(sql)).toBe(kind);
  });

  it("flags data modification", () => {
    expect(isDataModification(classifyStatement("update t set a=1"))).toBe(true);
    expect(isDataModification(classifyStatement("select 1"))).toBe(false);
  });
});

describe("quoting", () => {
  it("quotes identifiers and literals", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
    expect(quoteIdentIfNeeded("simple_name")).toBe("simple_name");
    expect(quoteIdentIfNeeded("MixedCase")).toBe('"MixedCase"');
    expect(quoteIdentIfNeeded("select")).toBe('"select"');
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(renderLiteral(null)).toBe("NULL");
  });
});
