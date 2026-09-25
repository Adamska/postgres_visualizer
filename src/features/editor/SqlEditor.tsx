// CodeMirror 6 based SQL editor used by query tabs.

import { Annotation, Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { baseExtensions, editorKeymap, type EditorCommandHandlers } from "./editorCommands";
import { clampRange } from "./editorHelpers";
import { createEditorTheme, DEFAULT_FONT_SIZE } from "./editorTheme";
import { errorMarker as errorMarkerExtension, setErrorMarker } from "./errorMarker";
import { type CompletionProvider, sqlCompletion, sqlLanguage } from "./sqlLanguage";
import type { SqlEditorHandle, SqlEditorProps } from "./types";

/** Marks transactions that mirror the `value` prop, so they are not echoed through `onChange`. */
const externalChange = Annotation.define<boolean>();

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

/**
 * SQL editor with PostgreSQL highlighting, schema-aware completion, an error underline and the
 * run/save shortcuts. The view is created once; prop changes are applied through transactions.
 */
export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(props, ref) {
  const {
    value,
    selection,
    errorMarker,
    fontSize = DEFAULT_FONT_SIZE,
    readOnly = false,
    theme = "light",
    className,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const propsRef = useRef<SqlEditorProps>(props);
  const providerRef = useRef<CompletionProvider | undefined>(props.completionProvider);
  const handlersRef = useRef<EditorCommandHandlers>({ onRun: props.onRun, onSave: props.onSave });
  const [compartments] = useState(() => ({ theme: new Compartment(), readOnly: new Compartment() }));

  // Keep the refs current so extensions created at mount always call the latest callbacks.
  useEffect(() => {
    propsRef.current = props;
    providerRef.current = props.completionProvider;
    handlersRef.current = { onRun: props.onRun, onSave: props.onSave };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const initial = propsRef.current;
    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          editorKeymap(handlersRef),
          baseExtensions(),
          sqlLanguage(),
          sqlCompletion(providerRef),
          errorMarkerExtension(),
          compartments.theme.of(
            createEditorTheme(initial.theme ?? "light", initial.fontSize ?? DEFAULT_FONT_SIZE),
          ),
          compartments.readOnly.of(readOnlyExtension(initial.readOnly ?? false)),
          EditorView.updateListener.of((update) => {
            const current = propsRef.current;
            const external = update.transactions.some((tr) => tr.annotation(externalChange) === true);
            if (update.docChanged && !external) current.onChange(update.state.doc.toString());
            if (!update.state.selection.eq(update.startState.selection)) {
              const { anchor, head } = update.state.selection.main;
              current.onSelectionChange?.({ anchor, head });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (initial.errorMarker) view.dispatch(setErrorMarker(initial.errorMarker));
    if (initial.autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [compartments]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: externalChange.of(true),
    });
  }, [value]);

  const selectionAnchor = selection?.anchor;
  const selectionHead = selection?.head;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || selectionAnchor === undefined || selectionHead === undefined) return;
    const length = view.state.doc.length;
    const anchor = clampRange(selectionAnchor, selectionAnchor, length).from;
    const head = clampRange(selectionHead, selectionHead, length).from;
    const main = view.state.selection.main;
    if (main.anchor === anchor && main.head === head) return;
    view.dispatch({ selection: EditorSelection.single(anchor, head), scrollIntoView: true });
  }, [selectionAnchor, selectionHead]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.readOnly.reconfigure(readOnlyExtension(readOnly)) });
  }, [compartments, readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.theme.reconfigure(createEditorTheme(theme, fontSize)),
    });
  }, [compartments, theme, fontSize]);

  const markerFrom = errorMarker?.from;
  const markerTo = errorMarker?.to;
  const markerMessage = errorMarker?.message;
  useEffect(() => {
    const marker =
      markerFrom !== undefined && markerTo !== undefined && markerMessage !== undefined
        ? { from: markerFrom, to: markerTo, message: markerMessage }
        : null;
    viewRef.current?.dispatch(setErrorMarker(marker));
  }, [markerFrom, markerTo, markerMessage]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      insertText: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch(view.state.replaceSelection(text));
      },
      getSelection: () => {
        const main = viewRef.current?.state.selection.main;
        return main ? { anchor: main.anchor, head: main.head } : { anchor: 0, head: 0 };
      },
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "sql-editor h-full min-h-0 w-full overflow-hidden bg-surface text-fg outline-none",
        "focus-within:ring-2 focus-within:ring-accent/30 focus-within:ring-inset",
        className,
      )}
    />
  );
});
