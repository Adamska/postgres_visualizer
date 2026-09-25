import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.18)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-surface-raised text-fg border border-line-strong/70 shadow-[0_1px_1px_rgb(0_0_0/0.05)] hover:bg-surface-sunken active:bg-surface-sunken",
  ghost: "text-fg-muted hover:bg-fg/6 hover:text-fg active:bg-fg/10",
  danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
  link: "text-accent hover:underline px-0",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-sm",
  md: "h-8 px-3 text-[13px] gap-2 rounded-md",
  lg: "h-10 px-4 text-[14px] gap-2 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled ?? loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,filter,color] duration-100 outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin text-current", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: ButtonSize;
  active?: boolean;
}

/** Square ghost button for toolbars. `label` is the accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", active = false, className, children, ...props },
  ref,
) {
  const box =
    size === "sm" ? "size-7 rounded-sm" : size === "lg" ? "size-10 rounded-md" : "size-8 rounded-md";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-fg-muted transition-colors duration-100 outline-none",
        "hover:bg-fg/6 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        box,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
