import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  mono?: boolean;
  invalid?: boolean;
}

export const inputClass =
  "h-8 w-full rounded-md border border-line-strong/70 bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-subtle shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-[box-shadow,border-color] duration-100 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, mono = false, invalid = false, className, ...props },
  ref,
) {
  return (
    <div className={cn("relative flex items-center", className)}>
      {leading && <span className="pointer-events-none absolute left-2.5 text-fg-subtle">{leading}</span>}
      <input
        ref={ref}
        className={cn(
          inputClass,
          leading && "pl-8",
          trailing && "pr-8",
          mono && "font-mono text-[12.5px]",
          invalid && "border-danger focus:border-danger focus:ring-danger/25",
        )}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        {...props}
      />
      {trailing && <span className="absolute right-2 text-fg-subtle">{trailing}</span>}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { mono = true, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      className={cn(
        inputClass,
        "min-h-24 resize-none py-2 leading-relaxed",
        mono && "font-mono text-[12.5px]",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
    </label>
  );
}
