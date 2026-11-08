"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info, LogIn, Plus, Search, X } from "lucide-react";
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

/** Directory Vetrina — scaffali illuminati. La logica resta quella di sempre. */
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
      else if (!quiet) setErr("La vetrina non risponde. Riprova tra un attimo.");
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

  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-32 sm:px-10">
      {/* barra controllo — etichette da museo, non chip pastello */}
      <div className="border-y border-crema/[0.1] py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <nav aria-label="Tipo scheda" className="flex flex-wrap gap-x-6 gap-y-2">
            {(["", "server", "bot"] as const).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k || "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k)}
                  className={cn(
                    "relative pb-1 text-sm font-semibold tracking-wide transition-colors",
                    on ? "text-crema" : "text-crema/40 hover:text-crema/75",
                  )}
                >
                  {k === "" ? "Tutto" : kindLabel(k)}
                  {on ? (
                    <span className="absolute inset-x-0 -bottom-px h-px bg-caramel" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <SmartLink
              href={page("/vetrina/le-mie/")}
              className="text-sm font-semibold text-crema/55 underline-offset-4 transition-colors hover:text-crema hover:underline"
            >
              Le mie schede
            </SmartLink>
            <SmartLink
              href={page("/vetrina/invia/")}
              className="inline-flex items-center gap-2 rounded-full bg-crema px-4 py-2 text-sm font-semibold text-ink transition-[transform,filter] hover:brightness-105 active:scale-[0.97]"
            >
              <Plus className="size-4" /> Metti una scheda
            </SmartLink>
          </div>
        </div>

        <form
          className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draftQ.trim());
          }}
        >
          <label htmlFor="listing-search" className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-crema/35" />
            <input
              id="listing-search"
              name="listing-search"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Cerca nome, tag, pezzo di descrizione…"
              className="w-full border-b border-crema/15 bg-transparent py-3 pl-7 pr-8 text-crema outline-none placeholder:text-crema/30 focus:border-caramel/50"
            />
            {draftQ ? (
              <button
                type="button"
                aria-label="Pulisci"
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-crema/40 hover:text-crema"
                onClick={() => {
                  setDraftQ("");
                  setQ("");
                }}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 lg:justify-end">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={sort === s.id}
                onClick={() => setSort(s.id)}
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
                  sort === s.id ? "text-caramel" : "text-crema/35 hover:text-crema/70",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {closedGate && (
        <div className="mt-8 flex gap-3 border border-caramel/25 bg-caramel/[0.07] px-5 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-caramel" />
          <div className="min-w-0">
            <p className="font-semibold text-crema">Ancora chiusa al pubblico</p>
            <p className="mt-1 text-sm text-crema/65">
              {list?.message || cfg?.message || "Per ora la vedono solo gli staff. Se sei staff, accedi."}
            </p>
            {!token && ready && (
              <button
                type="button"
                onClick={login}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-crema px-4 py-2 text-sm font-semibold text-ink"
              >
                <LogIn className="size-4" /> Accedi con Discord
              </button>
            )}
          </div>
        </div>
      )}

      {err && <p className="mt-6 text-sm text-ember">{err}</p>}

      {loading && (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <VinylCardSkeleton key={i} i={i} />
          ))}
        </div>
      )}

      {!loading && !closedGate && listings.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-24 max-w-md">
          <p className="font-display text-4xl leading-none text-crema/90">Niente qui</p>
          <p className="mt-4 text-crema/50">
            Con questi filtri lo scaffale è vuoto. Cambia ricerca, oppure metti tu una scheda.
          </p>
          <SmartLink
            href={page("/vetrina/invia/")}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-crema px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <Plus className="size-4" /> Metti una scheda
          </SmartLink>
        </motion.div>
      )}

      {!loading && listings.length > 0 && (
        <div className="mt-14 space-y-16">
          <AnimatePresence mode="popLayout">
            {(shelves.length ? shelves : [["in vetrina", listings] as const]).map(([cat, items]) => {
              const catKey = String(cat);
              const cap = shelfVisible[catKey] ?? SHELF_INITIAL;
              const shown = items.length > SHELF_INITIAL ? items.slice(0, cap) : items;
              const remaining = items.length > SHELF_INITIAL ? Math.max(0, items.length - cap) : 0;
              return (
                <div key={catKey}>
                  {/* ripiano: listello luce + titolo */}
                  <div className="mb-6">
                    <div
                      aria-hidden
                      className="mb-4 h-[3px] w-full rounded-full bg-gradient-to-r from-caramel/80 via-caramel/25 to-transparent shadow-[0_0_18px_rgba(217,154,91,0.35)]"
                    />
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="font-display text-3xl font-semibold capitalize tracking-[-0.03em] text-crema sm:text-[2.35rem]">
                        {catKey.replace(/-/g, " ")}
                      </h2>
                      <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-crema/35">
                        {String(items.length).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <p className="mt-14 text-center text-xs text-crema/35">
          Anteprima staff — fuori da qui la gente vede solo il messaggio di chiusura.
        </p>
      )}
    </section>
  );
}
