"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownUp, Hash, Languages, LayoutGrid, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { SORTS, labelOf, type BoardKind, type BoardSort, type BoardsConfig, categoriesFor } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { OptionPicker } from "./OptionPicker";

export type SearchFilters = { q: string; tag: string; category: string; locale: string; guildTag: string; sort: BoardSort; excludeNsfw: boolean };
export const EMPTY_FILTERS: SearchFilters = { q: "", tag: "", category: "", locale: "", guildTag: "", sort: "score", excludeNsfw: false };

/** Indirizzo dell'elenco con i filtri (per la ricerca dalla scheda). */
export function listHref(kind: BoardKind, f: Partial<SearchFilters>) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.locale) p.set("locale", f.locale);
  if (f.tag) p.set("tag", f.tag);
  if (f.guildTag) p.set("guildTag", f.guildTag);
  if (f.sort && f.sort !== "score") p.set("sort", f.sort);
  if (f.excludeNsfw) p.set("excludeNsfw", "1");
  const qs = p.toString();
  return page(`/vetrina/${kind}/${qs ? `?${qs}` : ""}`);
}

/**
 * Barra di ricerca della vetrina con l'icona dei filtri a sinistra:
 * categoria, ordinamento, lingua e tag si aprono da lì.
 * `deferred`: i filtri si applicano solo con Cerca/Applica (es. dalla scheda, che porta all'elenco).
 */
export function VetrinaSearch({
  kind,
  cfg,
  tags = [],
  filters,
  onApply,
  deferred = false,
  className,
}: {
  kind: BoardKind;
  cfg: BoardsConfig | null;
  tags?: string[];
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
  deferred?: boolean;
  className?: string;
}) {
  const [local, setLocal] = useState(filters);
  useEffect(() => setLocal(filters), [filters]);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  /* filtri: subito sull'elenco, oppure tenuti da parte finché non si conferma */
  const setF = (patch: Partial<SearchFilters>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    if (!deferred) onApply(next);
  };
  const active = [local.category, local.locale, local.tag, local.guildTag, local.sort !== "score" ? local.sort : "", local.excludeNsfw ? "nsfw" : ""].filter(Boolean).length;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = form.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth;
      const width = Math.min(Math.max(b.width, 320), 560, vw - 24);
      const left = Math.max(12, Math.min(b.left, vw - width - 12));
      setPos({ position: "fixed", top: b.bottom + 10, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panel.current?.contains(t) || btn.current?.contains(t) || t.closest?.("[data-vc-picker-panel]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const popular = (tags.length ? tags : cfg?.suggestedTags || []).slice(0, 24);

  return (
    <form
      ref={form}
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        onApply({ ...local, q: local.q.trim() });
      }}
    >
      <label htmlFor={`vetrina-search-${kind}`} className="group relative block">
        <button
          ref={btn}
          type="button"
          aria-label="Filtri"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
            open || active ? "bg-ember/20 text-ember" : "text-crema/55 hover:bg-crema/8 hover:text-crema",
          )}
        >
          <SlidersHorizontal className="size-5" />
          {active > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-ember text-[0.65rem] font-semibold text-ink">{active}</span>}
        </button>
        <span className="pointer-events-none absolute left-[3.6rem] top-1/2 h-6 w-px -translate-y-1/2 bg-sand/20" aria-hidden />
        <input
          id={`vetrina-search-${kind}`}
          name="q"
          value={local.q}
          onChange={(e) => setLocal((prev) => ({ ...prev, q: e.target.value }))}
          placeholder={kind === "bot" ? "Cerca un bot per nome, funzione o tag…" : "Cerca un server per nome, tema o tag…"}
          className="w-full rounded-full bg-roast/90 py-4 pl-[4.5rem] pr-32 text-lg text-crema shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] outline-none ring-1 ring-sand/20 backdrop-blur placeholder:text-crema/35 focus:ring-2 focus:ring-ember/50"
        />
        {local.q && (
          <button
            type="button"
            aria-label="Pulisci la ricerca"
            className="absolute right-[6.5rem] top-1/2 -translate-y-1/2 rounded-full p-1.5 text-crema/45 hover:text-crema"
            onClick={() => {
              const next = { ...local, q: "" };
              setLocal(next);
              if (!deferred) onApply(next);
            }}
          >
            <X className="size-4" />
          </button>
        )}
        <button type="submit" className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink">
          <Search className="size-4" /> Cerca
        </button>
      </label>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panel}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                style={pos}
                className="z-[70] rounded-3xl bg-roast/95 p-5 text-left shadow-[0_30px_80px_-25px_rgba(0,0,0,0.95)] ring-1 ring-sand/20 backdrop-blur-xl"
                data-lenis-prevent
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-display text-xl font-semibold text-crema">Filtri</p>
                  {active > 0 && (
                    <button type="button" onClick={() => setF({ category: "", locale: "", tag: "", guildTag: "", sort: "score", excludeNsfw: false })} className="text-sm text-crema/50 hover:text-crema">
                      Azzera
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FilterBlock icon={<LayoutGrid />} label="Categoria">
                    <OptionPicker
                      placeholder="Tutte le categorie"
                      allLabel="Tutte le categorie"
                      searchPlaceholder="Cerca tra le categorie…"
                      options={categoriesFor(cfg, kind).map((c) => ({ value: c, label: labelOf(cfg?.categoryLabels, c) }))}
                      value={local.category ? [local.category] : []}
                      onChange={(v) => setF({ category: v[0] || "" })}
                    />
                  </FilterBlock>
                  <FilterBlock icon={<ArrowDownUp />} label="Ordina">
                    <OptionPicker
                      neutral
                      placeholder="Ordina"
                      searchPlaceholder="Ordina per…"
                      options={SORTS.map((o) => ({ value: o.id, label: o.label }))}
                      value={[local.sort]}
                      onChange={(v) => setF({ sort: (v[0] as BoardSort) || "score" })}
                    />
                  </FilterBlock>
                  <FilterBlock icon={<Languages />} label="Lingua">
                    <OptionPicker
                      placeholder="Tutte le lingue"
                      allLabel="Tutte le lingue"
                      searchPlaceholder="Cerca una lingua…"
                      options={(cfg?.locales || []).map((l) => ({ value: l, label: labelOf(cfg?.localeLabels, l) }))}
                      value={local.locale ? [local.locale] : []}
                      onChange={(v) => setF({ locale: v[0] || "" })}
                    />
                  </FilterBlock>
                  {kind === "server" ? (
                    <FilterBlock icon={<Tag />} label="Guild tag">
                      <input
                        value={local.guildTag}
                        maxLength={8}
                        placeholder="es. VINYL"
                        onChange={(e) => setF({ guildTag: e.target.value.trim().slice(0, 8) })}
                        className="w-full rounded-xl bg-espresso/70 px-3 py-2.5 text-sm text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-ember/40"
                      />
                    </FilterBlock>
                  ) : null}
                  <FilterBlock icon={<Tag />} label="Contenuti" className="sm:col-span-2">
                    <button
                      type="button"
                      aria-pressed={local.excludeNsfw}
                      onClick={() => setF({ excludeNsfw: !local.excludeNsfw })}
                      className={cn(
                        "w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ring-1",
                        local.excludeNsfw ? "bg-ember/15 text-ember ring-ember/40" : "bg-espresso/70 text-crema/70 ring-sand/15 hover:text-crema",
                      )}
                    >
                      Nascondi 18+
                    </button>
                  </FilterBlock>
                </div>
                {popular.length > 0 && (
                  <FilterBlock icon={<Hash />} label="Tag popolari" className="mt-4">
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {popular.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={local.tag === t}
                          onClick={() => setF({ tag: local.tag === t ? "" : t })}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                            local.tag === t ? "bg-ember/20 text-ember ring-1 ring-ember/40" : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
                          )}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  </FilterBlock>
                )}
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (deferred) onApply({ ...local, q: local.q.trim() });
                    }}
                    className="rounded-full bg-crema px-5 py-2 text-sm font-semibold text-ink"
                  >
                    {deferred ? "Applica e cerca" : "Fatto"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </form>
  );
}

function FilterBlock({ icon, label, className, children }: { icon: React.ReactNode; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-crema/45 [&>svg]:size-3.5">
        {icon} {label}
      </p>
      {children}
    </div>
  );
}
