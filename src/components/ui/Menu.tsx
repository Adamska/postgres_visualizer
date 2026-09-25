// Dropdown and context menus built on Radix, styled with the design tokens.

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

export const menuContentClass =
  "z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-surface-raised/95 p-1 text-[13px] text-fg shadow-pop backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out";

export const menuItemClass =
  "relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-2 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

export const menuSeparatorClass = "my-1 h-px bg-line";

export const menuLabelClass = "px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  separatorBefore?: boolean;
}

function renderItems(
  items: MenuItem[],
  Item: typeof DropdownPrimitive.Item | typeof ContextMenuPrimitive.Item,
  Separator: typeof DropdownPrimitive.Separator | typeof ContextMenuPrimitive.Separator,
) {
  return items.map((item) => (
    <div key={item.id}>
      {item.separatorBefore && <Separator className={menuSeparatorClass} />}
      <Item
        disabled={item.disabled}
        onSelect={item.onSelect}
        className={cn(menuItemClass, item.danger && "text-danger data-[highlighted]:bg-danger")}
      >
        <span className="flex w-4 items-center justify-center text-fg-muted [[data-highlighted]>&]:text-inherit">
          {item.checked ? <Check className="size-3.5" /> : item.icon}
        </span>
        <span className="flex-1">{item.label}</span>
        {item.shortcut && (
          <span className="ml-4 text-[11px] text-fg-subtle [[data-highlighted]>&]:text-inherit">
            {item.shortcut}
          </span>
        )}
      </Item>
    </div>
  ));
}

export function DropdownMenu({
  trigger,
  items,
  align = "start",
  ...props
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "center" | "end";
} & ComponentPropsWithoutRef<typeof DropdownPrimitive.Root>) {
  return (
    <DropdownPrimitive.Root {...props}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align={align} sideOffset={6} className={menuContentClass}>
          {renderItems(items, DropdownPrimitive.Item, DropdownPrimitive.Separator)}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function ContextMenu({
  children,
  items,
  onOpenChange,
}: {
  children: ReactNode;
  items: MenuItem[];
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={menuContentClass}>
          {renderItems(items, ContextMenuPrimitive.Item, ContextMenuPrimitive.Separator)}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
