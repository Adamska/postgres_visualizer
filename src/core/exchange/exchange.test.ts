import { describe, expect, it } from "vitest";

import type { ResultColumn, TableStructure } from "@/lib/types";

import { detectDelimiter, encodeCsv, parseCsv } from "./csv";
import { exportRows, toTsv } from "./export";
import { automaticImportPlan, importStatements } from "./importPlan";

const columns: ResultColumn[] = [
  { name: "id", typeOid: 23, typeName: "int4", kind: "integer" },
  { name: "name", typeOid: 25, typeName: "text", kind: "text" },
  { name: "active", typeOid: 16, typeName: "bool", kind: "boolean" },
  { name: "meta", typeOid: 3802, typeName: "jsonb", kind: "json" },
];
const rows = [
  ["1", 'Ann, "the" first\nline', "t", '{"a":1}'],
  ["2", null, "f", "not json"],
];

describe("csv", () => {
  it("writes RFC 4180 and reads it back", () => {
    const csv = encodeCsv(
      columns.map((c) => c.name),
      rows,
    );
    expect(csv).toBe('id,name,active,meta\n1,"Ann, ""the"" first\nline",t,"{""a"":1}"\n2,,f,not json\n');
    const document = parseCsv(csv);
    expect(document.header).toEqual(["id", "name", "active", "meta"]);
    expect(document.rows).toEqual([
      ["1", 'Ann, "the" first\nline', "t", '{"a":1}'],
      ["2", "", "f", "not json"],
    ]);
  });

  it("reads CRLF, semicolons and headerless documents", () => {
    expect(parseCsv("a;b\r\n1;2\r\n", { delimiter: ";" }).rows).toEqual([["1", "2"]]);
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n")).toBe("\t");
    const headerless = parseCsv("x,y\n", { hasHeader: false });
    expect(headerless.header).toEqual(["column1", "column2"]);
    expect(headerless.rows).toEqual([["x", "y"]]);
  });
});

describe("export", () => {
  it("exports JSON with native numbers, booleans and JSON values", () => {
    expect(exportRows(columns, rows, "json")).toBe(
      `[\n  {"id": 1, "name": "Ann, \\"the\\" first\\nline", "active": true, "meta": {"a":1}},\n  {"id": 2, "name": null, "active": false, "meta": "not json"}\n]\n`,
    );
  });

  it("exports SQL inserts and TSV", () => {
    expect(exportRows(columns, [rows[1]!], "sql", { schema: "s", name: "t" })).toBe(
      `INSERT INTO "s"."t" ("id", "name", "active", "meta") VALUES ('2', NULL, 'f', 'not json');\n`,
    );
    expect(toTsv(["a", "b"], [["1", null]])).toBe("a\tb\n1\t");
  });
});

describe("import plan", () => {
  const structure: TableStructure = {
    schema: "public",
    name: "people",
    kind: "table",
    comment: null,
    columns: [
      {
        name: "id",
        ordinal: 1,
        typeName: "int4",
        typeOid: 23,
        kind: "integer",
        isNullable: false,
        defaultValue: null,
        isPrimaryKey: true,
        isIdentity: false,
        isGenerated: false,
        comment: null,
        enumValues: null,
      },
      {
        name: "full_name",
        ordinal: 2,
        typeName: "text",
        typeOid: 25,
        kind: "text",
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isIdentity: false,
        isGenerated: false,
        comment: null,
        enumValues: null,
      },
    ],
    indexes: [],
    constraints: [],
    foreignKeys: [],
  };

  it("maps automatically and batches", () => {
    const document = {
      header: ["ID", "Full_Name", "extra"],
      rows: [
        ["1", "Ann", "x"],
        ["2", "", "y"],
        ["3", "Cy"],
      ],
    };
    const plan = automaticImportPlan(document, structure);
    expect(plan.mappings.map((m) => m.tableColumn)).toEqual(["id", "full_name", null]);
    expect(importStatements({ ...plan, batchSize: 2 }, document, structure)).toEqual([
      `INSERT INTO "public"."people" ("id", "full_name") VALUES\n('1', 'Ann'),\n('2', NULL)`,
      `INSERT INTO "public"."people" ("id", "full_name") VALUES\n('3', 'Cy')`,
    ]);
  });
});
