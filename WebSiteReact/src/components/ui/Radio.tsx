"use client";

import { cn } from "@/lib/cn";

/** Radio custom (niente look OS). */
export function Radio({
  checked,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
  name,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  name?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-name={name}
      disabled={disabled}
      onClick={() => !disabled && onChange()}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full ring-1 transition",
        checked ? "bg-caramel/25 ring-caramel" : "bg-crema/5 ring-sand/40 hover:ring-sand/60",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full transition", checked ? "bg-caramel" : "bg-transparent")} aria-hidden />
    </button>
  );
}
