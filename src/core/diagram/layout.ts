// Automatic layout for the ER diagram: referenced tables sit in the left columns, the tables
// pointing at them further right (a layered layout), with barycentre ordering to limit edge
// crossings. Tables without any relationship are packed in a grid underneath.

export interface LayoutNode {
  key: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  /** The referencing (child) table. */
  from: string;
  /** The referenced (parent) table. */
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  positions: Record<string, Point>;
  width: number;
  height: number;
}

export const LAYER_GAP = 120;
export const NODE_GAP = 36;
const SWEEPS = 4;

/** Layer of each connected node: 0 for tables that reference nothing, else one past their parents. */
function assignLayers(keys: readonly string[], parents: Map<string, string[]>): Map<string, number> {
  const layers = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (key: string): number => {
    const known = layers.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return 0; // cycle: break it here
    visiting.add(key);
    let layer = 0;
    for (const parent of parents.get(key) ?? []) {
      if (parent !== key) layer = Math.max(layer, visit(parent) + 1);
    }
    visiting.delete(key);
    layers.set(key, layer);
    return layer;
  };
  keys.forEach(visit);
  return layers;
}

/**
 * Moves tables that reference nothing next to their nearest child, so an edge from a deep table
 * to a lookup table does not cross the columns in between.
 */
function tightenRoots(
  keys: readonly string[],
  parents: Map<string, string[]>,
  children: Map<string, string[]>,
  layers: Map<string, number>,
): void {
  for (const key of keys) {
    if ((parents.get(key) ?? []).some((p) => p !== key)) continue;
    const childLayers = (children.get(key) ?? []).filter((c) => c !== key).map((c) => layers.get(c) ?? 0);
    if (childLayers.length > 0) layers.set(key, Math.max(0, Math.min(...childLayers) - 1));
  }
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Reorders each layer by the mean position of its neighbours in the reference layer. */
function sweep(
  columns: string[][],
  neighbours: Map<string, string[]>,
  order: readonly number[],
  referenceOffset: number,
): void {
  for (const index of order) {
    const reference = columns[index + referenceOffset];
    const column = columns[index];
    if (!reference || !column) continue;
    const position = new Map(reference.map((key, i) => [key, i]));
    const scored = column.map((key, i) => {
      const positions = (neighbours.get(key) ?? [])
        .map((n) => position.get(n))
        .filter((p): p is number => p !== undefined);
      return { key, score: average(positions) ?? i };
    });
    scored.sort((a, b) => a.score - b.score);
    columns[index] = scored.map((s) => s.key);
  }
}

export function layoutDiagram(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): Layout {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const connected = new Set<string>();
  for (const edge of edges) {
    if (!byKey.has(edge.from) || !byKey.has(edge.to) || edge.from === edge.to) continue;
    parents.set(edge.from, [...(parents.get(edge.from) ?? []), edge.to]);
    children.set(edge.to, [...(children.get(edge.to) ?? []), edge.from]);
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const linked = nodes.filter((n) => connected.has(n.key)).map((n) => n.key);
  const isolated = nodes.filter((n) => !connected.has(n.key));

  const layers = assignLayers(linked, parents);
  tightenRoots(linked, parents, children, layers);
  const columns: string[][] = [];
  for (const key of linked) {
    const layer = layers.get(key) ?? 0;
    (columns[layer] ??= []).push(key);
  }
  for (let i = 0; i < columns.length; i++) columns[i] ??= [];
  const forward = columns.map((_, i) => i).slice(1);
  const backward = columns
    .map((_, i) => i)
    .slice(0, -1)
    .reverse();
  for (let i = 0; i < SWEEPS; i++) {
    sweep(columns, parents, forward, -1);
    sweep(columns, children, backward, 1);
  }

  const positions: Record<string, Point> = {};
  let x = 0;
  let height = 0;
  for (const column of columns) {
    const width = Math.max(0, ...column.map((key) => byKey.get(key)?.width ?? 0));
    let y = 0;
    for (const key of column) {
      positions[key] = { x, y };
      y += (byKey.get(key)?.height ?? 0) + NODE_GAP;
    }
    height = Math.max(height, y - NODE_GAP);
    x += width + LAYER_GAP;
  }
  let width = Math.max(0, x - LAYER_GAP);

  // Pack the unrelated tables in rows below, as wide as the graph (or a sensible minimum).
  if (isolated.length > 0) {
    const rowWidth = Math.max(width, 1100);
    let cursorX = 0;
    let cursorY = linked.length > 0 ? height + LAYER_GAP : 0;
    let rowHeight = 0;
    for (const node of isolated) {
      if (cursorX > 0 && cursorX + node.width > rowWidth) {
        cursorX = 0;
        cursorY += rowHeight + NODE_GAP;
        rowHeight = 0;
      }
      positions[node.key] = { x: cursorX, y: cursorY };
      cursorX += node.width + NODE_GAP;
      rowHeight = Math.max(rowHeight, node.height);
      width = Math.max(width, cursorX - NODE_GAP);
    }
    height = cursorY + rowHeight;
  }
  return { positions, width, height };
}
