// Collapsible, colour-coded tree for JSON values, with filtering and copy actions.

import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Route, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DropdownMenu, type MenuItem } from "@/components/ui/Menu";
import { previewSegments, type JsonSegment } from "@/core/json/preview";
import {
  allContainerIds,
  buildTree,
  displayPath,
  idsUpToDepth,
  isContainer,
  matchingIds,
  nodeSummary,
  scalarText,
  sqlPath,
  visibleRows,
  type JsonNode,
  type JsonValue,
} from "@/core/json/tree";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/files";

export interface JsonViewerProps {
  value: JsonValue;
  /** Column holding the value; enables "Copy SQL expression". */
  columnName?: string;
  /** How many levels start expanded; 1 shows the root's children collapsed. */
  initialDepth?: number;
  /** Tighter rows for side panels. */
  dense?: boolean;
  /** Filter box and expand/collapse buttons above the tree. */
  toolbar?: boolean;
  className?: string;
}

/** Characters of inline preview shown next to a collapsed container. */
const COLLAPSED_PREVIEW_BUDGET = 70;

export function JsonViewer({
  value,
  columnName,
  initialDepth = 1,
  dense = false,
  toolbar = false,
  className,
}: JsonViewerProps) {
  const root = useMemo(() => buildTree(value), [value]);
  const [expanded, setExpanded] = useState(() => idsUpToDepth(root, initialDepth - 1));
  const [query, setQuery] = useState("");
  useEffect(() => setExpanded(idsUpToDepth(root, initialDepth - 1)), [root, initialDepth]);

  const filter = useMemo(() => matchingIds(root, query), [root, query]);
  const { rows, omitted } = useMemo(() => visibleRows(root, expanded, filter), [root, expanded, filter]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cn("flex min-h-0 flex-col", className)} data-testid="json-viewer">
      {toolbar && (
        <div className="flex shrink-0 items-center gap-1 pb-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter keys and values"
            leading={<Search className="size-3.5" />}
            className="flex-1 [&>input]:h-7 [&>input]:text-[12px]"
            aria-label="Filter JSON"
          />
          <IconButton label="Expand all" size="sm" onClick={() => setExpanded(allContainerIds(root))}>
            <ChevronsUpDown className="size-3.5" />
          </IconButton>
          <IconButton label="Collapse all" size="sm" onClick={() => setExpanded(new Set())}>
            <ChevronsDownUp className="size-3.5" />
          </IconButton>
          <IconButton
            label="Copy JSON"
            size="sm"
            onClick={() => void copyText(JSON.stringify(value, null, 2))}
          >
            <Copy className="size-3.5" />
          </IconButton>
        </div>
      )}
      <div
        role="tree"
        className={cn(
          "min-h-0 flex-1 select-text overflow-auto font-mono",
          dense ? "text-[11.5px]" : "text-[12px]",
        )}
      >
        {rows.length === 0 ? (
          <div className="px-2 py-1.5 text-fg-subtle italic">
            {query.trim() === "" ? (root.type === "array" ? "empty array" : "empty object") : "No matches"}
          </div>
        ) : (
          rows.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              expanded={filter !== null || expanded.has(node.id)}
              dense={dense}
              columnName={columnName}
              onToggle={() => toggle(node.id)}
            />
          ))
        )}
        {omitted > 0 && (
          <div className="px-2 py-1.5 text-fg-subtle italic">
            … {omitted.toLocaleString("en-US")} more rows not shown
          </div>
        )}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  expanded,
  dense,
  columnName,
  onToggle,
}: {
  node: JsonNode;
  expanded: boolean;
  dense: boolean;
  columnName: string | undefined;
  onToggle: () => void;
}) {
  const container = isContainer(node.type);
  const collapsedPreview = useMemo(
    () => (container && !expanded ? previewSegments(node.value, COLLAPSED_PREVIEW_BUDGET) : null),
    [container, expanded, node.value],
  );
  const copyItems: MenuItem[] = [
    {
      id: "value",
      label: "Copy value",
      icon: <Copy className="size-3.5" />,
      onSelect: () =>
        void copyText(
          container
            ? JSON.stringify(node.value, null, 2)
            : typeof node.value === "string"
              ? node.value
              : scalarText(node.value),
        ),
    },
    {
      id: "path",
      label: "Copy path",
      icon: <Route className="size-3.5" />,
      onSelect: () => void copyText(displayPath(node.path)),
    },
  ];
  if (columnName !== undefined) {
    copyItems.push({
      id: "sql",
      label: "Copy SQL expression",
      onSelect: () => void copyText(sqlPath(columnName, node.path, !container)),
    });
  }

  return (
    <div
      role="treeitem"
      aria-expanded={container ? expanded : undefined}
      aria-level={node.depth}
      data-key={node.key ?? undefined}
      className={cn(
        "group flex items-start gap-1 rounded-sm pr-1 hover:bg-fg/5",
        dense ? "py-[2px]" : "py-[3px]",
      )}
      style={{ paddingLeft: (node.depth - 1) * 14 + 2 }}
    >
      {container ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={onToggle}
          className="mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-xs text-fg-subtle hover:bg-fg/8 hover:text-fg"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <div
        className="min-w-0 flex-1 leading-[1.45] break-all whitespace-pre-wrap"
        onDoubleClick={container ? onToggle : undefined}
      >
        {node.key !== null && (
          <>
            <span
              className={cn(
                "font-medium",
                typeof node.key === "number" ? "text-fg-subtle" : "text-syntax-key",
              )}
            >
              {node.key}
            </span>
            <span className="text-fg-subtle">: </span>
          </>
        )}
        {container ? (
          <>
            <span className="text-fg-subtle">{nodeSummary(node)}</span>
            {collapsedPreview && (
              <span className="ml-1.5 opacity-60">
                <Segments segments={collapsedPreview} />
              </span>
            )}
          </>
        ) : (
          <span className={scalarClass(node)}>{scalarText(node.value)}</span>
        )}
      </div>
      <DropdownMenu
        trigger={
          <IconButton
            label="Copy…"
            size="sm"
            className="size-5 shrink-0 rounded-xs opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <Copy className="size-3" />
          </IconButton>
        }
        items={copyItems}
        align="end"
      />
    </div>
  );
}

function scalarClass(node: JsonNode): string {
  switch (node.type) {
    case "string":
      return "text-syntax-string";
    case "number":
      return "text-syntax-number";
    case "boolean":
      return "text-syntax-boolean";
    default:
      return "text-fg-subtle italic";
  }
}

const SEGMENT_CLASSES: Record<JsonSegment["kind"], string> = {
  key: "text-syntax-key",
  string: "text-syntax-string",
  number: "text-syntax-number",
  boolean: "text-syntax-boolean",
  null: "text-fg-subtle italic",
  punct: "text-fg-muted",
};

/** Inline coloured rendering of preview segments. */
export function Segments({ segments }: { segments: readonly JsonSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index} className={SEGMENT_CLASSES[segment.kind]}>
          {segment.text}
        </span>
      ))}
    </>
  );
}
