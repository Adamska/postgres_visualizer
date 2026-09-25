// Select, switch, segmented control, badge and keyboard hint.

import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-line-strong/70 bg-surface-raised text-fg shadow-[0_1px_1px_rgb(0_0_0/0.05)] outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-accent/40 data-[placeholder]:text-fg-subtle",
          size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[13px]",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 text-fg-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface-raised/95 p-1 text-[13px] shadow-pop backdrop-blur-xl"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm pr-2 pl-7 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
                {option.icon}
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-[13px] text-fg">{label}</span>
        {description && <span className="text-[11.5px] text-fg-subtle">{description}</span>}
      </span>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-fg/15 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=checked]:bg-accent"
      >
        <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-md bg-fg/6 p-0.5", size === "sm" ? "h-7" : "h-8")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[5px] px-3 text-[12px] font-medium transition-colors",
            option.value === value ? "bg-surface-raised text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-fg/8 text-fg-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line-strong/60 bg-surface px-1 font-sans text-[10.5px] font-medium text-fg-muted">
      {children}
    </kbd>
  );
}
