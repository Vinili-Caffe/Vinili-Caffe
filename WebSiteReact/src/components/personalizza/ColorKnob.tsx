"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { normalizeHex } from "@/lib/personalizza";

/** Manopola colore del mixer: chip + input HEX + native picker. */
export function ColorKnob({
  label,
  subtitle,
  value,
  onChange,
  disabled,
  id,
  name,
}: {
  label: string;
  subtitle?: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
}) {
  const autoId = useId();
  const base = id || name || autoId;
  const colorId = `${base}-color`;
  const hexId = `${base}-hex`;
  const hex = normalizeHex(value);
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-espresso/50 px-3 py-2.5 ring-1 ring-sand/12",
        disabled && "opacity-50",
      )}
    >
      <span
        className="relative size-10 shrink-0 overflow-hidden rounded-full ring-2 ring-sand/25"
        style={{ background: hex }}
        aria-hidden
      >
        <input
          id={colorId}
          name={name ? `${name}Color` : colorId}
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={label}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-crema">{label}</span>
        {subtitle && <span className="block truncate text-xs text-crema/45">{subtitle}</span>}
      </span>
      <input
        id={hexId}
        name={name ? `${name}Hex` : hexId}
        type="text"
        value={hex}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (/^#?[0-9a-fA-F]{0,6}$/.test(raw)) onChange(raw.startsWith("#") ? raw : `#${raw}`);
        }}
        onBlur={(e) => onChange(normalizeHex(e.target.value, hex))}
        className="w-[5.5rem] rounded-lg bg-crema/5 px-2 py-1.5 font-mono text-xs uppercase text-crema outline-none ring-1 ring-sand/20 focus:ring-caramel/60 disabled:cursor-not-allowed"
        aria-label={`${label} HEX`}
      />
    </label>
  );
}
