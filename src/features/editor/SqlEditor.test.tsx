import { EditorView } from "@codemirror/view";
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Completion } from "@/core/completion/engine";

import { ERROR_MARKER_CLASS } from "./errorMarker";
import { SqlEditor } from "./SqlEditor";
import { sqlCompletionSource } from "./sqlLanguage";
import type { SqlEditorHandle } from "./types";

// jsdom does not lay anything out; CodeMirror only needs these to return something rect-shaped.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  const rects = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  } as unknown as DOMRectList;
  Range.prototype.getClientRects = () => rects;
  Range.prototype.getBoundingClientRect = () => rect;
  Element.prototype.getClientRects = () => rects;
});

afterEach(cleanup);

function viewOf(container: HTMLElement): EditorView {
  const editor = container.querySelector(".cm-editor");
  const view = editor ? EditorView.findFromDOM(editor as HTMLElement) : null;
  if (!view) throw new Error("editor view not mounted");
  return view;
}

describe("SqlEditor", () => {
  it("renders the document text", () => {
    const { container } = render(<SqlEditor value="SELECT 1;" onChange={() => undefined} />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("SELECT 1;");
  });

  it("reports edits through onChange", () => {
    const onChange = vi.fn();
    const { container } = render(<SqlEditor value="SELECT 1" onChange={onChange} />);
    const view = viewOf(container);
    act(() => view.dispatch({ changes: { from: 8, insert: ";" } }));
    expect(onChange).toHaveBeenCalledWith("SELECT 1;");
  });

  it("does not echo a programmatic value update through onChange", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<SqlEditor value="SELECT 1" onChange={onChange} />);
    rerender(<SqlEditor value="SELECT 2" onChange={onChange} />);
    expect(viewOf(container).state.doc.toString()).toBe("SELECT 2");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("underlines the error marker and clears it when the prop becomes null", () => {
    const marker = { from: 7, to: 12, message: 'relation "users" does not exist' };
    const { container, rerender } = render(
      <SqlEditor value="SELECT users FROM t" onChange={() => undefined} errorMarker={marker} />,
    );
    const marked = container.querySelector(`.${ERROR_MARKER_CLASS}`);
    expect(marked).not.toBeNull();
    expect(marked?.textContent).toBe("users");
    expect(marked?.getAttribute("title")).toBe(marker.message);

    rerender(<SqlEditor value="SELECT users FROM t" onChange={() => undefined} errorMarker={null} />);
    expect(container.querySelector(`.${ERROR_MARKER_CLASS}`)).toBeNull();
  });

  it("clamps an out-of-range marker to the document", () => {
    const marker = { from: 100, to: 200, message: "syntax error at end of input" };
    const { container } = render(
      <SqlEditor value="SELECT" onChange={() => undefined} errorMarker={marker} />,
    );
    expect(container.querySelector(`.${ERROR_MARKER_CLASS}`)?.textContent).toBe("T");
  });

  it("exposes focus, insertText and getSelection through the handle", () => {
    const ref = createRef<SqlEditorHandle>();
    const onSelectionChange = vi.fn();
    const { container } = render(
      <SqlEditor
        ref={ref}
        value="SELECT  FROM t"
        onChange={() => undefined}
        onSelectionChange={onSelectionChange}
      />,
    );
    const view = viewOf(container);
    act(() => view.dispatch({ selection: { anchor: 7 } }));
    expect(onSelectionChange).toHaveBeenLastCalledWith({ anchor: 7, head: 7 });
    act(() => ref.current?.insertText("*"));
    expect(view.state.doc.toString()).toBe("SELECT * FROM t");
    expect(ref.current?.getSelection()).toEqual({ anchor: 8, head: 8 });
    act(() => ref.current?.focus());
    expect(view.hasFocus).toBe(true);
  });

  it("applies the selection prop without looping", () => {
    const onSelectionChange = vi.fn();
    const { container, rerender } = render(
      <SqlEditor value="SELECT 1" onChange={() => undefined} onSelectionChange={onSelectionChange} />,
    );
    rerender(
      <SqlEditor
        value="SELECT 1"
        onChange={() => undefined}
        onSelectionChange={onSelectionChange}
        selection={{ anchor: 0, head: 6 }}
      />,
    );
    expect(viewOf(container).state.selection.main).toMatchObject({ anchor: 0, head: 6 });
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it("toggles read-only mode", () => {
    const { container, rerender } = render(<SqlEditor value="x" onChange={() => undefined} />);
    expect(viewOf(container).state.readOnly).toBe(false);
    rerender(<SqlEditor value="x" onChange={() => undefined} readOnly />);
    expect(viewOf(container).state.readOnly).toBe(true);
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
  });
});

describe("sqlCompletionSource", () => {
  const items: Completion[] = [
    { text: "name", kind: "column", detail: "text · users" },
    { text: "SELECT", kind: "keyword" },
  ];

  function complete(doc: string, explicit = false) {
    const provider = vi.fn(() => items);
    const source = sqlCompletionSource({ current: provider });
    const view = new EditorView({ doc });
    const context = {
      state: view.state,
      pos: doc.length,
      explicit,
      aborted: false,
      view,
      tokenBefore: () => null,
      matchBefore: () => null,
      addEventListener: () => undefined,
    };
    const result = source(context);
    view.destroy();
    return { provider, result };
  }

  it("passes the prefix and the qualifier to the provider", () => {
    const { provider, result } = complete("select u.na");
    expect(provider).toHaveBeenCalledWith("na", "u");
    expect(result?.from).toBe(9);
    expect(result?.options.map((o) => o.label)).toEqual(["name", "SELECT"]);
  });

  it("activates right after a dot", () => {
    const { provider } = complete("select * from public.");
    expect(provider).toHaveBeenCalledWith("", "public");
  });

  it("stays quiet after whitespace unless explicitly requested", () => {
    expect(complete("select ").provider).not.toHaveBeenCalled();
    expect(complete("select ", true).provider).toHaveBeenCalledWith("", null);
  });

  it("inserts keywords in the typed case", () => {
    const { result } = complete("sel");
    expect(result?.options.find((o) => o.label === "SELECT")?.apply).toBe("select");
  });
});
