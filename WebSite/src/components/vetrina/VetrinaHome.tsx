"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownUp, Bot, Disc3, Hash, Info, Languages, LayoutGrid, LogIn, Search, Server, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  SORTS,
  checkStaffAccess,
  labelOf,
  loadBoardsConfig,
  loadListings,
  loadTags,
  type BoardKind,
  type BoardListing,
  type BoardSort,
  type BoardsConfig,
} from "@/lib/boards";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { ListingCard, ListingCardSkeleton, Spotlight } from "./ListingCard";
import { OptionPicker } from "./OptionPicker";
import { VetrinaLanding } from "./VetrinaLanding";

const PER_PAGE = 24;

type Filters = { q: string; tag: string; category: string; locale: string; sort: BoardSort };
const EMPTY: Filters = { q: "", tag: "", category: "", locale: "", sort: "score" };

function readUrlFilters(): Partial<Filters> {
  try {
    const p = new URLSearchParams(location.search);
    const sort = p.get("sort") as BoardSort | null;
    return {
      q: p.get("q") || "",
      tag: p.get("tag") || "",
      category: p.get("category") || p.get("cat") || "",
      locale: p.get("locale") || "",
      ...(sort && SORTS.some((s) => s.id === sort) ? { sort } : {}),
    };
  } catch {
    return {};
  }
}

function writeUrlFilters(f: Filters) {
  try {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.tag) p.set("tag", f.tag);
    if (f.category) p.set("category", f.category);
    if (f.locale) p.set("locale", f.locale);
    if (f.sort !== "score") p.set("sort", f.sort);
    const qs = p.toString();
    history.replaceState(history.state, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
  } catch {
    /* ignore */
  }
}

const HERO: Record<string, { accent: string; text: string }> = {
  "": { accent: "della community", text: "Server e bot Discord si mettono in mostra: sfoglia, scegli, entra. E se ti è piaciuto, lascia un voto e una recensione." },
  server: { accent: "dei server", text: "Community italiane da scoprire: gaming, musica, chiacchiere e molto altro. Trova casa tra i server in vetrina." },
  bot: { accent: "dei bot", text: "Musica, moderazione, giochi, utilità: i bot che rendono vivo un server, provati e recensiti dalla community." },
};

/** Vetrina: /vetrina/ è l'ingresso con le due porte, /vetrina/server/ e /vetrina/bot/ gli elenchi (mai mischiati). */
export function VetrinaHome({ initialKind = "" }: { initialKind?: BoardKind | "" }) {
  if (!initialKind) return <VetrinaLanding />;
  return <KindBrowse kind={initialKind} />;
}

function KindBrowse({ kind }: { kind: BoardKind }) {
  const { ready, token, login } = useAuth();
  const reduce = useReducedMotionSafe();
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [f, setF] = useState<Filters>(EMPTY);
  const [draftQ, setDraftQ] = useState("");
  const [items, setItems] = useState<BoardListing[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [closedMsg, setClosedMsg] = useState("");
  const [publicOpen, setPublicOpen] = useState(true);
  const [staff, setStaff] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const reqId = useRef(0);

  /* filtri dall'URL (link dai tag delle schede, condivisioni) */
  useEffect(() => {
    const u = readUrlFilters();
    setF((prev) => ({ ...prev, ...u }));
    setDraftQ(u.q || "");
    if (u.tag || u.locale) setShowMore(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeUrlFilters(f);
  }, [f, hydrated]);

  const fetchPage = useCallback(
    async (n: number, opts?: { quiet?: boolean }) => {
      if (!ready || !hydrated) return;
      const id = ++reqId.current;
      if (n === 1 && !opts?.quiet) {
        setLoading(true);
        setErr("");
      }
      if (n > 1) setMore(true);
      const l = await loadListings(
        { kind: kind || undefined, q: f.q || undefined, tag: f.tag || undefined, category: f.category || undefined, locale: f.locale || undefined, sort: f.sort, page: n, perPage: PER_PAGE },
        token,
      );
      if (id !== reqId.current) return;
      if (!l) {
        if (!opts?.quiet) setErr("Non riesco a caricare la vetrina. Riprova tra poco.");
      } else {
        setTotal(l.total);
        setPublicOpen(l.publicOpen);
        setClosedMsg(l.message || "");
        setItems((prev) => (n === 1 ? l.listings : [...prev, ...l.listings.filter((x) => !prev.some((p) => p.id === x.id))]));
        setPageNum(n);
      }
      setLoading(false);
      setMore(false);
    },
    [ready, hydrated, token, kind, f],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  useEffect(() => {
    if (!ready) return;
    void loadBoardsConfig("", token).then((c) => c && setCfg(c));
    void loadTags(token).then(setTags);
    if (token) void checkStaffAccess(token).then(setStaff);
    else setStaff(false);
  }, [ready, token]);

  useLiveRefresh(() => fetchPage(1, { quiet: true }), { intervalMs: 120_000, enabled: ready && pageNum === 1, boot: false, topics: ["boards"] });

  const filtered = Boolean(f.q || f.tag || f.category || f.locale);
  const spotlight = !filtered && f.sort === "score" ? items.slice(0, 3) : [];
  const grid = spotlight.length === 3 ? items.slice(3) : items;
  const closedGate = !publicOpen && !staff;
  const hero = HERO[kind] || HERO[""];
  const ribbon = useMemo(() => items.filter((x) => x.iconUrl).slice(0, 16), [items]);
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const activeChips: { label: string; clear: () => void }[] = [
    ...(f.q ? [{ label: `“${f.q}”`, clear: () => (set({ q: "" }), setDraftQ("")) }] : []),
    ...(f.category ? [{ label: labelOf(cfg?.categoryLabels, f.category), clear: () => set({ category: "" }) }] : []),
    ...(f.locale ? [{ label: labelOf(cfg?.localeLabels, f.locale), clear: () => set({ locale: "" }) }] : []),
    ...(f.tag ? [{ label: `#${f.tag}`, clear: () => set({ tag: "" }) }] : []),
  ];

  return (
    <>
      {/* ─── intestazione ─── */}
      <header className="relative overflow-hidden px-6 pb-12 pt-12 sm:pt-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_65%_at_50%_0%,rgba(217,154,91,0.26),transparent_70%),radial-gradient(40%_50%_at_90%_30%,rgba(240,180,110,0.08),transparent_70%)]" />
        {/* nastro di icone che scorre dietro al titolo */}
        {ribbon.length >= 6 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 opacity-[0.16] [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
            <motion.div
              className="flex w-max gap-6"
              animate={reduce ? undefined : { x: ["0%", "-50%"] }}
              transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
            >
              {[...ribbon, ...ribbon].map((l, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${l.id}-${i}`} src={l.iconUrl} alt="" className="size-24 rounded-[1.6rem] object-cover grayscale" />
              ))}
            </motion.div>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-4xl text-center"
        >
          <p className="inline-flex items-center gap-2 rounded-full bg-crema/6 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-caramel ring-1 ring-sand/15">
            <Disc3 className="size-4" /> Vetrina
          </p>
          <h1 className="mt-5 font-display text-6xl font-semibold leading-[0.98] sm:text-7xl md:text-8xl">
            La vetrina <em className="block font-script text-[1.05em] font-normal not-italic text-ember sm:inline">{hero.accent}</em>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-crema/60">{hero.text}</p>

          <form
            className="mx-auto mt-8 max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: draftQ.trim() });
            }}
          >
            <label htmlFor="vetrina-search" className="group relative block">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-crema/40 transition-colors group-focus-within:text-ember" />
              <input
                id="vetrina-search"
                name="vetrina-search"
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                placeholder={kind === "bot" ? "Cerca un bot per nome, funzione o tag…" : kind === "server" ? "Cerca un server per nome, tema o tag…" : "Cerca server e bot per nome, tema o tag…"}
                className="w-full rounded-full bg-roast/90 py-4 pl-14 pr-32 text-lg text-crema shadow-[0_24px_60px_-30px_rgba(217,154,91,0.6)] outline-none ring-1 ring-sand/20 backdrop-blur placeholder:text-crema/35 focus:ring-2 focus:ring-ember/50"
              />
              {draftQ && (
                <button
                  type="button"
                  aria-label="Pulisci la ricerca"
                  className="absolute right-[6.5rem] top-1/2 -translate-y-1/2 rounded-full p-1.5 text-crema/45 hover:text-crema"
                  onClick={() => {
                    setDraftQ("");
                    set({ q: "" });
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-bold text-ink">
                Cerca
              </button>
            </label>
          </form>

          {!loading && !closedGate && (
            <p className="mt-5 text-sm text-crema/45">
              <span className="font-semibold text-crema/75">{total.toLocaleString("it-IT")}</span>{" "}
              {kind === "bot" ? "bot" : kind === "server" ? "server" : "schede"} in vetrina
              {f.sort === "score" ? " · ordinate per posizione in vetrina" : ""}
            </p>
          )}
        </motion.div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6">
        {/* ─── filtri ─── */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {cfg?.categories?.length ? (
              <OptionPicker
                align="right"
                className="w-full sm:w-56"
                icon={<LayoutGrid />}
                placeholder="Tutte le categorie"
                allLabel="Tutte le categorie"
                searchPlaceholder="Cerca tra le categorie…"
                options={cfg.categories.map((c) => ({ value: c, label: labelOf(cfg.categoryLabels, c) }))}
                value={f.category ? [f.category] : []}
                onChange={(v) => set({ category: v[0] || "" })}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <OptionPicker
                neutral
                align="right"
                className="w-48"
                icon={<ArrowDownUp />}
                placeholder="Ordina"
                searchPlaceholder="Ordina per…"
                options={SORTS.map((o) => ({ value: o.id, label: o.label }))}
                value={[f.sort]}
                onChange={(v) => set({ sort: (v[0] as BoardSort) || "score" })}
              />
              <button
                type="button"
                aria-expanded={showMore}
                onClick={() => setShowMore((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ring-1 transition-colors",
                  showMore || f.tag || f.locale ? "bg-crema/10 text-crema ring-sand/30" : "bg-espresso/60 text-crema/60 ring-sand/15 hover:text-crema",
                )}
              >
                <SlidersHorizontal className="size-4" /> Lingua e tag
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showMore && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid gap-5 rounded-3xl bg-roast/70 p-5 ring-1 ring-sand/12 md:grid-cols-[16rem_1fr]">
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
                      <Languages className="size-3.5" /> Lingua
                    </p>
                    <OptionPicker
                      icon={<Languages />}
                      placeholder="Tutte le lingue"
                      allLabel="Tutte le lingue"
                      searchPlaceholder="Cerca una lingua…"
                      options={(cfg?.locales || []).map((l) => ({ value: l, label: labelOf(cfg?.localeLabels, l) }))}
                      value={f.locale ? [f.locale] : []}
                      onChange={(v) => set({ locale: v[0] || "" })}
                    />
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
                      <Hash className="size-3.5" /> Tag popolari
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(tags.length ? tags : cfg?.suggestedTags || []).slice(0, 28).map((t) => (
                        <SmallChip key={t} active={f.tag === t} onClick={() => set({ tag: f.tag === t ? "" : t })}>
                          #{t}
                        </SmallChip>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-crema/45">Filtri:</span>
              {activeChips.map((c) => (
                <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-3 py-1 font-semibold text-ember ring-1 ring-ember/30 hover:bg-ember/25">
                  {c.label} <X className="size-3.5" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setF((prev) => ({ ...EMPTY, sort: prev.sort }));
                  setDraftQ("");
                }}
                className="text-crema/45 underline-offset-4 hover:text-crema hover:underline"
              >
                Azzera tutto
              </button>
            </div>
          )}
        </div>

        {closedGate && (
          <div className="mt-10 flex gap-4 rounded-3xl bg-caramel/10 p-6 ring-1 ring-caramel/25">
            <Info className="mt-0.5 size-6 shrink-0 text-ember" />
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold text-crema">La vetrina sta allestendo gli scaffali</p>
              <p className="mt-1 text-crema/70">{closedMsg || cfg?.message || "Per ora è visibile solo allo staff. Torna a trovarci presto!"}</p>
              {!token && ready && (
                <button type="button" onClick={login} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink">
                  <LogIn className="size-4" /> Accedi con Discord
                </button>
              )}
            </div>
          </div>
        )}

        {err && <p className="mt-8 text-center text-ember">{err}</p>}

        {loading ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} i={i} />
            ))}
          </div>
        ) : !closedGate && items.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-20 text-center">
            <Disc3 className="mx-auto size-14 text-sand/35" />
            <p className="mt-4 font-display text-4xl text-crema/85">Vetrina vuota, per ora</p>
            <p className="mx-auto mt-2 max-w-md text-crema/50">Nessuna scheda corrisponde a questi filtri. Prova un’altra ricerca, oppure metti in vetrina la tua.</p>
          </motion.div>
        ) : (
          <>
            {spotlight.length === 3 && (
              <div className="mt-10">
                <SectionLabel kicker="In primo piano" title="Il podio della vetrina" />
                <Spotlight items={spotlight} cfg={cfg} />
              </div>
            )}
            {grid.length > 0 && (
              <div className="mt-14">
                {spotlight.length === 3 && <SectionLabel kicker="Sugli scaffali" title={kind === "bot" ? "Tutti i bot" : kind === "server" ? "Tutti i server" : "Tutte le schede"} />}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {grid.map((l, i) => (
                    <ListingCard key={l.id} listing={l} cfg={cfg} query={f.q} i={i % PER_PAGE} />
                  ))}
                </div>
              </div>
            )}
            {items.length < total && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  disabled={more}
                  onClick={() => void fetchPage(pageNum + 1)}
                  className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-6 py-3 font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/12 disabled:opacity-60"
                >
                  <Disc3 className={cn("size-4", more && "animate-spin")} />
                  {more ? "Carico…" : `Mostra altre (${(total - items.length).toLocaleString("it-IT")})`}
                </button>
              </div>
            )}
          </>
        )}

        {staff && !publicOpen && <p className="mt-12 text-center text-xs text-crema/40">Anteprima staff: il pubblico vede il messaggio di chiusura.</p>}
      </section>
    </>
  );
}

function SectionLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="font-script text-2xl text-caramel/85">{kicker}</p>
      <h2 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
    </div>
  );
}

function SmallChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        active ? "bg-ember/20 text-ember ring-1 ring-ember/40" : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
      )}
    >
      {children}
    </button>
  );
}
