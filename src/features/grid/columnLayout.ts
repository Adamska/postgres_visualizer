// Column arrangement (hidden, order, widths, frozen) kept by column name, and its mapping to the
// grid's column ids (indices into the result).

import type { GridColumn } from "./types";

/** Column arrangement of a table, by column name; persisted per table. */
export interface TableLayout {
  hidden: string[];
  /** Display order; columns missing from it follow in their natural order. */
  order: string[];
  widths: Record<string, number>;
  /** Number of leading visible columns kept in place while scrolling sideways. */
  frozen: number;
}

export const EMPTY_LAYOUT: TableLayout = { hidden: [], order: [], widths: {}, frozen: 0 };

/** The layout expressed in column ids, as the grid takes it. */
export interface GridLayout {
  hidden: ReadonlySet<number>;
  /** Column ids in display order. */
  order: number[];
  widths: ReadonlyMap<number, number>;
  frozen: number;
}

export function toGridLayout(columns: readonly GridColumn[], layout: TableLayout): GridLayout {
  const idOf = new Map(columns.map((c) => [c.name, c.id]));
  const ordered = layout.order.map((name) => idOf.get(name)).filter((id): id is number => id !== undefined);
  const seen = new Set(ordered);
  const order = [...ordered, ...columns.map((c) => c.id).filter((id) => !seen.has(id))];
  const hidden = new Set(
    layout.hidden.map((name) => idOf.get(name)).filter((id): id is number => id !== undefined),
  );
  const widths = new Map<number, number>();
  for (const [name, width] of Object.entries(layout.widths)) {
    const id = idOf.get(name);
    if (id !== undefined) widths.set(id, width);
  }
  return { hidden, order, widths, frozen: layout.frozen };
}

function nameOf(columns: readonly GridColumn[], id: number): string | undefined {
  return columns.find((c) => c.id === id)?.name;
}

export function toggleHidden(layout: TableLayout, name: string): TableLayout {
  const hidden = layout.hidden.includes(name)
    ? layout.hidden.filter((n) => n !== name)
    : [...layout.hidden, name];
  return { ...layout, hidden };
}

export function resizeColumn(layout: TableLayout, name: string, width: number): TableLayout {
  return { ...layout, widths: { ...layout.widths, [name]: Math.round(width) } };
}

/** Records a new display order given as column ids. */
export function reorderColumns(
  layout: TableLayout,
  columns: readonly GridColumn[],
  order: readonly number[],
): TableLayout {
  return {
    ...layout,
    order: order.map((id) => nameOf(columns, id)).filter((name): name is string => name !== undefined),
  };
}

export function freezeColumns(layout: TableLayout, count: number): TableLayout {
  return { ...layout, frozen: Math.max(0, count) };
}

/** Moves the item at `from` to position `to` (both indices into `order`). */
export function moveItem<T>(order: readonly T[], from: number, to: number): T[] {
  const next = [...order];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
