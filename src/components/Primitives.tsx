// Small shared pieces: colour dots, empty states, error banners.

import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { AppError, ProfileColor } from "@/lib/types";

import { IconButton } from "./ui/Button";

export const PROFILE_COLORS: Record<ProfileColor, string | null> = {
  none: null,
  red: "#ef4444",
  orange: "#f59e0b",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#9ca3af",
};

export function ColorDot({
  color,
  size = 8,
  className,
}: {
  color: ProfileColor;
  size?: number;
  className?: string;
}) {
  const value = PROFILE_COLORS[color];
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: value ?? "transparent",
        boxShadow: value ? `0 0 0 1px rgb(0 0 0 / 0.08) inset` : "0 0 0 1.5px var(--fg-subtle) inset",
      }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-fg/5 text-fg-subtle [&>svg]:size-6">
        {icon}
      </div>
      <div className="text-[14px] font-semibold text-fg">{title}</div>
      {message && <p className="max-w-sm text-[12.5px] leading-relaxed text-fg-muted">{message}</p>}
      {children && <div className="mt-1 flex gap-2">{children}</div>}
    </div>
  );
}

export function ErrorBanner({
  error,
  onDismiss,
  className,
}: {
  error: AppError;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-3 mt-3 flex items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[12.5px]",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 select-text">
        <div className="font-medium text-fg">{error.message}</div>
        {error.detail && <div className="mt-0.5 text-fg-muted">{error.detail}</div>}
        {error.hint && <div className="mt-0.5 text-fg-muted">Hint: {error.hint}</div>}
        {error.sqlState && (
          <div className="mt-1 font-mono text-[11px] text-fg-subtle">SQLSTATE {error.sqlState}</div>
        )}
      </div>
      {onDismiss && (
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X className="size-3.5" />
        </IconButton>
      )}
    </div>
  );
}

export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return <div className={cn("shrink-0 bg-line", vertical ? "mx-1 h-4 w-px" : "h-px w-full", className)} />;
}
