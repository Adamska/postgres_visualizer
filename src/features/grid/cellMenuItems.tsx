// Builds the items of the grid's right-click menus.

import {
  ArrowUpRight,
  Ban,
  Braces,
  Copy,
  Eye,
  EyeOff,
  PencilLine,
  RotateCcw,
  Rows3,
  ToggleLeft,
  Trash2,
} from "lucide-react";

import type { MenuItem } from "@/components/ui/Menu";

import {
  activationFor,
  canSetNull,
  editModeFor,
  gridColumnOf,
  hiddenColumns,
  rowsForDeletion,
  rowsTsv,
  selectionTsv,
  type VisibleColumn,
} from "./gridModel";
import type { GridActions, GridCellPosition, GridColumn, GridContent, GridRow } from "./types";

/** What was right-clicked. */
export type MenuTarget =
  | { kind: "cell"; position: GridCellPosition; column: GridColumn; row: GridRow }
  | { kind: "header"; column: GridColumn };

/** Everything the menu needs to build its items. */
export interface MenuContext {
  target: MenuTarget | null;
  content: GridContent;
  visible: readonly VisibleColumn[];
  hiddenColumnIds: ReadonlySet<number> | undefined;
  /** Rows selected through the row markers. */
  selectedRows: readonly number[];
  readOnly: boolean;
  actions: GridActions | undefined;
  copy: (text: string) => void;
}

/** Items for a right-clicked cell. */
export function buildCellMenuItems(
  context: MenuContext,
  target: Extract<MenuTarget, { kind: "cell" }>,
): MenuItem[] {
  const { content, visible, selectedRows, readOnly, actions, copy } = context;
  const { position, column, row } = target;
  const gridColumn = gridColumnOf(visible, position.column);
  const editable = editModeFor(column, row, readOnly) !== "none";
  const activation = activationFor(column, row, row.cells[position.column], readOnly);
  const deleteRows = rowsForDeletion(selectedRows, position.row);
  const items: MenuItem[] = [
    {
      id: "copy",
      label: "Copy",
      icon: <Copy className="size-3.5" />,
      shortcut: "⌘C",
      onSelect: () =>
        copy(selectionTsv(content, visible, { x: gridColumn, y: position.row, width: 1, height: 1 })),
    },
    {
      id: "copy-row",
      label: "Copy row as TSV",
      icon: <Rows3 className="size-3.5" />,
      onSelect: () => copy(rowsTsv(content, visible, deleteRows)),
    },
    {
      id: "set-null",
      label: "Set NULL",
      icon: <Ban className="size-3.5" />,
      shortcut: "⇧⌘N",
      separatorBefore: true,
      disabled: !canSetNull(column, row, readOnly),
      onSelect: () => actions?.onCommitEdit?.(position, { kind: "null" }),
    },
    {
      id: "set-default",
      label: "Set DEFAULT",
      icon: <RotateCcw className="size-3.5" />,
      disabled: !editable,
      onSelect: () => actions?.onCommitEdit?.(position, { kind: "default" }),
    },
    activation === "toggle"
      ? {
          id: "toggle",
          label: `Set ${row.cells[position.column]?.boolean ? "FALSE" : "TRUE"}`,
          icon: <ToggleLeft className="size-3.5" />,
          shortcut: "⌘↩",
          onSelect: () =>
            actions?.onCommitEdit?.(position, {
              kind: "text",
              value: row.cells[position.column]?.boolean ? "false" : "true",
            }),
        }
      : {
          id: "edit",
          label: activation === "view" ? "View value…" : "Edit value…",
          icon: activation === "view" ? <Braces className="size-3.5" /> : <PencilLine className="size-3.5" />,
          shortcut: "⌘↩",
          disabled: activation === "none",
          onSelect: () => actions?.onOpenEditor?.(position),
        },
  ];
  if (column.isForeignKey) {
    items.push({
      id: "follow-fk",
      label: "Follow foreign key",
      icon: <ArrowUpRight className="size-3.5" />,
      separatorBefore: true,
      onSelect: () => actions?.onFollowForeignKey?.(position),
    });
  }
  if (!readOnly) {
    items.push({
      id: "delete-rows",
      label: deleteRows.length > 1 ? `Delete ${deleteRows.length} rows` : "Delete row",
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      separatorBefore: true,
      onSelect: () => actions?.onDeleteRows?.(deleteRows),
    });
  }
  return items;
}

/** Items for a right-clicked header: hide this column, show any hidden one. */
export function buildHeaderMenuItems(
  context: MenuContext,
  target: Extract<MenuTarget, { kind: "header" }>,
): MenuItem[] {
  const { content, hiddenColumnIds, actions } = context;
  const items: MenuItem[] = [
    {
      id: "hide",
      label: `Hide ${target.column.name}`,
      icon: <EyeOff className="size-3.5" />,
      onSelect: () => actions?.onToggleColumnVisibility?.(target.column.id),
    },
  ];
  hiddenColumns(content.columns, hiddenColumnIds).forEach((column, index) => {
    items.push({
      id: `show-${column.id}`,
      label: `Show ${column.name}`,
      icon: <Eye className="size-3.5" />,
      separatorBefore: index === 0,
      onSelect: () => actions?.onToggleColumnVisibility?.(column.id),
    });
  });
  return items;
}

/** Items for whatever was right-clicked; empty when nothing was. */
export function buildMenuItems(context: MenuContext): MenuItem[] {
  const { target } = context;
  if (target === null) return [];
  return target.kind === "cell" ? buildCellMenuItems(context, target) : buildHeaderMenuItems(context, target);
}
