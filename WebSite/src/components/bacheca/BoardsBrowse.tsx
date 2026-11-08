"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Disc3, Info, LogIn, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  SORTS,
  checkStaffAccess,
  kindLabel,
  loadBoardsConfig,
  loadListings,
  type BoardKind,
  type BoardListing,
  type BoardSort,
  type BoardsConfig,
  type ListingsPage,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { SmartLink } from "../SmartLink";
import { ShowMoreButton } from "@/components/ui/ShowMore";
import { VinylCard, VinylCardSkeleton } from "./VinylCard";

const SHELF_INITIAL = 24;
const SHELF_STEP = 24;

type Props = {
  initialKind?: BoardKind | "";
  initialConfig?: BoardsConfig | null;
  initialList?: ListingsPage | null;
};

/** Directory Vetrina: scaffali di bot e server. */
export function BoardsBrowse({ initialKind = "", initialConfig = null, initialList = null }: Props) {
  const { ready, token, login } = useAuth();
  const [cfg, setCfg] = useState(initialConfig);
  const [kind, setKind] = useState<BoardKind | "">(initialKind);
  const [sort, setSort] = useState<BoardSort>("score");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [list, setList] = useState<ListingsPage | null>(initialList);
  const [staff, setStaff] = useState(false);
  const [loading, setLoading] = useState(!initialList);
  const [err, setErr] = useState("");
  const [shelfVisible, setShelfVisible] = useState<Record<string, number>>({});

  useEffect(() => {
    setShelfVisible({});
  }, [kind, q, sort]);

  const pull = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!ready) return;
      const quiet = Boolean(opts?.quiet);
      if (!quiet) {
        setLoading(true);
        setErr("");
      }
      const [c, l] = await Promise.all([
        loadBoardsConfig("", token),
        loadListings({ kind: kind || undefined, q: q || undefined, sort, perPage: 36 }, token),
      ]);
      if (c) setCfg(c);
      if (l) setList(l);
      else if (!quiet) setErr("Non riesco a caricare la vetrina in questo momento.");
      if (token) setStaff(await checkStaffAccess(token));
      else setStaff(false);
      if (!quiet) setLoading(false);
    },
    [ready, token, kind, q, sort],
  );

  useEffect(() => {
    void pull();
  }, [pull]);

  useLiveRefresh(() => pull({ quiet: true }), {
    intervalMs: 90_000,
    enabled: ready,
    boot: false,
    topics: ["boards"],
  });

  const closedGate = cfg && !cfg.publicOpen && !staff;
  const listings = list?.listings ?? [];

  const shelves = useMemo(() => {
    const byCat = new Map<string, BoardListing[]>();
    for (const item of listings) {
      const cats = item.categories.length ? item.categories : ["varie"];
      for (const c of cats.slice(0, 1)) {
        if (!byCat.has(c)) byCat.set(c, []);
        byCat.get(c)!.push(item);
      }
    }
    return [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [listings]);

  const chip =
    "rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200";

  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-28">
      {/* cornice scaffale */}
      <div className="rounded-[1.75rem] bg-gradient-to-b from-crema/[0.04] to-transparent p-px ring-1 ring-sand/12 sm:p-1">
        <div className="rounded-[1.65rem] bg-espresso/40 px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-center gap-2.5">
            {(["", "server", "bot"] as const).map((k) => (
              <button
                key={k || "all"}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  chip,
                  kind === k
                    ? "bg-caramel text-ink shadow-[0_8px_20px_-12px_rgba(212,145,80,0.9)]"
                    : "bg-crema/[0.05] text-crema/60 ring-1 ring-sand/14 hover:text-crema",
                )}
              >
                {k === "" ? "Tutto lo scaffale" : kindLabel(k)}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap gap-2">
              <SmartLink
                href={page("/vetrina/le-mie/")}
                className="inline-flex items-center gap-2 rounded-full bg-crema/[0.06] px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/20"
              >
                Le mie
              </SmartLink>
              <SmartLink
                href={page("/vetrina/invia/")}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink"
              >
                <Plus className="size-4" /> Metti una scheda
              </SmartLink>
            </div>
          </div>

          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draftQ.trim());
            }}
          >
            <label htmlFor="listing-search" className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-crema/40" />
              <input
                id="listing-search"
                name="listing-search"
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                placeholder="Cerca per nome, tag o pezzo di descrizione…"
                className="w-full rounded-2xl bg-roast/80 py-3.5 pl-11 pr-11 text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/40"
              />
              {draftQ && (
                <button
                  type="button"
                  aria-label="Pulisci"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/45 hover:text-crema"
                  onClick={() => {
                    setDraftQ("");
                    setQ("");
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sort === s.id}
                  onClick={() => setSort(s.id)}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-semibold",
                    sort === s.id
                      ? "bg-crema/14 text-crema ring-1 ring-sand/28"
                      : "bg-crema/[0.04] text-crema/48 ring-1 ring-sand/10 hover:text-crema/80",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      {closedGate && (
        <div className="mt-8 flex gap-3 rounded-2xl bg-caramel/10 p-5 ring-1 ring-caramel/25">
          <Info className="mt-0.5 size-5 shrink-0 text-ember" />
          <div className="min-w-0">
            <p className="font-semibold text-crema">Ancora in anteprima</p>
            <p className="mt-1 text-sm text-crema/70">
              {list?.message ||
                cfg?.message ||
                "La vetrina non è aperta a tutti: serve un account staff per vedere lo scaffale."}
            </p>
            {!token && ready && (
              <button
                type="button"
                onClick={login}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink"
              >
                <LogIn className="size-4" /> Accedi con Discord
              </button>
            )}
          </div>
        </div>
      )}

      {err && <p className="mt-6 text-sm text-ember">{err}</p>}

      {loading && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <VinylCardSkeleton key={i} i={i} />
          ))}
        </div>
      )}

      {!loading && !closedGate && listings.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-20 text-center">
          <Disc3 className="mx-auto size-11 text-sand/35" />
          <p className="mt-4 font-display text-3xl text-crema/85">Scaffale vuoto</p>
          <p className="mx-auto mt-2 max-w-md text-crema/50">
            Nessuna scheda con questi filtri. Cambia ricerca, oppure metti la tua in revisione.
          </p>
          <SmartLink
            href={page("/vetrina/invia/")}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <Plus className="size-4" /> Metti una scheda
          </SmartLink>
        </motion.div>
      )}

      {!loading && listings.length > 0 && (
        <div className="mt-12 space-y-14">
          <AnimatePresence mode="popLayout">
            {(shelves.length ? shelves : [["in vetrina", listings] as const]).map(([cat, items]) => {
              const catKey = String(cat);
              const cap = shelfVisible[catKey] ?? SHELF_INITIAL;
              const shown = items.length > SHELF_INITIAL ? items.slice(0, cap) : items;
              const remaining = items.length > SHELF_INITIAL ? Math.max(0, items.length - cap) : 0;
              return (
                <div key={catKey}>
                  <div className="mb-5 flex items-end justify-between gap-3 border-b border-sand/10 pb-3">
                    <div>
                      <p className="font-script text-2xl leading-none text-caramel/75">scaffale</p>
                      <h2 className="mt-1 font-display text-3xl font-semibold capitalize tracking-[-0.02em] sm:text-4xl">
                        {catKey.replace(/-/g, " ")}
                      </h2>
                    </div>
                    <span className="pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-crema/38">
                      {items.length} {items.length === 1 ? "scheda" : "schede"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((item, i) => (
                      <VinylCard
                        key={item.id}
                        listing={item}
                        query={q}
                        i={i}
                        onOpen={() => {
                          window.location.href = page(
                            `/vetrina/scheda/?slug=${encodeURIComponent(item.slug || item.id)}`,
                          );
                        }}
                      />
                    ))}
                  </div>
                  <ShowMoreButton
                    variant="plain"
                    remaining={remaining}
                    onClick={() =>
                      setShelfVisible((prev) => ({
                        ...prev,
                        [catKey]: (prev[catKey] ?? SHELF_INITIAL) + SHELF_STEP,
                      }))
                    }
                  />
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {staff && !cfg?.publicOpen && (
        <p className="mt-12 text-center text-xs text-crema/40">
          Stai vedendo l’anteprima staff — fuori da qui la gente vede solo il messaggio di chiusura.
        </p>
      )}
    </section>
  );
}
