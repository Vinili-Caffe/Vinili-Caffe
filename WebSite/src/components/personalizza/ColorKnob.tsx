"use client";

import { useId } from "react";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { normalizeHex } from "@/lib/personalizza";

/** Manopola colore del mixer: etichetta + selettore colore del sito (niente picker del sistema). */
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
  const hex = normalizeHex(value);
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-espresso/50 px-3 py-2.5 ring-1 ring-sand/12", disabled && "opacity-50")}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-crema">{label}</span>
        {subtitle && <span className="block truncate text-xs text-crema/45">{subtitle}</span>}
      </span>
      <ColorPicker
        id={`${base}-hex`}
        name={name ? `${name}Hex` : `${base}-hex`}
        value={hex}
        defaultHex={hex}
        disabled={disabled}
        ariaLabel={label}
        onChange={(next) => onChange(normalizeHex(next, hex))}
        className="shrink-0"
      />
    </div>
  );
}
