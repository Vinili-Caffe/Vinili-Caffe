"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Calendar, ChevronDown, Gamepad2, Link2, Music, Search, TrendingUp, Users, X, type LucideIcon } from "lucide-react";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqItem } from "@/lib/faq";
import { getFaqUsefulVote, setFaqUsefulVote, type FaqUsefulVote } from "@/lib/faq-useful";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Highlight, norm } from "../Highlight";
import { SmartLink } from "../SmartLink";

const ICONS: Record<string, LucideIcon> = {
  livelli: TrendingUp,
  voce: Music,
  giochi: Gamepad2,
  eventi: Calendar,
  staff: Users,
};

const plain = (body: string) => body.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1");

/** [[Etichetta|/percorso/]] → link interno. */
function RichBody({ body, query }: { body: string; query: string }) {
  const parts = body.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (!m) return <Highlight key={i} text={p} query={query} />;
        return (
          <SmartLink
            key={i}
            href={page(m[2])}
            className="font-medium text-caramel underline decoration-caramel/40 underline-offset-4 transition-colors hover:text-ember hover:decoration-ember"
          >
            <Highlight text={m[1]} query={query} />
          </SmartLink>
        );
      })}
    </>
  );
}

function Question({ item, open, onToggle, query }: { item: FaqItem; open: boolean; onToggle: () => void; query: string }) {
  const Icon = ICONS[item.category] ?? Search;
  const [copied, setCopied] = useState(false);
  const [useful, setUseful] = useState<FaqUsefulVote | null>(null);

  useEffect(() => {
    if (!open) return;
    setUseful(getFaqUsefulVote(item.id));
  }, [open, item.id]);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${item.id}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const voteUseful = (v: FaqUsefulVote) => {
    setFaqUsefulVote(item.id, v);
    setUseful(v);
  };

  return (
    <motion.li
      layout
      id={item.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-2xl ring-1 transition-colors",
        open ? "bg-mocha/60 ring-caramel/35" : "bg-roast/70 ring-sand/12 hover:ring-sand/25",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
            open ? "bg-caramel/20 text-ember ring-caramel/40" : "bg-crema/5 text-caramel ring-sand/15",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="flex-1 font-display text-xl font-semibold leading-snug sm:text-2xl">
          <Highlight text={item.title} query={query} />
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} className="text-crema/50">
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="px-5 pb-5 pl-[4.75rem] sm:px-6 sm:pb-6 sm:pl-[5rem]">
              <p className="leading-relaxed text-crema/75">
                <RichBody body={item.body} query={query} />
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 text-xs text-crema/40 transition-colors hover:text-crema/70"
                >
                  <Link2 className="size-3.5" />
                  {copied ? "Link copiato!" : "Copia link alla domanda"}
                </button>
                <span className="text-crema/20" aria-hidden>
                  ·
                </span>
                {useful ? (
                  <p className="text-xs text-crema/45">{useful === "yes" ? "Grazie per il feedback." : "Grazie — terremo conto."}</p>
                ) : (
                  <div className="inline-flex items-center gap-2 text-xs text-crema/45">
                    <span>È stato utile?</span>
                    <button
                      type="button"
                      onClick={() => voteUseful("yes")}
                      className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                    >
                      Sì
                    </button>
                    <button
                      type="button"
                      onClick={() => voteUseful("no")}
                      className="rounded-full bg-crema/8 px-2.5 py-1 font-semibold text-crema/70 ring-1 ring-sand/20 hover:bg-crema/12"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function FaqBrowser() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("tutte");
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  // /faq/#id → apre e scorre a quella domanda
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!FAQ_ITEMS.some((q) => q.id === id)) return;
      setCat("tutte");
      setQuery("");
      setOpenId(id);
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const results = useMemo(() => {
    const q = norm(query.trim());
    return FAQ_ITEMS.filter((it) => {
      if (cat !== "tutte" && it.category !== cat) return false;
      if (!q) return true;
      return norm(`${it.title} ${plain(it.body)}`).includes(q);
    });
  }, [query, cat]);

  // cercando, apri la prima domanda trovata
  useEffect(() => {
    if (query.trim() && results.length && !results.some((r) => r.id === openId)) setOpenId(results[0].id);
  }, [query, results, openId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { tutte: FAQ_ITEMS.length };
    for (const it of FAQ_ITEMS) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, []);

  const chips = [{ id: "tutte", label: "Tutte" }, ...FAQ_CATEGORIES];

  return (
    <div className="mx-auto max-w-4xl px-6 pb-20">
      {/* ricerca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-crema/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca: EXP, staff, eventi…"
          aria-label="Cerca nelle FAQ"
          className="w-full rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast py-4 pl-14 pr-12 text-base text-crema ring-1 ring-sand/15 backdrop-blur transition-shadow placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/60 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <AnimatePresence>
          {query && (
            <motion.button
              type="button"
              onClick={() => setQuery("")}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/50 hover:bg-crema/10 hover:text-crema"
              aria-label="Cancella ricerca"
            >
              <X className="size-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* categorie */}
      <LayoutGroup id="faq-cats">
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Categorie">
          {chips.map((c) => {
            const active = cat === c.id;
            const Icon = ICONS[c.id];
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCat(c.id)}
                className={cn(
                  "relative isolate inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active ? "text-espresso" : "text-crema/70 hover:text-crema",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="faq-cat-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-full bg-crema/6 ring-1 ring-sand/15" />}
                {Icon && <Icon className="size-4" />}
                {c.label}
                <span className={cn("text-xs tabular-nums", active ? "text-espresso/60" : "text-crema/40")}>
                  {counts[c.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {/* domande */}
      <ul className="mt-8 space-y-3">
        <AnimatePresence mode="popLayout">
          {results.map((it) => (
            <Question
              key={it.id}
              item={it}
              query={query}
              open={openId === it.id}
              onToggle={() => setOpenId((o) => (o === it.id ? null : it.id))}
            />
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-8 rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-8 text-center ring-1 ring-sand/12"
          >
            <p className="font-display text-2xl">Nessuna domanda trovata per “{query}”</p>
            <p className="mt-2 text-crema/60">Prova con un'altra parola, oppure chiedi direttamente a noi qui sotto.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
