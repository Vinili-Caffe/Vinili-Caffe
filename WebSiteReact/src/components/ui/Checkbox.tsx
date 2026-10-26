"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Checkbox custom (niente look OS). */
export function Checkbox({
  checked,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-md ring-1 transition",
        checked ? "bg-caramel text-ink ring-caramel" : "bg-crema/5 ring-sand/40 hover:ring-sand/60",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}
