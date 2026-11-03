"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

function scrollToTarget(scrollToId?: string) {
  if (typeof window === "undefined") return;
  const run = () => {
    if (scrollToId) {
      const el = document.getElementById(scrollToId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // aspetta il re-render della lista, poi allinea sotto la navbar
  requestAnimationFrame(() => requestAnimationFrame(run));
}

export function Pagination({
  page,
  totalPages,
  onChange,
  scrollToId,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  /** Elemento a cui scrollare al cambio pagina (es. lista). Usa scroll-mt-* per lo offset navbar. */
  scrollToId?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const p = Math.min(Math.max(1, page), totalPages);
  const windowed = (() => {
    const out: number[] = [];
    const start = Math.max(1, p - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = Math.max(1, end - 4); i <= end; i++) out.push(i);
    return out;
  })();

  const go = (n: number) => {
    const next = Math.min(Math.max(1, n), totalPages);
    if (next === p) {
      scrollToTarget(scrollToId);
      return;
    }
    onChange(next);
    scrollToTarget(scrollToId);
  };

  return (
    <nav aria-label="Paginazione" className={cn("mt-8 flex items-center justify-center gap-1.5", className)}>
      <button
        type="button"
        disabled={p <= 1}
        onClick={() => go(p - 1)}
        aria-label="Pagina precedente"
        className="inline-flex size-10 items-center justify-center rounded-full bg-crema/6 text-crema ring-1 ring-sand/15 transition-[transform,background-color] duration-200 ease-out hover:bg-crema/10 active:scale-[0.96] disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      {windowed[0]! > 1 && (
        <>
          <PageBtn n={1} active={p === 1} onClick={() => go(1)} />
          {windowed[0]! > 2 && <EllipsisJump totalPages={totalPages} onGo={go} />}
        </>
      )}
      {windowed.map((n) => (
        <PageBtn key={n} n={n} active={p === n} onClick={() => go(n)} />
      ))}
      {windowed[windowed.length - 1]! < totalPages && (
        <>
          {windowed[windowed.length - 1]! < totalPages - 1 && <EllipsisJump totalPages={totalPages} onGo={go} />}
          <PageBtn n={totalPages} active={p === totalPages} onClick={() => go(totalPages)} />
        </>
      )}
      <button
        type="button"
        disabled={p >= totalPages}
        onClick={() => go(p + 1)}
        aria-label="Pagina successiva"
        className="inline-flex size-10 items-center justify-center rounded-full bg-crema/6 text-crema ring-1 ring-sand/15 transition-[transform,background-color] duration-200 ease-out hover:bg-crema/10 active:scale-[0.96] disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

function PageBtn({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full text-sm font-semibold lining-nums ring-1 transition-[transform,background-color,color,box-shadow] duration-200 ease-out active:scale-[0.96]",
        active ? "bg-caramel text-ink ring-caramel" : "bg-crema/6 text-crema/70 ring-sand/15 hover:bg-crema/10 hover:text-crema",
      )}
    >
      {n}
    </button>
  );
}

/** I tre puntini: click → input per andare a una pagina precisa. */
function EllipsisJump({ totalPages, onGo }: { totalPages: number; onGo: (p: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Vai a una pagina precisa"
        title="Vai a pagina…"
        className="inline-flex size-10 items-center justify-center rounded-full bg-crema/6 text-crema/45 ring-1 ring-sand/15 transition-[transform,background-color,color] duration-200 ease-out hover:bg-crema/10 hover:text-crema active:scale-[0.96]"
      >
        …
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number.parseInt(val, 10);
        if (Number.isFinite(n) && n >= 1 && n <= totalPages) onGo(n);
        setOpen(false);
        setVal("");
      }}
      className="relative"
    >
      <label htmlFor={uid} className="sr-only">
        Numero pagina (1–{totalPages})
      </label>
      <input
        ref={inputRef}
        id={uid}
        name="page"
        inputMode="numeric"
        pattern="[0-9]*"
        value={val}
        placeholder="#"
        aria-label={`Pagina da 1 a ${totalPages}`}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onBlur={() => {
          // piccolo delay: click sul submit non perde il focus prima
          window.setTimeout(() => {
            setOpen(false);
            setVal("");
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setVal("");
          }
        }}
        className="size-10 rounded-full bg-crema/10 text-center text-sm font-semibold tabular-nums text-crema outline-none ring-2 ring-caramel/70 placeholder:text-crema/35"
      />
    </form>
  );
}

export function pageSlice<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * pageSize;
  return { page: p, totalPages, slice: items.slice(start, start + pageSize) };
}
