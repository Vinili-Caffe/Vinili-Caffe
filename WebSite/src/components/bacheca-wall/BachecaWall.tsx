"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays, ExternalLink, Heart, LayoutGrid, Link2, Loader2, Mic, Quote, Repeat2, Shuffle, Skull, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { page as sitePage } from "@/lib/site";
import { useAuth } from "@/lib/auth";
import {
  KIND_LABEL,
  SORT_LABEL,
  bachecaShareUrl,
  canRemove,
  loadBacheca,
  loadBachecaItem,
  pickRandomBacheca,
  reactBacheca,
  removeBacheca,
  repostBacheca,
  splitBachecaText,
  type BachecaFilter,
  type BachecaItem,
  type BachecaSort,
} from "@/lib/bacheca";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { showToast, confirmDialog, openLightbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BachecaCard, Cassette, LinkChips, MediaAttachments, Pin, ReactionBar } from "./BachecaCards";

const FILTERS: BachecaFilter[] = ["all", "quote", "repost", "clip", "skull"];
const SORTS: BachecaSort[] = ["new", "top", "week"];
const SORT_ICONS: Record<BachecaSort, React.ReactNode> = {
  new: <Sparkles />,
  top: <Heart />,
  week: <CalendarDays />,
};
const FILTER_ICONS: Record<BachecaFilter, React.ReactNode> = {
  all: <LayoutGrid />,
  quote: <Quote />,
  repost: <Repeat2 />,
  clip: <Mic />,
  skull: <Skull />,
};

/* sughero: grana fatta con gradienti (niente immagini da caricare) */
const CORK =
  "bg-[#a9784a] [background-image:radial-gradient(rgba(60,32,12,0.35)_1px,transparent_1.5px),radial-gradient(rgba(255,220,170,0.18)_1px,transparent_1.5px),radial-gradient(ellipse_at_30%_20%,rgba(255,210,150,0.25),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(40,20,8,0.35),transparent_55%)] [background-size:7px_7px,11px_11px,100%_100%,100%_100%] [background-position:0_0,3px_5px,0_0,0_0]";

/* colonne del muro: si riempiono per righe (1° a sinistra, 2° accanto…), non dall'alto in basso */
function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function columnsNow() {
  const w = window.innerWidth;
  return w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1;
}

/* altezza prevista finché la card non è misurata */
function estimateHeight(it: BachecaItem) {
  if (it.kind === "quote" || it.kind === "skull") return 380;
  if (it.kind === "clip") return 300;
  return 200 + (it.imageUrl ? 260 : 0) + Math.min(160, Math.ceil(it.text.length / 40) * 22);
}

function readParam(name: string) {
  try {
    return new URLSearchParams(window.location.search).get(name) || "";
  } catch {
    return "";
  }
}

function setParam(name: string, value: string) {
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* ignore */
  }
}

export function BachecaWall() {
  const { token, user, login } = useAuth();
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<BachecaFilter>("all");
  const [sort, setSort] = useState<BachecaSort>("new");
  const [items, setItems] = useState<BachecaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<BachecaItem | null>(null);
  const [drawing, setDrawing] = useState(false);
  const cols = useSyncExternalStore(subscribeResize, columnsNow, () => 1);

  /* masonry: ogni card va nella colonna più corta (altezze vere misurate), così non restano buchi in fondo
     e l'ordine resta da sinistra a destra */
  const [heights, setHeights] = useState<Record<string, number>>({});
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next = prev;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.bid || "";
          const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height);
          if (id && h > 0 && Math.abs((prev[id] || 0) - h) > 2) {
            if (next === prev) next = { ...prev };
            next[id] = h;
          }
        }
        return next;
      });
    });
    observer.current = ro;
    return () => ro.disconnect();
  }, []);
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (node) observer.current?.observe(node);
  }, []);
  const columns = useMemo(() => {
    const out: BachecaItem[][] = Array.from({ length: cols }, () => []);
    const total = new Array(cols).fill(0);
    for (const it of items) {
      /* colonna più a sinistra tra quelle quasi più corte: card alte simili (es. 20px di "Reposta" a capo)
         non devono saltare in un'altra colonna e lasciare un buco */
      const min = Math.min(...total);
      const k = total.findIndex((t) => t <= min + 80);
      out[k].push(it);
      total[k] += heights[it.id] ?? estimateHeight(it);
    }
    return out;
  }, [items, cols, heights]);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const known = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const r = await loadBacheca(token, kind, sort, 1);
      if (r.ok) {
        /* i contenuti nuovi arrivati in diretta cadono sul muro con l'animazione */
        if (known.current.size) {
          const arrived = r.data.items.filter((it) => !known.current.has(it.id)).map((it) => it.id);
          if (arrived.length) setFreshIds((prev) => new Set([...prev, ...arrived]));
        }
        for (const it of r.data.items) known.current.add(it.id);
        setItems((prev) => (quiet && page > 1 ? [...r.data.items, ...prev.filter((p) => !r.data.items.some((n) => n.id === p.id))] : r.data.items));
        setHasMore(r.data.hasMore);
        if (!quiet) setPage(1);
        setErr("");
      } else if (!quiet) {
        setErr(r.message);
      }
      setLoading(false);
    },
    [token, kind, sort, page],
  );

  useEffect(() => {
    known.current = new Set();
    /* fuori dal corpo dell'effetto: niente setState sincrono */
    const t = setTimeout(() => {
      setFreshIds(new Set());
      void load();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kind, sort]);

  useLiveRefresh(() => load(true), { topics: ["bacheca"], boot: false, intervalMs: 45_000 });

  /* link condiviso: /bacheca/?p=<id> apre subito il contenuto */
  useEffect(() => {
    const id = readParam("p");
    if (!id) return;
    void loadBachecaItem(token, id).then((r) => {
      if (r.ok) setOpen(r.data);
      else showToast(r.message || "Questo contenuto non è più in bacheca.", true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openItem = (it: BachecaItem | null) => {
    setOpen(it);
    setParam("p", it?.id || "");
  };

  const more = async () => {
    setMoreLoading(true);
    const next = page + 1;
    const r = await loadBacheca(token, kind, sort, next);
    if (r.ok) {
      for (const it of r.data.items) known.current.add(it.id);
      setItems((prev) => [...prev, ...r.data.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(r.data.hasMore);
      setPage(next);
    } else {
      showToast(r.message, true);
    }
    setMoreLoading(false);
  };

  const patch = (id: string, next: Partial<BachecaItem>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
    setOpen((o) => (o && o.id === id ? { ...o, ...next } : o));
  };

  const react = async (item: BachecaItem, emoji: string) => {
    if (!token) {
      showToast("Accedi con Discord per reagire.", false);
      login();
      return;
    }
    /* subito sullo schermo, poi si allinea con la risposta */
    const on = item.mine.includes(emoji);
    const optimistic = {
      mine: on ? item.mine.filter((e) => e !== emoji) : [...item.mine, emoji],
      reactions: { ...item.reactions, [emoji]: Math.max(0, (item.reactions[emoji] || 0) + (on ? -1 : 1)) },
    };
    patch(item.id, optimistic);
    const r = await reactBacheca(token, item.id, emoji);
    if (r.ok) patch(item.id, { mine: r.data.mine, reactions: r.data.reactions });
    else {
      patch(item.id, { mine: item.mine, reactions: item.reactions });
      showToast(r.message, true);
    }
  };

  const repost = async (item: BachecaItem) => {
    if (!token) {
      showToast("Accedi con Discord per repostare.", false);
      login();
      return;
    }
    if (item.repostedByMe || item.kind === "skull") return;
    patch(item.id, { repostedByMe: true, reposts: item.reposts + 1 });
    const r = await repostBacheca(token, item.id);
    if (r.ok) {
      showToast("Repostato! Lo trovi anche nel tuo profilo.");
    } else if (r.status !== 409) {
      patch(item.id, { repostedByMe: item.repostedByMe, reposts: item.reposts });
      showToast(r.message, true);
    }
  };

  const draw = async () => {
    setDrawing(true);
    const r = await pickRandomBacheca(token);
    setDrawing(false);
    if (r.ok) openItem(r.data);
    else showToast(r.message || "Il muro è ancora vuoto.", true);
  };

  const remove = async (item: BachecaItem) => {
    if (!token) return;
    const ok = await confirmDialog({
      title: "Togliere dalla bacheca?",
      message: "Il contenuto sparisce dal muro per tutti. Non si può annullare.",
      danger: true,
      confirmLabel: "Togli",
    });
    if (!ok) return;
    const r = await removeBacheca(token, item.id);
    if (!r.ok) return showToast(r.message, true);
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    openItem(null);
    showToast("Tolto dalla bacheca.");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      {/* linguette dei filtri e ordine */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div role="tablist" aria-label="Cosa mostrare" className="-mb-px flex gap-1 overflow-x-auto pl-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={kind === f}
              onClick={() => setKind(f)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-t-xl px-4 pb-2.5 pt-2 text-sm font-semibold transition-colors [&>svg]:size-4",
                kind === f ? "bg-[#7a5230] text-paper shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.6)]" : "bg-[#5b3d24]/60 text-crema/70 hover:bg-[#5b3d24] hover:text-crema",
              )}
            >
              {FILTER_ICONS[f]}
              {KIND_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors [&>svg]:size-4",
                sort === s ? "bg-caramel text-ink" : "bg-crema/8 text-crema/70 ring-1 ring-sand/20 hover:text-crema",
              )}
            >
              {SORT_ICONS[s]}
              {SORT_LABEL[s]}
            </button>
          ))}
          {/* le proprie quote, repost e clip stanno nel profilo (sezione Bacheca) */}
          {user?.id ? (
            <SmartLink
              href={sitePage(`/user/?id=${encodeURIComponent(user.id)}#miei-contenuti`)}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 transition-colors hover:text-crema [&>svg]:size-4"
            >
              <UserRound /> I miei
            </SmartLink>
          ) : (
            <button
              type="button"
              onClick={login}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 transition-colors hover:text-crema [&>svg]:size-4"
            >
              <UserRound /> I miei
            </button>
          )}
          <motion.button
            type="button"
            onClick={draw}
            disabled={drawing}
            whileTap={{ scale: 0.94 }}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-1.5 text-sm font-semibold text-ink shadow-[0_10px_24px_-10px_rgba(232,160,90,0.8)]"
          >
            {drawing ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />} Pesca dal muro
          </motion.button>
        </div>
      </div>

      {/* il muro: cornice di legno e sughero */}
      <div className="rounded-2xl bg-gradient-to-b from-[#7a5230] to-[#4e331d] p-3 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] sm:p-4">
        <div className={cn("min-h-[60vh] rounded-lg px-4 pb-4 pt-10 shadow-[inset_0_2px_14px_rgba(0,0,0,0.55)] sm:px-6", CORK)}>
          {loading ? (
            /* skeleton: biglietti appesi al sughero mentre arrivano quelli veri */
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy aria-label="Caricamento del muro">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`animate-pulse rounded-sm bg-[#f6efe0]/70 p-4 shadow-lg`} style={{ transform: `rotate(${[-2, 1.5, -1, 2, -1.5, 1][i]}deg)` }}>
                  <div className="h-3 w-1/3 rounded bg-ink/15" />
                  <div className="mt-3 h-3 rounded bg-ink/10" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-ink/10" />
                  <div className="mt-2 h-3 w-3/5 rounded bg-ink/10" />
                </div>
              ))}
            </div>
          ) : err ? (
            <div className="mx-auto max-w-md rotate-[-1deg] bg-[#fbe68a] p-6 text-center text-ink shadow-lg">
              <p className="font-display text-2xl font-bold">Il muro non si carica</p>
              <p className="mt-2 text-sm text-ink/70">{err}</p>
              <button type="button" onClick={() => load()} className="mt-4 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
                Riprova
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="mx-auto max-w-md rotate-[1deg] bg-[#fbf7ef] p-6 text-center text-ink shadow-lg">
              <p className="font-display text-2xl font-bold">Ancora niente qui</p>
              <p className="mt-2 text-sm text-ink/70">Usa +quote, +repost, +clip o una 💀 su Discord: i contenuti finiscono su questo muro.</p>
            </div>
          ) : (
            <div className="flex items-start gap-7">
              {columns.map((col, c) => (
                <div key={c} className="flex min-w-0 flex-1 flex-col">
                  <AnimatePresence initial={false}>
                    {col.map((it) => (
                      <div key={it.id} ref={measure} data-bid={it.id} className="flow-root">
                        <BachecaCard
                          item={it}
                          fresh={freshIds.has(it.id)}
                          onOpen={() => openItem(it)}
                          onReact={(e) => react(it, e)}
                          onRepost={() => repost(it)}
                        />
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
          {hasMore && !loading && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={more}
                disabled={moreLoading}
                className="inline-flex items-center gap-2 rounded-full bg-paper/90 px-5 py-2.5 text-sm font-semibold text-ink shadow-lg hover:bg-paper"
              >
                {moreLoading && <Loader2 className="size-4 animate-spin" />} Mostra altro
              </button>
            </div>
          )}
        </div>
      </div>

      {/* contenuto aperto: si stacca dal muro e viene in primo piano */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-espresso/80 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => openItem(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Contenuto della bacheca"
              initial={reduce ? { opacity: 0 } : { y: -80, rotate: -6, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 240, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto"
            >
              <BachecaDetail
                item={open}
                canRemove={canRemove(open, user?.id)}
                onReact={(e) => react(open, e)}
                onRepost={() => repost(open)}
                onRemove={() => remove(open)}
                onClose={() => openItem(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BachecaDetail({
  item,
  canRemove: removable,
  onReact,
  onRepost,
  onRemove,
  onClose,
}: {
  item: BachecaItem;
  canRemove: boolean;
  onReact: (emoji: string) => void;
  onRepost: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bachecaShareUrl(item.id));
      showToast("Link copiato.");
    } catch {
      showToast("Non riesco a copiare il link.", true);
    }
  };
  const mediaImages = [item.imageUrl, ...item.media.filter((m) => m.type === "image").map((m) => m.url)].filter(Boolean);
  const parts = splitBachecaText(item.kind === "skull" ? "" : item.text, mediaImages);
  const images = [...mediaImages, ...parts.images];
  const title = { quote: "Quote", repost: "Repost", clip: "Clip vocale", skull: "Skullboard" }[item.kind];
  return (
    <div className="relative rounded-2xl bg-[#fbf7ef] p-5 pt-7 text-ink shadow-2xl">
      <Pin tone="yellow" className="top-3" />
      <button type="button" onClick={onClose} aria-label="Chiudi" className="absolute right-3 top-3 rounded-full p-1.5 text-ink/60 hover:bg-ink/10 hover:text-ink">
        <X className="size-5" />
      </button>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">
        {title}
        {item.number ? ` · #${item.number}` : ""}
      </p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight">{item.author.name}</p>

      <div className="mt-4 space-y-3">
        {item.kind === "clip" ? (
          <Cassette item={item} onReact={onReact} onRepost={onRepost} big />
        ) : (
          <>
            {images.map((src, i) => (
              <button key={src} type="button" onClick={() => openLightbox(images, i)} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full rounded-md shadow-md" />
              </button>
            ))}
            {parts.text && <p className="whitespace-pre-line break-words text-base leading-relaxed [overflow-wrap:anywhere]">{parts.text}</p>}
            <LinkChips links={parts.links} />
            {/* stesso lettore delle card: se l'audio suona già, qui risulta in riproduzione */}
            <MediaAttachments media={item.media} />
          </>
        )}
      </div>

      {item.kind !== "clip" && (
        <div className="mt-4">
          <ReactionBar item={item} onReact={onReact} onRepost={onRepost} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
          <Link2 className="size-4" /> Copia link
        </button>
        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full bg-ink/8 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/15">
            <ExternalLink className="size-4" /> Messaggio su Discord
          </a>
        )}
        {removable && (
          <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-[#9b2c2c] hover:bg-[#9b2c2c]/10">
            <Trash2 className="size-4" /> Togli dalla bacheca
          </button>
        )}
      </div>
    </div>
  );
}
