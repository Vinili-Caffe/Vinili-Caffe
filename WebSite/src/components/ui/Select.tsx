"use client";

import { EmojiText } from "@/components/discord/EmojiText";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Base = {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  size?: "md" | "sm" | "pill";
  "aria-label"?: string;
  id?: string;
};

const sizeTrigger = {
  md: "rounded-xl px-3 py-2 text-sm",
  sm: "rounded-lg px-2 py-1 text-xs",
  pill: "rounded-full px-3 py-1.5 text-sm",
} as const;

type MenuPos = { top: number; left: number; width: number; maxH: number; place: "below" | "above" };

function useMenuPos(open: boolean, trigger: React.RefObject<HTMLElement | null>, minW: number): MenuPos {
  const [pos, setPos] = useState<MenuPos>({ top: 0, left: 0, width: minW, maxH: 240, place: "below" });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 6;
      const spaceBelow = window.innerHeight - r.bottom - gap - 8;
      const spaceAbove = r.top - gap - 8;
      const place: "below" | "above" = spaceBelow < 140 && spaceAbove > spaceBelow ? "above" : "below";
      const maxH = Math.min(280, Math.max(120, place === "below" ? spaceBelow : spaceAbove));
      const width = Math.max(r.width, minW);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
      if (left < 8) left = 8;
      setPos({
        top: place === "below" ? r.bottom + gap : r.top - gap,
        left,
        width,
        maxH,
        place,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, trigger, minW]);

  return pos;
}

function useSelectOpen(disabled?: boolean) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const uid = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || disabled) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, disabled]);

  return { open, setOpen, box, trigger, menu, uid, mounted };
}

function MenuList({
  listId,
  ariaLabel,
  options,
  value,
  multi,
  selectedSet,
  onPick,
  pos,
  menuRef,
  menuClassName,
}: {
  listId: string;
  ariaLabel?: string;
  options: SelectOption[];
  value?: string;
  multi?: boolean;
  selectedSet?: Set<string>;
  onPick: (o: SelectOption) => void;
  pos: MenuPos;
  menuRef: React.RefObject<HTMLUListElement | null>;
  menuClassName?: string;
}) {
  return (
    <motion.ul
      ref={menuRef}
      id={listId}
      role="listbox"
      aria-label={ariaLabel}
      aria-multiselectable={multi || undefined}
      initial={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
      transition={{ duration: 0.14 }}
      style={{
        position: "fixed",
        top: pos.place === "below" ? pos.top : undefined,
        bottom: pos.place === "above" ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
      }}
      className={cn(
        "z-[120] overflow-y-auto rounded-2xl bg-roast/97 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl",
        menuClassName,
      )}
    >
      {options.map((o) => {
        const on = multi ? selectedSet?.has(o.value) : o.value === value;
        return (
          <li key={o.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={!!on}
              disabled={o.disabled}
              onClick={() => {
                if (o.disabled) return;
                onPick(o);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm leading-snug transition",
                o.disabled && "cursor-not-allowed opacity-40",
                on
                  ? multi
                    ? "bg-caramel/15 font-semibold text-crema"
                    : "bg-caramel/20 font-semibold text-ember ring-1 ring-caramel/30"
                  : "text-crema/85 hover:bg-crema/8 hover:text-crema",
              )}
            >
              {multi ? (
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-md ring-1",
                    on ? "bg-caramel text-ink ring-caramel" : "ring-sand/35",
                  )}
                  aria-hidden
                >
                  {on ? <Check className="size-3" /> : null}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate"><EmojiText text={o.label} /></span>
              {!multi && on ? <Check className="size-3.5 shrink-0 text-caramel" aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </motion.ul>
  );
}

/** Select custom in portal (niente clip da overflow parent). */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleziona…",
  disabled,
  className,
  menuClassName,
  size = "md",
  "aria-label": ariaLabel,
  id,
}: Base & {
  value: string;
  onChange: (value: string) => void;
}) {
  const { open, setOpen, box, trigger, menu, uid, mounted } = useSelectOpen(disabled);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const listId = `${uid}-list`;
  const minW = size === "pill" ? 176 : 0;
  const pos = useMenuPos(open, trigger, minW);

  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 bg-crema/6 font-semibold text-crema outline-none ring-1 ring-sand/15 transition",
          "hover:bg-crema/10 focus-visible:ring-caramel/50 disabled:cursor-not-allowed disabled:opacity-50",
          sizeTrigger[size],
          className,
        )}
      >
        <span className={cn("min-w-0 truncate text-left", !selected && "font-medium text-crema/45")}>
          {selected ? <EmojiText text={selected.label} /> : placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <MenuList
                key={listId}
                listId={listId}
                ariaLabel={ariaLabel}
                options={options}
                value={value}
                onPick={(o) => {
                  onChange(o.value);
                  setOpen(false);
                }}
                pos={pos}
                menuRef={menu}
                menuClassName={menuClassName}
              />
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** Multi-select custom (portal). */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Seleziona…",
  disabled,
  className,
  menuClassName,
  size = "md",
  "aria-label": ariaLabel,
  id,
}: Base & {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { open, setOpen, box, trigger, menu, uid, mounted } = useSelectOpen(disabled);
  const selected = useMemo(() => options.filter((o) => value.includes(o.value)), [options, value]);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const label =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.map((s) => s.label).join(", ")
        : `${selected.length} selezionati`;
  const listId = `${uid}-list`;
  const pos = useMenuPos(open, trigger, 0);

  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 bg-crema/6 font-semibold text-crema outline-none ring-1 ring-sand/15 transition",
          "hover:bg-crema/10 focus-visible:ring-caramel/50 disabled:cursor-not-allowed disabled:opacity-50",
          sizeTrigger[size],
          className,
        )}
      >
        <span className={cn("min-w-0 truncate text-left", !selected.length && "font-medium text-crema/45")}><EmojiText text={label} /></span>
        <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <MenuList
                key={listId}
                listId={listId}
                ariaLabel={ariaLabel}
                options={options}
                multi
                selectedSet={selectedSet}
                onPick={(o) => {
                  const on = selectedSet.has(o.value);
                  onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
                }}
                pos={pos}
                menuRef={menu}
                menuClassName={menuClassName}
              />
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
