import { describe, expect, it } from "vitest";

import type { TableStructure } from "@/lib/types";

import {
  DEFAULT_EDIT,
  NULL_EDIT,
  addInsert,
  changeCount,
  changeStatements,
  emptyChangeSet,
  isChangeSetEmpty,
  isDeleted,
  isTableEditable,
  readOnlyReason,
  removeInsert,
  rowIdentity,
  setInsertValue,
  setValue,
  stagedValue,
  textEdit,
  toggleDelete,
} from "./changeSet";

const column = (name: string, extra: Partial<TableStructure["columns"][number]> = {}) => ({
  name,
  ordinal: 1,
  typeName: "text",
  typeOid: 25,
  kind: "text" as const,
  isNullable: true,
  defaultValue: null,
  isPrimaryKey: false,
  isIdentity: false,
  isGenerated: false,
  comment: null,
  enumValues: null,
  ...extra,
});

const structure: TableStructure = {
  schema: "public",
  name: "users",
  kind: "table",
  comment: null,
  columns: [
    column("id", { isPrimaryKey: true, isIdentity: true, isNullable: false }),
    column("name"),
    column("email"),
    column("search", { isGenerated: true }),
  ],
  indexes: [],
  constraints: [],
  foreignKeys: [],
};

const names = ["id", "name", "email"];

describe("change set", () => {
  it("builds identities from primary keys", () => {
    const identity = rowIdentity(structure, ["7", "Ann", null], names);
    expect(identity?.values).toEqual([{ column: "id", value: "7" }]);
    expect(rowIdentity({ ...structure, columns: [column("x")] }, ["7"], ["x"])).toBeNull();
  });

  it("clears an edit when the original value is staged again", () => {
    const identity = rowIdentity(structure, ["1", "Ann", null], names)!;
    let changes = setValue(emptyChangeSet(), identity, "name", textEdit("Bob"), "Ann");
    expect(changeCount(changes)).toBe(1);
    expect(stagedValue(changes, identity, "name")).toEqual(textEdit("Bob"));
    changes = setValue(changes, identity, "name", textEdit("Ann"), "Ann");
    expect(isChangeSetEmpty(changes)).toBe(true);
  });

  it("generates deletes, updates and inserts in a stable order", () => {
    const first = rowIdentity(structure, ["1", "Ann", null], names)!;
    const second = rowIdentity(structure, ["2", "Bob", "x"], names)!;
    let changes = emptyChangeSet();
    changes = setValue(changes, second, "name", textEdit("O'Brien"), "Bob");
    changes = setValue(changes, second, "email", NULL_EDIT, "x");
    changes = toggleDelete(changes, first);
    const [withInsert, insert] = addInsert(changes);
    changes = withInsert;
    changes = setInsertValue(changes, insert.id, "name", textEdit("Zed"));
    changes = setInsertValue(changes, insert.id, "id", DEFAULT_EDIT);
    changes = setInsertValue(changes, insert.id, "search", textEdit("ignored"));
    [changes] = addInsert(changes);

    expect(changeStatements(changes, structure)).toEqual([
      `DELETE FROM "public"."users" WHERE "id" = '1'`,
      `UPDATE "public"."users" SET "email" = NULL, "name" = 'O''Brien' WHERE "id" = '2'`,
      `INSERT INTO "public"."users" ("name") VALUES ('Zed')`,
      `INSERT INTO "public"."users" DEFAULT VALUES`,
    ]);
    expect(changeCount(changes)).toBe(5);
  });

  it("toggles deletes and drops pending updates for deleted rows", () => {
    const row = rowIdentity(structure, ["1", "Ann", null], names)!;
    let changes = setValue(emptyChangeSet(), row, "name", textEdit("x"), "Ann");
    changes = toggleDelete(changes, row);
    expect(isDeleted(changes, row)).toBe(true);
    expect(stagedValue(changes, row, "name")).toBeUndefined();
    changes = toggleDelete(changes, row);
    expect(isChangeSetEmpty(changes)).toBe(true);
    const [withInsert, insert] = addInsert(changes);
    expect(isChangeSetEmpty(removeInsert(withInsert, insert.id))).toBe(true);
  });

  it("reports editability", () => {
    expect(isTableEditable(structure)).toBe(true);
    expect(readOnlyReason(structure)).toBeNull();
    expect(readOnlyReason({ ...structure, kind: "view" })).toBe("Views are read-only.");
    expect(readOnlyReason({ ...structure, columns: [column("a")] })).toMatch(/no primary key/);
  });
});
