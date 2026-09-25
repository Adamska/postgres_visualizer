import { describe, expect, it } from "vitest";

import { countSql, newFilter, newTableQuery, pageSql, toggleSort, whereClause } from "./tableQuery";

describe("table query", () => {
  const users = { schema: "public", name: "users" };

  it("builds a paginated select with filters and sort", () => {
    const query = newTableQuery(users, 100);
    query.filters = [
      newFilter("name", "contains", "o'b_%"),
      newFilter("age", "greaterThan", "18"),
      newFilter("deleted_at", "isNull"),
      newFilter("disabled", "equals", ""),
      newFilter("id", "in", "1, 2 ,3"),
    ];
    query.rawWhere = "created_at > now() - interval '1 day'";
    query.sort = [{ column: "name", ascending: false }];
    query.page = 2;
    const predicates = [
      `"name"::text ILIKE '%o''b\\_\\%%'`,
      `"age" > '18'`,
      `"deleted_at" IS NULL`,
      `"id" IN ('1', '2', '3')`,
      `(created_at > now() - interval '1 day')`,
    ];
    expect(pageSql(query, ["id"])).toBe(
      `SELECT * FROM "public"."users"\nWHERE ${predicates.join(" AND ")}\nORDER BY "name" DESC\nLIMIT 100 OFFSET 200`,
    );
    expect(countSql(query).startsWith(`SELECT count(*) FROM "public"."users" WHERE`)).toBe(true);
  });

  it("falls back to the primary key ordering", () => {
    const query = newTableQuery(users);
    expect(pageSql(query, ["tenant", "id"])).toBe(
      `SELECT * FROM "public"."users"\nORDER BY "tenant" ASC, "id" ASC\nLIMIT 200 OFFSET 0`,
    );
    expect(whereClause(query)).toBeNull();
  });

  it("cycles sort and resets the page", () => {
    let query = { ...newTableQuery(users), page: 3 };
    query = toggleSort(query, "name");
    expect(query.sort).toEqual([{ column: "name", ascending: true }]);
    expect(query.page).toBe(0);
    query = toggleSort(query, "name");
    expect(query.sort).toEqual([{ column: "name", ascending: false }]);
    query = toggleSort(query, "name");
    expect(query.sort).toEqual([]);
    query = toggleSort(query, "age");
    expect(query.sort).toEqual([{ column: "age", ascending: true }]);
  });
});
