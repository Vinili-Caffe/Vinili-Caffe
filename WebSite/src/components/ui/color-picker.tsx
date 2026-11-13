"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Range } from "./Range";

/**
 * Selettore colore (E8). Swatch + pad HSV + hex.
 * Sostituisce `VcColorPicker` (markup/bind) con un componente controllato.
 */

export type Hsv = { h: number; s: number; v: number };

export function normalizeHex(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (s.charAt(0) !== "#") s = "#" + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
  return s.toLowerCase();
}

export function hexToHsv(hexStr: string): Hsv {
  const h = normalizeHex(hexStr) || "#d4a888";
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return { h: hh, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((Number(h) % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, Number(s) || 0));
  const vv = Math.max(0, Math.min(1, Number(v) || 0));
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to2 = (n: number) =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return ("#" + to2(r) + to2(g) + to2(b)).toLowerCase();
}

export type ColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  defaultHex?: string;
  allowEmpty?: boolean;
  showReset?: boolean;
  showHex?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
};

export function ColorPicker({
  value,
  onChange,
  defaultHex = "#d4a888",
  allowEmpty = false,
  showReset,
  showHex = true,
  ariaLabel = "Seleziona colore",
  placeholder,
  className,
  id,
  name,
  disabled,
}: ColorPickerProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  const fallback = normalizeHex(defaultHex) || "#d4a888";
  const current = normalizeHex(value);
  const face = current || fallback;
  /*
   * Tinta/saturazione/luminosità tenute qui: ricavarle ogni volta dall'hex perde la tinta
   * quando il colore è nero o grigio (stesso hex per ogni tinta), e la barra sembrava bloccata.
   */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(face));
  const [seenFace, setSeenFace] = useState(face);
  if (face !== seenFace) {
    setSeenFace(face);
    if (hsvToHex(hsv.h, hsv.s, hsv.v) !== face) setHsv(hexToHsv(face));
  }
  const pick = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  };
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const canReset = showReset === true || allowEmpty;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!focused.current) setHexDraft(current);
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = swatchRef.current;
      const pop = popRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const w = pop?.offsetWidth ?? 232;
      const h = pop?.offsetHeight ?? 196;
      let left = r.left;
      let top = r.bottom + 8;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
      setPos({ top, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || swatchRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function emit(next: string) {
    const hex = normalizeHex(next);
    if (hex) onChange(hex);
    else if (allowEmpty && next.trim() === "") onChange("");
  }

  function paintPlane(e: React.PointerEvent) {
    const el = planeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    pick({ h: hsv.h, s, v });
  }

  const placeHolder = placeholder || (allowEmpty ? "Predefinito" : fallback);

  return (
    <span data-vc-ui="color-picker" className={cn("inline-flex items-center gap-2", className)}>
      <button
        ref={swatchRef}
        type="button"
        id={`${fieldId}-swatch`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative size-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-sand/30 transition hover:ring-caramel/50 disabled:opacity-50"
        title={ariaLabel}
      >
        <span aria-hidden className="absolute inset-0" style={{ background: face, opacity: current ? 1 : 0.45 }} />
        {!current ? <span aria-hidden className="absolute inset-x-1 top-1/2 h-px -rotate-12 bg-crema/70" /> : null}
      </button>
      {showHex ? (
        <input
          id={fieldId}
          name={name || fieldId}
          disabled={disabled}
          value={hexDraft}
          placeholder={placeHolder}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${ariaLabel}, esadecimale`}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            const n = normalizeHex(hexDraft);
            if (n) {
              setHexDraft(n);
              onChange(n);
            } else if (allowEmpty && hexDraft.trim() === "") {
              setHexDraft("");
              onChange("");
            } else {
              setHexDraft(current);
            }
          }}
          onChange={(e) => {
            setHexDraft(e.target.value);
            emit(e.target.value);
          }}
          className="w-[7.5rem] rounded-xl bg-espresso/60 px-3 py-2 text-sm text-crema ring-1 ring-sand/20 outline-none placeholder:text-crema/35 focus:ring-caramel/50 disabled:opacity-50"
        />
      ) : null}
      {canReset ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(allowEmpty ? "" : fallback)}
          className="inline-flex size-10 items-center justify-center rounded-xl text-crema/70 ring-1 ring-sand/20 transition hover:bg-crema/8 hover:text-crema disabled:opacity-50"
          aria-label="Reimposta colore"
        >
          <RotateCcw className="size-4" />
        </button>
      ) : null}
      {mounted && open
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label={ariaLabel}
              data-vc-ui="color-picker-pop"
              className="fixed z-[115] w-[14.5rem] rounded-2xl bg-roast p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20"
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            >
              <div
                ref={planeRef}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintPlane(e);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  paintPlane(e);
                }}
                className="relative h-28 w-full cursor-crosshair touch-none rounded-xl"
                style={{
                  backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow"
                  style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
                />
              </div>
              <Range
                min={0}
                max={360}
                step={1}
                value={Math.round(hsv.h)}
                aria-label="Tonalità"
                onChange={(n) => {
                  /* colore nero o grigio: muovendo la tinta si passa a un colore pieno, se no non cambierebbe niente */
                  const s = hsv.s < 0.05 ? 1 : hsv.s;
                  const v = hsv.v < 0.05 ? 1 : hsv.v;
                  pick({ h: n, s, v });
                }}
                className="mt-3"
                style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
