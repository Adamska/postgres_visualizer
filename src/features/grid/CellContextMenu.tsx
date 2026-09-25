// Right-click menu for grid cells and headers.

import type { ReactNode } from "react";

import { ContextMenu } from "@/components/ui/Menu";

import { buildMenuItems, type MenuContext } from "./cellMenuItems";

export type { MenuContext, MenuTarget } from "./cellMenuItems";

/** Wraps the grid in a context menu whose items follow the right-clicked target. */
export function CellContextMenu({
  context,
  onOpenChange,
  children,
}: {
  context: MenuContext;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu items={buildMenuItems(context)} onOpenChange={onOpenChange}>
      {children}
    </ContextMenu>
  );
}
