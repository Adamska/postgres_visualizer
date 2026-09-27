// ER diagram of a schema: tables as cards laid out automatically, foreign keys as curves between
// the columns they join. Drag the background to pan, scroll or pinch to zoom, drag a card's header
// to move it, double-click it to open the table.

import {
  KeyRound,
  Link2,
  LocateFixed,
  Maximize,
  Minus,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ErrorBanner } from "@/components/Primitives";
import { IconButton, Spinner } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { layoutDiagram, type Point } from "@/core/diagram/layout";
import { compactCount } from "@/core/format/values";
import { cn } from "@/lib/cn";
import type { GraphTable, SchemaGraph } from "@/lib/types";
import { loadDiagram, moveDiagramTable, resetDiagramLayout } from "@/state/actions/diagramTab";
import { openTable } from "@/state/actions/workspace";
import { useAppStore, type DiagramTab as DiagramTabState } from "@/state/store";

const CARD_WIDTH = 240;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 22;
const MAX_ROWS = 24;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;

function visibleRows(table: GraphTable): number {
  return Math.min(table.columns.length, MAX_ROWS) + (table.columns.length > MAX_ROWS ? 1 : 0);
}

function cardHeight(table: GraphTable): number {
  return HEADER_HEIGHT + visibleRows(table) * ROW_HEIGHT + 6;
}

/** Vertical centre of a column's row within its card (the header when the row is hidden). */
function columnOffset(table: GraphTable, column: string | undefined): number {
  const index = column === undefined ? -1 : table.columns.findIndex((c) => c.name === column);
  if (index === -1 || index >= MAX_ROWS) return HEADER_HEIGHT / 2;
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

interface Edge {
  key: string;
  from: string;
  to: string;
  path: string;
}

function edgesOf(graph: SchemaGraph, positions: Record<string, Point>): Edge[] {
  const byName = new Map(graph.tables.map((t) => [t.name, t]));
  return graph.foreignKeys.flatMap((fk) => {
    const child = byName.get(fk.table);
    const parent = fk.referencedSchema === graph.schema ? byName.get(fk.referencedTable) : undefined;
    const a = positions[fk.table];
    const b = parent ? positions[parent.name] : undefined;
    if (!child || !parent || !a || !b) return [];
    const y1 = a.y + columnOffset(child, fk.columns[0]);
    const y2 = b.y + columnOffset(parent, fk.referencedColumns[0]);
    let path: string;
    if (child === parent) {
      const x = a.x + CARD_WIDTH;
      path = `M${x},${y1} C${x + 50},${y1} ${x + 50},${y2} ${x},${y2}`;
    } else {
      const childLeft = a.x + CARD_WIDTH / 2 > b.x + CARD_WIDTH / 2;
      const x1 = childLeft ? a.x : a.x + CARD_WIDTH;
      const x2 = childLeft ? b.x + CARD_WIDTH : b.x;
      const bend = Math.max(40, Math.abs(x2 - x1) / 2);
      path = `M${x1},${y1} C${x1 + (childLeft ? -bend : bend)},${y1} ${x2 + (childLeft ? bend : -bend)},${y2} ${x2},${y2}`;
    }
    return [{ key: `${fk.table}.${fk.name}`, from: fk.table, to: parent.name, path }];
  });
}

function TableCard({
  table,
  position,
  foreignColumns,
  state,
  onHover,
  onDragStart,
  onOpen,
}: {
  table: GraphTable;
  position: Point;
  foreignColumns: ReadonlySet<string>;
  state: "normal" | "focus" | "related" | "dimmed";
  onHover: (hovered: boolean) => void;
  onDragStart: (event: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute overflow-hidden rounded-xl border bg-surface-raised shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-[opacity,border-color,box-shadow]",
        state === "focus"
          ? "border-accent shadow-pop"
          : state === "related"
            ? "border-accent/50"
            : "border-line-strong/60",
        state === "dimmed" && "opacity-40",
      )}
      style={{ left: position.x, top: position.y, width: CARD_WIDTH }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <div
        onPointerDown={onDragStart}
        onDoubleClick={onOpen}
        title="Drag to move · double-click to open"
        className="flex cursor-grab items-center gap-2 border-b border-line bg-surface-sunken px-3 active:cursor-grabbing"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{table.name}</span>
        {table.estimatedRows !== null && (
          <span className="font-mono text-[10.5px] text-fg-subtle tabular-nums">
            {compactCount(table.estimatedRows)}
          </span>
        )}
      </div>
      <div className="py-[3px]">
        {table.columns.slice(0, MAX_ROWS).map((column) => (
          <div
            key={column.name}
            className="flex items-center gap-1.5 px-3 text-[11.5px]"
            style={{ height: ROW_HEIGHT }}
            title={`${column.name} ${column.typeName}${column.isNullable ? "" : " NOT NULL"}`}
          >
            <span className="flex w-3.5 shrink-0 justify-center">
              {column.isPrimaryKey ? (
                <KeyRound className="size-3 text-warning" aria-label="Primary key" />
              ) : foreignColumns.has(column.name) ? (
                <Link2 className="size-3 text-accent" aria-label="Foreign key" />
              ) : null}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", column.isPrimaryKey && "font-medium")}>
              {column.name}
            </span>
            <span className="max-w-24 truncate font-mono text-[10.5px] text-fg-subtle">
              {column.typeName}
            </span>
          </div>
        ))}
        {table.columns.length > MAX_ROWS && (
          <div
            className="px-3 text-[11px] text-fg-subtle"
            style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
          >
            +{table.columns.length - MAX_ROWS} more columns
          </div>
        )}
      </div>
    </div>
  );
}

export function DiagramTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is DiagramTabState => t.id === tabId && t.kind === "diagram"),
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<{ table: string; position: Point } | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (tab && !tab.graph && !tab.loading && !tab.error) void loadDiagram(tabId);
  }, [tab, tabId]);

  const graph = tab?.graph ?? null;
  const auto = useMemo(() => {
    if (!graph) return null;
    return layoutDiagram(
      graph.tables.map((t) => ({ key: t.name, width: CARD_WIDTH, height: cardHeight(t) })),
      graph.foreignKeys
        .filter((fk) => fk.referencedSchema === graph.schema)
        .map((fk) => ({ from: fk.table, to: fk.referencedTable })),
    );
  }, [graph]);
  const positions = useMemo(() => {
    const merged: Record<string, Point> = { ...(auto?.positions ?? {}), ...(tab?.positions ?? {}) };
    if (dragging) merged[dragging.table] = dragging.position;
    return merged;
  }, [auto, tab?.positions, dragging]);
  const edges = useMemo(() => (graph ? edgesOf(graph, positions) : []), [graph, positions]);
  const foreignColumns = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const fk of graph?.foreignKeys ?? []) {
      const set = map.get(fk.table) ?? new Set<string>();
      fk.columns.forEach((c) => set.add(c));
      map.set(fk.table, set);
    }
    return map;
  }, [graph]);

  const bounds = useCallback(() => {
    if (!graph || graph.tables.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const table of graph.tables) {
      const p = positions[table.name];
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + CARD_WIDTH);
      maxY = Math.max(maxY, p.y + cardHeight(table));
    }
    return { minX, minY, maxX, maxY };
  }, [graph, positions]);

  const fit = useCallback(() => {
    const box = bounds();
    const element = viewport.current;
    if (!box || !element) return;
    const padding = 48;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const zoom = Math.min(
      1,
      (width - padding * 2) / (box.maxX - box.minX),
      (height - padding * 2) / (box.maxY - box.minY),
    );
    const clamped = Math.max(MIN_ZOOM, zoom);
    setView({
      zoom: clamped,
      x: (width - (box.maxX - box.minX) * clamped) / 2 - box.minX * clamped,
      y: Math.max(padding, (height - (box.maxY - box.minY) * clamped) / 2) - box.minY * clamped,
    });
  }, [bounds]);

  useEffect(() => {
    if (graph && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [graph, fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const element = viewport.current;
    const px = cx ?? (element?.clientWidth ?? 0) / 2;
    const py = cy ?? (element?.clientHeight ?? 0) / 2;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const ratio = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  const onWheel = (event: React.WheelEvent) => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    if (event.ctrlKey || event.metaKey) {
      zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - box.left, event.clientY - box.top);
    } else {
      setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    }
  };

  const onBackgroundDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-card]")) return;
    const start = { x: event.clientX, y: event.clientY, view };
    setFocused(null);
    const move = (e: PointerEvent) =>
      setView({
        ...start.view,
        x: start.view.x + e.clientX - start.x,
        y: start.view.y + e.clientY - start.y,
      });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onCardDragStart = (table: string) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const origin = positions[table] ?? { x: 0, y: 0 };
    const start = { x: event.clientX, y: event.clientY };
    let last = origin;
    setFocused(table);
    const move = (e: PointerEvent) => {
      last = {
        x: origin.x + (e.clientX - start.x) / view.zoom,
        y: origin.y + (e.clientY - start.y) / view.zoom,
      };
      setDragging({ table, position: last });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (last !== origin) moveDiagramTable(tabId, table, last);
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const locate = (name: string) => {
    const table = graph?.tables.find((t) => t.name === name);
    const p = positions[name];
    const element = viewport.current;
    if (!table || !p || !element) return;
    setFocused(name);
    setView((v) => ({
      ...v,
      x: element.clientWidth / 2 - (p.x + CARD_WIDTH / 2) * v.zoom,
      y: element.clientHeight / 2 - (p.y + cardHeight(table) / 2) * v.zoom,
    }));
  };

  if (!tab) return null;
  const active = hovered ?? focused;
  const related = new Set<string>();
  if (active) {
    related.add(active);
    for (const edge of edges) {
      if (edge.from === active) related.add(edge.to);
      if (edge.to === active) related.add(edge.from);
    }
  }
  const matches =
    search.trim() === "" || !graph
      ? []
      : graph.tables.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <Network className="ml-1 size-4 text-accent" />
        <span className="ml-1 text-[12.5px] font-medium">{tab.schema}</span>
        {graph && (
          <span className="ml-1 text-[12px] text-fg-subtle">
            {graph.tables.length} tables · {graph.foreignKeys.length} relationships
          </span>
        )}
        <span className="flex-1" />
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                locate(matches[0].name);
                setSearch("");
              }
            }}
            placeholder="Find a table"
            leading={<Search className="size-3.5" />}
            className="w-48 [&>input]:h-7 [&>input]:text-[12px]"
          />
          {matches.length > 0 && (
            <div className="absolute top-8 right-0 z-20 w-56 rounded-lg border border-line bg-surface-raised p-1 shadow-pop">
              {matches.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => {
                    locate(m.name);
                    setSearch("");
                  }}
                  className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] hover:bg-accent hover:text-accent-fg"
                >
                  <LocateFixed className="size-3.5" /> {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconButton label="Zoom out" size="sm" onClick={() => zoomAt(1 / 1.2)}>
          <Minus className="size-4" />
        </IconButton>
        <span className="w-11 text-center text-[11.5px] text-fg-muted tabular-nums">
          {Math.round(view.zoom * 100)}%
        </span>
        <IconButton label="Zoom in" size="sm" onClick={() => zoomAt(1.2)}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton label="Fit to window" size="sm" onClick={fit}>
          <Maximize className="size-3.5" />
        </IconButton>
        <IconButton label="Automatic layout" size="sm" onClick={() => resetDiagramLayout(tabId)}>
          <RotateCcw className="size-3.5" />
        </IconButton>
        <IconButton
          label="Reload"
          size="sm"
          onClick={() => {
            fitted.current = false;
            void loadDiagram(tabId);
          }}
        >
          <RefreshCw className="size-3.5" />
        </IconButton>
      </div>
      {tab.error && <ErrorBanner error={tab.error} />}
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 cursor-default overflow-hidden bg-canvas [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:20px_20px]"
        onWheel={onWheel}
        onPointerDown={onBackgroundDown}
        style={{ backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        {!graph ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-fg-muted">
            {tab.loading && <Spinner className="size-4" />} {tab.loading ? "Reading the schema…" : null}
          </div>
        ) : graph.tables.length === 0 ? (
          <EmptyState icon={<Network />} title="No tables in this schema" />
        ) : (
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
              <defs>
                {(["idle", "lit"] as const).map((kind) => (
                  <marker
                    key={kind}
                    id={`arrow-${kind}-${tabId}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M0,0 L10,5 L0,10 z"
                      fill={kind === "lit" ? "var(--accent)" : "var(--fg-subtle)"}
                    />
                  </marker>
                ))}
              </defs>
              {edges.map((edge) => {
                const lit = active !== null && (edge.from === active || edge.to === active);
                return (
                  <path
                    key={edge.key}
                    d={edge.path}
                    fill="none"
                    stroke={lit ? "var(--accent)" : "var(--fg-subtle)"}
                    strokeOpacity={active !== null && !lit ? 0.25 : lit ? 1 : 0.7}
                    strokeWidth={lit ? 2 : 1.25}
                    markerEnd={`url(#arrow-${lit ? "lit" : "idle"}-${tabId})`}
                  />
                );
              })}
            </svg>
            {graph.tables.map((table) => {
              const position = positions[table.name];
              if (!position) return null;
              const state =
                active === null
                  ? "normal"
                  : table.name === active
                    ? "focus"
                    : related.has(table.name)
                      ? "related"
                      : "dimmed";
              return (
                <div key={table.name} data-card>
                  <TableCard
                    table={table}
                    position={position}
                    foreignColumns={foreignColumns.get(table.name) ?? new Set()}
                    state={state}
                    onHover={(on) => setHovered(on ? table.name : null)}
                    onDragStart={onCardDragStart(table.name)}
                    onOpen={() => openTable(tab.connectionId, { schema: tab.schema, name: table.name })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
