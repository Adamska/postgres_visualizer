import { describe, expect, it } from "vitest";

import { clampRange, mapCompletionType, matchCase, wordContext } from "./editorHelpers";

describe("wordContext", () => {
  it("extracts the identifier before the caret", () => {
    expect(wordContext("SELECT nam", 10)).toEqual({ prefix: "nam", qualifier: null, from: 7 });
  });

  it("keeps the case of the prefix", () => {
    expect(wordContext("SEL", 3)).toEqual({ prefix: "SEL", qualifier: null, from: 0 });
  });

  it("detects the qualifier before a dot", () => {
    expect(wordContext("select u.na from users u", 11)).toEqual({ prefix: "na", qualifier: "u", from: 9 });
  });

  it("reports an empty prefix right after a dot", () => {
    expect(wordContext("select * from public.", 21)).toEqual({ prefix: "", qualifier: "public", from: 21 });
  });

  it("returns an empty context after whitespace", () => {
    expect(wordContext("select ", 7)).toEqual({ prefix: "", qualifier: null, from: 7 });
  });

  it("accepts digits, underscores and dollars in identifiers", () => {
    expect(wordContext("t1.col_2$x", 10)).toEqual({ prefix: "col_2$x", qualifier: "t1", from: 3 });
  });

  it("ignores a dot with nothing before it", () => {
    expect(wordContext(".ab", 3)).toEqual({ prefix: "ab", qualifier: null, from: 1 });
  });

  it("clamps the caret into the document", () => {
    expect(wordContext("abc", 99)).toEqual({ prefix: "abc", qualifier: null, from: 0 });
    expect(wordContext("abc", -1)).toEqual({ prefix: "", qualifier: null, from: 0 });
  });

  it("only looks at text before the caret", () => {
    expect(wordContext("us.name", 1)).toEqual({ prefix: "u", qualifier: null, from: 0 });
  });
});

describe("matchCase", () => {
  it("uppercases when the prefix starts with an uppercase letter", () => {
    expect(matchCase("Sel", "select")).toBe("SELECT");
    expect(matchCase("SEL", "SELECT")).toBe("SELECT");
  });

  it("lowercases when the prefix starts with a lowercase letter", () => {
    expect(matchCase("sel", "SELECT")).toBe("select");
  });

  it("leaves the completion unchanged for an empty or caseless prefix", () => {
    expect(matchCase("", "SELECT")).toBe("SELECT");
    expect(matchCase("_", "SELECT")).toBe("SELECT");
    expect(matchCase("1", "SELECT")).toBe("SELECT");
  });
});

describe("mapCompletionType", () => {
  it("maps every completion kind to a CodeMirror type", () => {
    expect(mapCompletionType("keyword")).toBe("keyword");
    expect(mapCompletionType("table")).toBe("class");
    expect(mapCompletionType("view")).toBe("interface");
    expect(mapCompletionType("column")).toBe("property");
    expect(mapCompletionType("schema")).toBe("namespace");
    expect(mapCompletionType("function")).toBe("function");
  });
});

describe("clampRange", () => {
  it("keeps ranges inside the document", () => {
    expect(clampRange(2, 5, 10)).toEqual({ from: 2, to: 5 });
  });

  it("clamps both ends to the document length", () => {
    expect(clampRange(-3, 50, 10)).toEqual({ from: 0, to: 10 });
    expect(clampRange(20, 30, 10)).toEqual({ from: 10, to: 10 });
  });

  it("orders reversed ranges", () => {
    expect(clampRange(8, 3, 10)).toEqual({ from: 3, to: 8 });
  });

  it("truncates fractional offsets", () => {
    expect(clampRange(1.7, 4.2, 10)).toEqual({ from: 1, to: 4 });
  });
});
