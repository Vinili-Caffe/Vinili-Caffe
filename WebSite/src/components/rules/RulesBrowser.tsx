"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlignLeft,
  Ban,
  ChevronDown,
  ExternalLink,
  EyeOff,
  Gavel,
  Link as LinkIcon,
  Link2,
  Lock,
  Megaphone,
  MessagesSquare,
  Mic,
  Music,
  RefreshCw,
  Scale,
  Search,
  Shield,
  TriangleAlert,
  Users,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { loadRules, ruleAnchor, type Rule, type RulesData } from "@/lib/rules";
import { cn } from "@/lib/cn";
import { Highlight, norm } from "../Highlight";

// icone del bot (nomi Font Awesome) → lucide
const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  comments: MessagesSquare,
  microphone: Mic,
  "balance-scale": Scale,
  users: Users,
  bullhorn: Megaphone,
  refresh: RefreshCw,
  lock: Lock,
  ban: Ban,
  link: LinkIcon,
  "align-left": AlignLeft,
  warning: TriangleAlert,
  "eye-slash": EyeOff,
  music: Music,
  "volume-off": VolumeX,
};
const iconFor = (name?: string) => (name && ICONS[name]) || Gavel;
const SIDES = "ABCDEFGH";

function Track({ rule, open, onToggle, query }: { rule: Rule; open: boolean; onToggle: () => void; query: string }) {
  const Icon = iconFor(rule.icon);
  const [copied, setCopied] = useState(false);
  const anchor = ruleAnchor(rule.id);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${anchor}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <motion.li
      layout
      id={anchor}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group scroll-mt-28 border-b border-sand/10 transition-colors last:border-b-0",
        open ? "bg-crema/[0.03]" : "hover:bg-crema/[0.02]",
      )}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-6">
        {/* numero traccia: diventa un "play" quando è aperta */}
        <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-crema/40">
          {open ? (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex h-[14px] items-center gap-[2px]">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="inline-block h-[14px] w-[3px] rounded-full bg-caramel"
                  // scaleY invece di height: niente ricalcolo del layout a ogni frame
                  animate={{ scaleY: [6 / 14, 1, 8 / 14, 12 / 14, 6 / 14] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                />
              ))}
            </motion.span>
          ) : (
            rule.id
          )}
        </span>
        <Icon className={cn("size-5 shrink-0 transition-colors", open ? "text-ember" : "text-caramel/70")} />
        <span className="flex-1 font-display text-xl font-semibold leading-snug sm:text-2xl">
          <Highlight text={rule.title} query={query} />
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} className="text-crema/40">
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-6 pl-[4.5rem] pr-4 sm:pl-[6.25rem] sm:pr-8">
              <p className="leading-relaxed text-crema/75">
                <Highlight text={rule.body} query={query} />
              </p>
              {!!rule.links?.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {rule.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-3 py-1.5 text-sm text-crema/80 ring-1 ring-sand/20 transition-colors hover:bg-crema/12 hover:text-crema"
                    >
                      {l.label} <ExternalLink className="size-3.5" />
                    </a>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={copyLink}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-crema/40 transition-colors hover:text-crema/70"
              >
                <Link2 className="size-3.5" />
                {copied ? "Link copiato!" : `Copia link alla regola ${rule.id}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function RulesBrowser({ initial }: { initial: RulesData }) {
  const [data, setData] = useState(initial);
  const [side, setSide] = useState(initial.categories[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(initial.rules[0]?.id ?? null);

  // regole sempre aggiornate dal bot (la pagina nasce con quelle della build)
  useEffect(() => {
    let alive = true;
    loadRules("").then((d) => alive && d && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  // /regole/#r-2-2 → lato giusto + regola aperta
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      const r = data.rules.find((x) => ruleAnchor(x.id) === h);
      if (!r) return;
      setQuery("");
      setSide(r.category);
      setOpenId(r.id);
      window.setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [data.rules]);

  const searching = query.trim().length > 0;
  const shown = useMemo(() => {
    const q = norm(query.trim());
    if (q) return data.rules.filter((r) => norm(`${r.id} ${r.title} ${r.body}`).includes(q));
    return data.rules.filter((r) => r.category === side);
  }, [data.rules, side, query]);

  useEffect(() => {
    if (searching && shown.length && !shown.some((r) => r.id === openId)) setOpenId(shown[0].id);
  }, [searching, shown, openId]);

  const sideIdx = Math.max(0, data.categories.findIndex((c) => c.id === side));
  const current = data.categories[sideIdx];
  const SideIcon = iconFor(current?.icon);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16">
      {/* disclaimer */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-2xl bg-caramel/10 px-5 py-4 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-caramel" />
        {data.disclaimer}
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        {/* copertina del lato (laterale su desktop) */}
        {/* su telefono dopo la tracklist (prima le regole), su desktop a fianco */}
        <aside className="order-last lg:order-none lg:sticky lg:top-28 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/15">
            {/* disco dentro la copertina (angolo alto-dx, clippati i bordi) */}
            <motion.div
              key={side}
              initial={{ x: 28, rotate: -28, opacity: 0 }}
              animate={{ x: 0, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 90, damping: 15 }}
              className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#2a1c14_1.5px_3px)] shadow-[0_10px_30px_rgba(0,0,0,0.55)] ring-1 ring-sand/15"
              aria-hidden
            >
              <div className="absolute inset-[34%] flex items-center justify-center rounded-full bg-gradient-to-br from-caramel to-sand/80 font-display text-xl font-bold text-ink">
                {SIDES[sideIdx]}
              </div>
            </motion.div>

            <p className="relative pr-16 text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
              {searching ? "Ricerca" : `Sezione ${SIDES[sideIdx]}`}
            </p>
            <AnimatePresence mode="wait">
              <motion.h2
                key={searching ? "search" : side}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="relative mt-2 flex items-center gap-2 pr-16 font-display text-3xl font-semibold leading-tight"
              >
                {!searching && <SideIcon className="size-6 text-sand" />}
                {searching ? `“${query.trim()}”` : current?.label}
              </motion.h2>
            </AnimatePresence>
            <p className="mt-1 text-sm text-crema/55">
              {shown.length} {shown.length === 1 ? "regola" : "regole"}
            </p>

            <div className="mt-6 border-t border-sand/10 pt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-crema/85">
                <Gavel className="size-4 text-caramel" /> Sanzioni
              </p>
              <p className="mt-2 text-sm leading-relaxed text-crema/55">
                Il grado della sanzione dipende dalla gravità e dalla recidiva. Nel dubbio chiedi allo staff, senza
                contestare in pubblico.
              </p>
            </div>
          </div>
        </aside>

        <div>
          {/* ricerca + lati */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-crema/40" />
            <input name="rules-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nel regolamento…"
              aria-label="Cerca nel regolamento"
              className="w-full rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast py-4 pl-14 pr-12 text-base text-crema ring-1 ring-sand/15 transition-shadow placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/60 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/50 hover:bg-crema/10 hover:text-crema"
                aria-label="Cancella ricerca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <LayoutGroup id="rules-sides">
            <div className={cn("mt-4 flex flex-wrap gap-2 transition-opacity", searching && "opacity-40")} role="tablist" aria-label="Sezioni del regolamento">
              {data.categories.map((c, i) => {
                const active = !searching && side === c.id;
                const Icon = iconFor(c.icon);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setQuery("");
                      setSide(c.id);
                      setOpenId(data.rules.find((r) => r.category === c.id)?.id ?? null);
                    }}
                    className={cn(
                      "relative isolate inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      active ? "text-espresso" : "text-crema/70 hover:text-crema",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="rules-side-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    {!active && <span className="absolute inset-0 -z-10 rounded-full bg-crema/6 ring-1 ring-sand/15" />}
                    <span className={cn("font-mono text-xs", active ? "text-espresso/60" : "text-caramel")}>{SIDES[i]}</span>
                    <Icon className="size-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          {/* tracklist */}
          <div className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
            <div className="flex items-center gap-4 border-b border-sand/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-crema/35 sm:px-6">
              <span className="w-10">N°</span>
              <span>Regola</span>
            </div>
            <ul>
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((r) => (
                  <Track
                    key={r.id}
                    rule={r}
                    query={query}
                    open={openId === r.id}
                    onToggle={() => setOpenId((o) => (o === r.id ? null : r.id))}
                  />
                ))}
              </AnimatePresence>
            </ul>
            {shown.length === 0 && (
              <p className="px-6 py-10 text-center text-crema/60">
                Nessuna regola trovata per “{query}”. Prova con un'altra parola.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
