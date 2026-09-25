import { describe, expect, it } from "vitest";

import { previewSegments, segmentsText } from "./preview";
import {
  allContainerIds,
  buildTree,
  displayPath,
  formatJson,
  idsUpToDepth,
  isJsonContainerText,
  jsonValueOf,
  matchingIds,
  minifyJson,
  nodeCount,
  nodeSummary,
  parseJson,
  scalarText,
  sqlPath,
  visibleRows,
} from "./tree";

const SAMPLE = {
  theme: "dark",
  notifications: { email: true, push: false },
  tags: ["admin", "beta"],
  score: 42.5,
  bio: null,
  "odd key": [],
};

describe("json detection", () => {
  it("parses and detects containers", () => {
    expect(parseJson("{bad")).toBeUndefined();
    expect(parseJson("[1]")).toEqual([1]);
    expect(isJsonContainerText('  {"a": 1}')).toBe(true);
    expect(isJsonContainerText("42")).toBe(false);
    expect(isJsonContainerText("[oops")).toBe(false);
  });

  it("applies the JSON treatment by column kind", () => {
    expect(jsonValueOf("42", "json")).toBe(42);
    expect(jsonValueOf("42", "text")).toBeUndefined();
    expect(jsonValueOf('{"a":1}', "text")).toEqual({ a: 1 });
    expect(jsonValueOf('{"a":1}', "integer")).toBeUndefined();
    expect(jsonValueOf(null, "json")).toBeUndefined();
    expect(jsonValueOf("not json", "json")).toBeUndefined();
  });
});

describe("json tree", () => {
  const root = buildTree(SAMPLE);

  it("builds nodes with stable pointer ids", () => {
    expect(root.type).toBe("object");
    expect(root.id).toBe("");
    expect(root.children.map((c) => c.key)).toEqual([
      "theme",
      "notifications",
      "tags",
      "score",
      "bio",
      "odd key",
    ]);
    const push = root.children[1]?.children[1];
    expect(push?.id).toBe("/notifications/push");
    expect(push?.depth).toBe(2);
    expect(push?.type).toBe("boolean");
    expect(buildTree({ "a/b": 1 }).children[0]?.id).toBe("/a~1b");
    expect(nodeCount(root)).toBe(11);
  });

  it("summarises containers and formats scalars", () => {
    expect(nodeSummary(root)).toBe("6 keys");
    expect(nodeSummary(root.children[2]!)).toBe("2 items");
    expect(nodeSummary(root.children[5]!)).toBe("empty");
    expect(nodeSummary(buildTree({ a: 1 }))).toBe("1 key");
    expect(scalarText("x")).toBe('"x"');
    expect(scalarText(null)).toBe("null");
    expect(scalarText(1.5)).toBe("1.5");
  });

  it("formats display and SQL paths", () => {
    expect(displayPath([])).toBe("$");
    expect(displayPath(["tags", 0])).toBe("tags[0]");
    expect(displayPath(["odd key", "x"])).toBe('"odd key".x');
    expect(sqlPath("profile", ["tags", 0], true)).toBe(`"profile"->'tags'->>0`);
    expect(sqlPath("profile", ["notifications"], false)).toBe(`"profile"->'notifications'`);
    expect(sqlPath("profile", ["it's"], true)).toBe(`"profile"->>'it''s'`);
  });

  it("expands by depth and lists visible rows", () => {
    expect([...idsUpToDepth(root, 0)]).toEqual([""]);
    expect([...idsUpToDepth(root, 1)].sort()).toEqual(["", "/notifications", "/odd key", "/tags"]);
    expect(allContainerIds(root).size).toBe(4);
    const collapsed = visibleRows(root, new Set(), null);
    expect(collapsed.rows.map((r) => r.key)).toEqual([
      "theme",
      "notifications",
      "tags",
      "score",
      "bio",
      "odd key",
    ]);
    const open = visibleRows(root, new Set(["/tags"]), null);
    expect(open.rows.map((r) => r.id)).toContain("/tags/1");
    expect(open.rows.map((r) => r.id)).not.toContain("/notifications/email");
    expect(visibleRows(buildTree("scalar"), new Set(), null).rows[0]?.value).toBe("scalar");
    const limited = visibleRows(root, new Set(), null, 2);
    expect(limited.rows).toHaveLength(2);
    expect(limited.omitted).toBe(4);
  });

  it("filters by key or value, keeping ancestors", () => {
    expect(matchingIds(root, " ")).toBeNull();
    const byValue = matchingIds(root, "true");
    expect(byValue).toEqual(new Set(["", "/notifications", "/notifications/email"]));
    const byKey = matchingIds(root, "TAG");
    expect(byKey?.has("/tags")).toBe(true);
    const rows = visibleRows(root, new Set(), byValue);
    expect(rows.rows.map((r) => r.id)).toEqual(["/notifications", "/notifications/email"]);
  });

  it("formats and minifies text", () => {
    expect(formatJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(minifyJson('{ "a" : [ 1 ] }')).toBe('{"a":[1]}');
    expect(formatJson("nope")).toBeNull();
    expect(minifyJson("nope")).toBeNull();
  });
});

describe("json preview", () => {
  it("renders compact segments", () => {
    const segments = previewSegments(SAMPLE);
    expect(segmentsText(segments)).toBe(
      '{ theme: "dark", notifications: { email: true, push: false }, tags: ["admin", "beta"], score: 42.5, bio: null, "odd key": [] }',
    );
    expect(segments[1]).toEqual({ kind: "key", text: "theme" });
    expect(segments[3]).toEqual({ kind: "string", text: '"dark"' });
    expect(segmentsText(previewSegments([]))).toBe("[]");
    expect(segmentsText(previewSegments(null))).toBe("null");
    expect(segmentsText(previewSegments(7))).toBe("7");
  });

  it("cuts long previews with an ellipsis", () => {
    const long = previewSegments({ text: "x".repeat(50), more: 1 }, 20);
    const text = segmentsText(long);
    expect(text.length).toBeLessThanOrEqual(21);
    expect(text.endsWith("…")).toBe(true);
    expect(segmentsText(previewSegments({ a: 1, b: 2 }, 9))).toBe("{ a: 1, b…");
  });
});
