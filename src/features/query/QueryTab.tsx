import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ErrorBanner } from "@/components/Primitives";
import { registerEditor } from "@/features/editor/registry";
import { SqlEditor } from "@/features/editor/SqlEditor";
import type { RunScope, SqlEditorHandle } from "@/features/editor/types";
import { useTheme } from "@/hooks/useTheme";
import { queryCompletions, runQuery, setQuerySelection, setQueryText } from "@/state/actions/queryTab";
import { useSettings } from "@/state/settings";
import { useAppStore, type QueryTab as QueryTabState } from "@/state/store";

import { QueryToolbar } from "./QueryToolbar";
import { ResultsPane } from "./ResultsPane";

export function QueryTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is QueryTabState => t.id === tabId && t.kind === "query"),
  );
  const fontSize = useSettings((s) => s.settings.editorFontSize);
  const theme = useTheme();
  const editor = useRef<SqlEditorHandle>(null);
  const [split, setSplit] = useState(0.45);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = editor.current;
    return handle ? registerEditor(tabId, handle) : undefined;
  }, [tabId]);

  const onRun = useCallback((scope: RunScope) => void runQuery(tabId, scope), [tabId]);
  const completionProvider = useCallback(
    (prefix: string, qualifier: string | null) => queryCompletions(tabId, prefix, qualifier),
    [tabId],
  );
  const onChange = useCallback((value: string) => setQueryText(tabId, value), [tabId]);
  const onSelectionChange = useCallback(
    (selection: { anchor: number; head: number }) => setQuerySelection(tabId, selection),
    [tabId],
  );

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    const move = (e: PointerEvent) =>
      setSplit(Math.min(0.85, Math.max(0.15, (e.clientY - bounds.top) / bounds.height)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const editorMarker = useMemo(() => tab?.errorMarker ?? null, [tab?.errorMarker]);
  if (!tab) return null;

  return (
    <div className="flex h-full flex-col">
      <QueryToolbar tab={tab} onInsert={(sql) => editor.current?.insertText(sql)} />
      <div ref={container} className="flex min-h-0 flex-1 flex-col">
        <div style={{ flexBasis: `${split * 100}%` }} className="min-h-0 shrink-0 grow-0">
          <SqlEditor
            ref={editor}
            value={tab.text}
            onChange={onChange}
            onSelectionChange={onSelectionChange}
            completionProvider={completionProvider}
            errorMarker={editorMarker}
            fontSize={fontSize}
            theme={theme}
            onRun={onRun}
            autoFocus
            className="h-full"
          />
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={startDrag}
          className="group relative z-10 h-1.5 shrink-0 cursor-row-resize border-y border-line bg-surface-sunken/70 hover:bg-accent/30"
        />
        <div className="flex min-h-0 flex-1 flex-col">
          {tab.error && <ErrorBanner error={tab.error} />}
          <ResultsPane tab={tab} />
        </div>
      </div>
    </div>
  );
}
