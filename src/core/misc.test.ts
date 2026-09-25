import { describe, expect, it } from "vitest";

import type { RelationInfo } from "@/lib/types";

import { completions, rankCompletions, referencedTables } from "./completion/engine";
import { connectionUrl, parseConnectionUrl, profileIssues } from "./connection/url";
import {
  compactCount,
  detailText,
  formatCount,
  formatDuration,
  gridText,
  resultSummary,
} from "./format/values";

describe("connection urls", () => {
  it("parses a full libpq url", () => {
    const parsed = parseConnectionUrl("postgresql://alice:s%40cret@db.example.com:6543/app?sslmode=require");
    expect(parsed.profile).toMatchObject({
      username: "alice",
      host: "db.example.com",
      port: 6543,
      database: "app",
      sslMode: "require",
      name: "alice@db.example.com",
    });
    expect(parsed.password).toBe("s@cret");
    expect(parseConnectionUrl("postgres://localhost").profile).toMatchObject({
      host: "localhost",
      port: 5432,
      database: "postgres",
      username: "postgres",
      sslMode: "disable",
    });
    expect(() => parseConnectionUrl("mysql://x")).toThrow(/Unsupported URL scheme/);
  });

  it("round trips and validates", () => {
    const { profile } = parseConnectionUrl("postgresql://u@h:5433/d?sslmode=verify-full");
    expect(connectionUrl(profile)).toBe("postgresql://u@h:5433/d?sslmode=verify-full");
    expect(profileIssues({ ...profile, host: " ", port: 70000 })).toHaveLength(2);
  });
});

describe("formatting", () => {
  it("formats grid and detail text", () => {
    expect(gridText(null, "text")).toBe("NULL");
    expect(gridText("a\nb", "text")).toBe("a⏎ b");
    expect(gridText("x".repeat(400), "text")).toHaveLength(301);
    expect(detailText('{"b":1,"a":[1]}', "json")).toBe('{\n  "b": 1,\n  "a": [\n    1\n  ]\n}');
    expect(formatCount(1)).toBe("1 row");
    expect(formatCount(12345)).toBe("12,345 rows");
    expect(compactCount(12345)).toBe("12.3k");
    expect(formatDuration(1500)).toBe("1.50 s");
    expect(
      resultSummary({ columns: [1], rows: [1, 2], affectedRows: null, durationMs: 12, truncated: true }),
    ).toBe("2 rows (limited) in 12 ms");
    expect(resultSummary({ columns: [], rows: [], affectedRows: 3, durationMs: 2, truncated: false })).toBe(
      "3 rows affected in 2 ms",
    );
  });
});

describe("completion", () => {
  const relations: RelationInfo[] = [
    { schema: "audit", name: "log", kind: "table", estimatedRows: null, comment: null },
    { schema: "public", name: "users", kind: "table", estimatedRows: null, comment: null },
    { schema: "public", name: "teams", kind: "table", estimatedRows: null, comment: null },
  ];

  it("finds referenced tables and aliases", () => {
    const sql =
      'SELECT * FROM public.users AS u, audit.log JOIN "Orders" o ON o.user_id = u.id LEFT JOIN teams t WHERE t.id = 1';
    const references = referencedTables(sql, relations);
    expect(references.map((r) => r.alias)).toEqual(["u", null, "o", "t"]);
    expect(references.map((r) => r.table)).toEqual([
      { schema: "public", name: "users" },
      { schema: "audit", name: "log" },
      { schema: "public", name: "Orders" },
      { schema: "public", name: "teams" },
    ]);
  });

  it("ranks prefix matches first and keywords last", () => {
    const ranked = rankCompletions(
      [
        { text: "SELECT", kind: "keyword" },
        { text: "users", kind: "table" },
        { text: "user_id", kind: "column" },
        { text: "user_id", kind: "column" },
        { text: "focused_user", kind: "column" },
        { text: "USER", kind: "keyword" },
      ],
      "user",
    );
    expect(ranked.map((c) => c.text)).toEqual(["USER", "user_id", "users", "focused_user"]);
  });

  it("completes columns of referenced tables and schema members", () => {
    const snapshot = {
      schemas: ["public", "audit"],
      relations,
      functions: [
        {
          schema: "public",
          name: "user_count",
          arguments: "",
          returnType: "bigint",
          language: "sql",
          isProcedure: false,
        },
      ],
      columns: {
        "public.users": [
          { name: "email", typeName: "text" },
          { name: "id", typeName: "int4" },
        ].map((c) => ({
          ...c,
          ordinal: 1,
          typeOid: 0,
          kind: "text" as const,
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isIdentity: false,
          isGenerated: false,
          comment: null,
          enumValues: null,
        })),
      },
    };
    expect(completions(snapshot, "select u. from users u", "", "u").map((c) => c.text)).toEqual([
      "email",
      "id",
    ]);
    const unqualified = completions(snapshot, "select us", "us", null);
    expect(unqualified[0]?.kind).not.toBe("keyword");
    expect(unqualified.some((c) => c.text === "users" && c.kind === "table")).toBe(true);
    expect(completions(snapshot, "", "", "public").map((c) => c.text)).toEqual(
      expect.arrayContaining(["teams", "user_count()"]),
    );
  });
});
