"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowUpRight, Bot, Loader2, Store, Users, type LucideIcon } from "lucide-react";
import { KINDS, loadReviews, type ReviewKind, type ReviewKindInfo, type ReviewsData } from "@/lib/reviews";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { readDeepLink } from "@/lib/deeplink";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { Composer } from "./Composer";
import { ReviewCard } from "./ReviewCard";
import { Stars } from "./Stars";

const PAGE_SIZE = 12;

const KIND_ICONS: Record<ReviewKind, LucideIcon> = { server: Store, staff: Users, bot: Bot };
type Sort = "recent" | "liked" | "high" | "low";
const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Più recenti" },
  { id: "liked", label: "Più apprezzate" },
  { id: "high", label: "Voto più alto" },
  { id: "low", label: "Voto più basso" },
];

/**
 * Recensioni con media, distribuzione, composer ed elenco.
 * `kinds`: tipi mostrati (sito: server e staff; dashboard del bot: solo "bot", senza schede).
 */
export function ReviewsBrowser({
  initial,
  kinds = KINDS,
  className = "mx-auto max-w-5xl px-6 pb-16",
}: {
  initial: ReviewsData | null;
  kinds?: ReviewKindInfo[];
  className?: string;
}) {
  const { ready, token, login } = useAuth();
  const [kind, setKind] = useState<ReviewKind>(kinds[0]?.id ?? "server");
  const [data, setData] = useState<ReviewsData | null>(initial);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");
  const [pageNum, setPageNum] = useState(1);
  const [round, setRound] = useState(0);

  const reload = useCallback(() => setRound((n) => n + 1), []);

  useLiveRefresh(reload, { intervalMs: 90_000, enabled: ready, boot: false, topics: ["reviews"] });

  // da notifica: /recensioni?board=staff#vc-review-<id> → scheda giusta e pagina che contiene la recensione
  const [focusId, setFocusId] = useState(() => readDeepLink().reviewId || "");
  useEffect(() => {
    const read = () => {
      const d = readDeepLink();
      if (d.boardStaff && kinds.some((k) => k.id === "staff")) {
        setData(null);
        setKind("staff");
      }
      /* /recensioni/#bot → le recensioni del bot (prima stavano in dashboard) */
      if (location.hash === "#bot" && kinds.some((k) => k.id === "bot")) {
        setData(null);
        setKind("bot");
      }
      if (d.reviewId) setFocusId(d.reviewId);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // dopo un like il server avvisa in tempo reale e la lista si ricarica: se intanto la pagina si accorcia
  // (lista vuota per un attimo, caricamento) il browser riporta in cima. L'altezza resta bloccata finché arriva
  // la lista nuova, e un ricaricamento vuoto della stessa scheda non cancella le recensioni già a schermo.
  const listRef = useRef<HTMLDivElement>(null);
  const [holdHeight, setHoldHeight] = useState(0);
  const loadedKind = useRef<ReviewKind | null>(null);
  /* dopo una tua azione (pubblica/elimina) la lista nuova vale anche se è vuota */
  const acceptEmpty = useRef(false);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setHoldHeight(listRef.current?.offsetHeight || 0);
    setLoading(true);
    loadReviews(kind, token).then((d) => {
      if (!alive) return;
      if (d) {
        setData((prev) => {
          const sameKind = loadedKind.current === kind;
          if (sameKind && prev?.reviews?.length && !d.reviews?.length && !acceptEmpty.current) return prev;
          return d;
        });
        acceptEmpty.current = false;
        loadedKind.current = kind;
      }
      setLoading(false);
      // un frame dopo, quando la lista nuova è già disegnata
      requestAnimationFrame(() => alive && setHoldHeight(0));
    });
    return () => {
      alive = false;
    };
  }, [kind, token, ready, round]);

  const viewerId = String(data?.viewer?.id || "").trim();
  // staff: nascondi recensioni verso chi non è più nella lista staffers (ex staff)
  const reviews = useMemo(() => {
    const list = data?.reviews ?? [];
    if (kind !== "staff") return list;
    const ids = new Set((data?.staffers ?? []).map((s) => String(s.id || "").trim()).filter(Boolean));
    if (!ids.size) return list;
    /* l'elenco staffers esclude chi guarda (non si recensisce da solo): le recensioni su di sé vanno viste lo stesso */
    if (viewerId) ids.add(viewerId);
    return list.filter((r) => ids.has(String(r.staffUserId || "").trim()));
  }, [data?.reviews, data?.staffers, viewerId, kind]);
  const sorted = useMemo(() => {
    const list = [...reviews];
    if (sort === "liked") list.sort((a, b) => b.likeCount - a.likeCount);
    else if (sort === "high") list.sort((a, b) => b.rating - a.rating);
    else if (sort === "low") list.sort((a, b) => a.rating - b.rating);
    return list;
  }, [reviews, sort]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));
  const viewer = data?.viewer ?? null;
  const { page: pageSafe, totalPages, slice } = pageSlice(sorted, pageNum, PAGE_SIZE);
  useEffect(() => {
    if (!focusId) return;
    const idx = sorted.findIndex((r) => r.id === focusId);
    if (idx < 0) return;
    setPageNum(Math.floor(idx / PAGE_SIZE) + 1);
    setFocusId("");
  }, [focusId, sorted]);

  return (
    <div className={className}>
      {/* tipo di recensione (solo se ce n'è più di uno) */}
      {kinds.length > 1 ? (
      <LayoutGroup id="review-kinds">
        <div className={cn("grid gap-2", kinds.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")} role="tablist" aria-label="Tipo di recensioni">
          {kinds.map((k) => {
            const active = kind === k.id;
            const Icon = KIND_ICONS[k.id];
            return (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (k.id === kind) return;
                  /* niente recensioni né "la tua recensione" dell'altra scheda mentre carica */
                  setData(null);
                  setKind(k.id);
                  setPageNum(1);
                }}
                className={cn("relative isolate flex items-center gap-3 rounded-2xl p-4 text-left transition-colors", active ? "text-espresso" : "text-crema/70 hover:text-crema")}
              >
                {active && (
                  <motion.span layoutId="review-kind" className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-crema to-sand" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast ring-1 ring-sand/12" />}
                <Icon className="size-5 shrink-0" />
                <span>
                  <span className="block font-semibold">{k.label}</span>
                  <span className={cn("block text-xs", active ? "text-espresso/60" : "text-crema/45")}>{k.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
      ) : null}

      {/* media + composer */}
      <div className={cn("grid gap-4 lg:grid-cols-[18rem_1fr]", kinds.length > 1 && "mt-8")}>
        <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12">
          <AnimatePresence mode="wait">
            <motion.div key={`${kind}-${reviews.length}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="font-display text-6xl font-semibold lining-nums">{reviews.length ? avg.toFixed(1).replace(".", ",") : "—"}</p>
              <Stars value={avg} size="size-5" className="mt-2" />
              <p className="mt-2 text-sm text-crema/50">
                {reviews.length} {reviews.length === 1 ? "recensione" : "recensioni"}
              </p>
              <div className="mt-5 space-y-1.5">
                {dist.map((d) => (
                  <div key={d.n} className="flex items-center gap-2 text-xs text-crema/50">
                    <span className="w-3 tabular-nums">{d.n}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-crema/8">
                      <motion.span
                        className="block h-full rounded-full bg-ember"
                        initial={{ width: 0 }}
                        animate={{ width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <span className="w-6 text-right tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
              {data?.externalUrl && kind === "server" && (
                <a href={data.externalUrl} target="_blank" rel="noopener" className="mt-5 inline-flex items-center gap-1 text-xs text-caramel hover:underline">
                  Recensiscici anche su Disboard <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Composer key={kind} kind={kind} token={token} viewer={viewer} staffers={data?.staffers ?? []} onLogin={login} onSaved={() => {
            acceptEmpty.current = true;
            reload();
          }} />
      </div>

      {/* elenco */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-semibold">Dalle recensioni</h2>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSort(s.id);
                setPageNum(1);
              }}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors", sort === s.id ? "bg-crema/12 text-crema ring-sand/30" : "text-crema/55 ring-sand/12 hover:text-crema")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="reviews-list"
        ref={listRef}
        className="relative mt-5 scroll-mt-28"
        style={holdHeight ? { minHeight: holdHeight } : undefined}
      >
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-crema/50" />
          </div>
        )}
        {sorted.length === 0 && loading ? (
          <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid" aria-busy aria-label="Caricamento recensioni">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/10">
                <div className="flex items-center gap-3">
                  <span className="animate-pulse size-10 rounded-full bg-crema/[0.08]" />
                  <span className="flex-1 space-y-1.5">
                    <span className="animate-pulse block h-3.5 w-1/3 rounded bg-crema/[0.08]" />
                    <span className="animate-pulse block h-3 w-1/4 rounded bg-crema/[0.05]" />
                  </span>
                </div>
                <span className="animate-pulse mt-5 block h-3 rounded bg-crema/[0.06]" />
                <span className="animate-pulse mt-2 block h-3 w-5/6 rounded bg-crema/[0.06]" />
                <span className="animate-pulse mt-2 block h-3 w-2/3 rounded bg-crema/[0.06]" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 && !loading ? (
          <EmptyState icon={Store} title="Ancora nessuna recensione" text="Scrivi la prima recensione per questo tipo." />
        ) : (
          <div className={cn("columns-1 gap-4 transition-opacity md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid", loading && "opacity-50")}>
            {slice.map((r, i) => (
              <ReviewCard
                key={r.id}
                r={r}
                i={i}
                token={token}
                viewerId={viewer?.id}
                canReply={!!viewer && (kind === "staff" ? viewer.id === r.staffUserId : viewer.canReplyAsServer)}
                onChanged={reload}
              />
            ))}
          </div>
        )}
      </div>
      <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId="reviews-list" />
    </div>
  );
}
