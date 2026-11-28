"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Bookmark, Columns2, Disc3, Info, LogIn, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  SORTS,
  checkStaffAccess,
  deleteWatch,
  labelOf,
  loadBoardsConfig,
  loadListings,
  loadTags,
  loadWatch,
  saveBoardSearch,
  type BoardKind,
  type BoardListing,
  type BoardSavedSearch,
  type BoardSort,
  type BoardsConfig,
} from "@/lib/boards";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { showToast } from "@/components/ui";
import { ListingCard, ListingCardSkeleton, Spotlight } from "./ListingCard";
import { VetrinaSearch } from "./VetrinaSearch";
import { VetrinaHeroBg } from "./VetrinaChrome";
import { VetrinaLanding } from "./VetrinaLanding";

const PER_PAGE = 24;
const MAX_COMPARE = 3;

type Filters = { q: string; tag: string; category: string; locale: string; guildTag: string; sort: BoardSort; excludeNsfw: boolean };
const EMPTY: Filters = { q: "", tag: "", category: "", locale: "", guildTag: "", sort: "score", excludeNsfw: false };

function readUrlFilters(): Partial<Filters> {
  try {
    const p = new URLSearchParams(location.search);
    const sort = p.get("sort") as BoardSort | null;
    return {
      q: p.get("q") || "",
      tag: p.get("tag") || "",
      category: p.get("category") || p.get("cat") || "",
      locale: p.get("locale") || "",
      guildTag: p.get("guildTag") || p.get("guildtag") || "",
      excludeNsfw: p.get("excludeNsfw") === "1",
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
    if (f.guildTag) p.set("guildTag", f.guildTag);
    if (f.sort !== "score") p.set("sort", f.sort);
    if (f.excludeNsfw) p.set("excludeNsfw", "1");
    const qs = p.toString();
    history.replaceState(history.state, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
  } catch {
    /* ignore */
  }
}

const HERO: Record<string, { accent: string; text: string }> = {
  "": { accent: "della community", text: "Server e bot Discord presentati da chi li gestisce. Sfoglia le schede, entra in quello che ti incuriosisce e, se ti è piaciuto, lascia un voto o una recensione." },
  server: { accent: "dei server", text: "Community italiane di gaming, musica, chiacchiere e molto altro. Filtra per categoria o lingua e trova quella che fa per te." },
  bot: { accent: "dei bot", text: "Bot per la musica, la moderazione, i giochi e mille piccole utilità, con i voti e le recensioni di chi li usa davvero." },
};

/** Vetrina: /vetrina/ è l'ingresso con le due porte, /vetrina/server/ e /vetrina/bot/ gli elenchi (mai mischiati). */
export function VetrinaHome({ initialKind = "" }: { initialKind?: BoardKind | "" }) {
  if (!initialKind) return <VetrinaLanding />;
  return <KindBrowse kind={initialKind} />;
}

function KindBrowse({ kind }: { kind: BoardKind }) {
  const { ready, token, login } = useAuth();
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [f, setF] = useState<Filters>(EMPTY);
  const [, setDraftQ] = useState("");
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
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState<BoardSavedSearch[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const reqId = useRef(0);

  /* filtri dall'URL (link dai tag delle schede, condivisioni) */
  useEffect(() => {
    const u = readUrlFilters();
    setF((prev) => ({ ...prev, ...u }));
    setDraftQ(u.q || "");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!ready || !token) {
      setSaved([]);
      return;
    }
    let alive = true;
    void loadWatch(token).then((r) => {
      if (alive && r.ok) setSaved(r.data.searches || []);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

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
        {
          kind: kind || undefined,
          q: f.q || undefined,
          tag: f.tag || undefined,
          category: f.category || undefined,
          locale: f.locale || undefined,
          guildTag: f.guildTag || undefined,
          sort: f.sort,
          excludeNsfw: f.excludeNsfw || undefined,
          page: n,
          perPage: PER_PAGE,
        },
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

  const filtered = Boolean(f.q || f.tag || f.category || f.locale || f.guildTag || f.excludeNsfw);
  const spotlight = !filtered && f.sort === "score" ? items.slice(0, 3) : [];
  const grid = spotlight.length === 3 ? items.slice(3) : items;
  const closedGate = !publicOpen && !staff;
  const hero = HERO[kind] || HERO[""];
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) {
        showToast(`Puoi confrontare al massimo ${MAX_COMPARE} schede.`, true);
        return prev;
      }
      return [...prev, id];
    });
  };
  const activeChips: { label: string; clear: () => void }[] = [
    ...(f.q ? [{ label: `“${f.q}”`, clear: () => (set({ q: "" }), setDraftQ("")) }] : []),
    ...(f.category ? [{ label: labelOf(cfg?.categoryLabels, f.category), clear: () => set({ category: "" }) }] : []),
    ...(f.locale ? [{ label: labelOf(cfg?.localeLabels, f.locale), clear: () => set({ locale: "" }) }] : []),
    ...(f.tag ? [{ label: `#${f.tag}`, clear: () => set({ tag: "" }) }] : []),
    ...(f.guildTag ? [{ label: `tag ${f.guildTag}`, clear: () => set({ guildTag: "" }) }] : []),
    ...(f.excludeNsfw ? [{ label: "Senza 18+", clear: () => set({ excludeNsfw: false }) }] : []),
  ];

  return (
    <>
      {/* ─── intestazione ─── */}
      <header className="relative isolate overflow-hidden px-6 pb-16 pt-28 sm:pt-36">
        <VetrinaHeroBg />
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
          {/* ricerca con i filtri (categoria, ordine, lingua, tag) dall'icona a sinistra */}
          <VetrinaSearch
            className="mx-auto mt-8 max-w-2xl"
            kind={kind}
            cfg={cfg}
            tags={tags}
            filters={f}
            onApply={(next) => {
              setF(next);
              setDraftQ(next.q);
            }}
          />
          {(filtered || f.sort !== "score") && token ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  void saveBoardSearch(token, { ...f, kind }, undefined, { notifyNew: true }).then((r) => {
                    if (!r.ok) return showToast(r.message, true);
                    showToast(r.data.message || "Ricerca salvata: ti avvisiamo sulle nuove schede.");
                    void loadWatch(token).then((w) => w.ok && setSaved(w.data.searches || []));
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3.5 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/20 hover:bg-crema/12"
              >
                <Bookmark className="size-3.5" /> Salva e avvisami
              </button>
            </div>
          ) : null}
        </motion.div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6">
        <div className="space-y-4">
          {saved.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-crema/45">Salvate:</span>
              {saved.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-roast px-2 py-1 ring-1 ring-sand/15">
                  <button
                    type="button"
                    onClick={() => {
                      const next: Filters = {
                        q: s.filters.q || "",
                        tag: s.filters.tag || "",
                        category: s.filters.category || "",
                        locale: s.filters.locale || "",
                        guildTag: s.filters.guildTag || "",
                        sort: (SORTS.some((x) => x.id === s.filters.sort) ? s.filters.sort : "score") as BoardSort,
                        excludeNsfw: false,
                      };
                      setF(next);
                      setDraftQ(next.q);
                    }}
                    className="px-1.5 font-semibold text-crema/80 hover:text-ember"
                  >
                    {s.label}
                  </button>
                  <button
                    type="button"
                    aria-label="Elimina ricerca salvata"
                    onClick={() => {
                      if (!token) return;
                      void deleteWatch(token, s.id).then((r) => {
                        if (!r.ok) return showToast(r.message, true);
                        setSaved((prev) => prev.filter((x) => x.id !== s.id));
                        showToast("Ricerca rimossa");
                      });
                    }}
                    className="rounded-full p-0.5 text-crema/35 hover:text-ember"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {grid.map((l, i) => (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      cfg={cfg}
                      query={f.q}
                      i={i % PER_PAGE}
                      selected={compareIds.includes(l.id)}
                      onToggleCompare={toggleCompare}
                    />
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

      </section>

      {compareIds.length > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-full bg-espresso/95 px-3 py-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/25 backdrop-blur-xl">
            <span className="px-2 text-sm font-semibold text-crema/80">
              Confronta {compareIds.length}/{MAX_COMPARE}
            </span>
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => {
                window.location.href = page(`/vetrina/confronta/?ids=${compareIds.map(encodeURIComponent).join(",")}`);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
            >
              <Columns2 className="size-4" /> Confronta
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="rounded-full p-2 text-crema/50 hover:bg-crema/10 hover:text-crema"
              aria-label="Annulla confronto"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
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

