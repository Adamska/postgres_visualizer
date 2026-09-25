import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { IconButton } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { dismissToast, useAppStore } from "@/state/store";

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface-raised/95 p-3 pr-2 text-[12.5px] shadow-pop backdrop-blur-xl",
          )}
        >
          {toast.tone === "error" && <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
          {toast.tone === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
          {toast.tone === "info" && <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-fg">{toast.title}</div>
            {toast.message && <div className="mt-0.5 break-words text-fg-muted">{toast.message}</div>}
          </div>
          <IconButton label="Dismiss" size="sm" onClick={() => dismissToast(toast.id)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
