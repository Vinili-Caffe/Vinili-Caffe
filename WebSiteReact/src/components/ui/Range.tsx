"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Slider custom (niente thumb OS grezzo). */
export function Range({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  style,
  "aria-label": ariaLabel,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  id?: string;
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...style, ["--vc-range" as string]: `${pct}%` }}
      className={cn(
        "vc-range h-2 w-full cursor-pointer appearance-none rounded-full bg-crema/10 outline-none disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    />
  );
}
