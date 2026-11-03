"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  ChartColumn,
  ChevronDown,
  Coffee,
  Copy,
  CornerDownRight,
  Crown,
  Disc3,
  Gamepad2,
  Link2,
  MessageSquareText,
  Music,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { BOTS, commandAnchor, loadWikiBot, type BotId, type WikiBot, type WikiCommand } from "@/lib/wiki";
import { cn } from "@/lib/cn";
import { displayName, useAuth } from "@/lib/auth";
import { Highlight, norm } from "../Highlight";

const CAT_ICONS: Record<string, LucideIcon> = {
  utility: Wrench,
  tts: MessageSquareText,
  level: TrendingUp,
  minigames: Gamepad2,
  stats: ChartColumn,
  music: Music,
};
const catIcon = (id: string) => CAT_ICONS[id] ?? Sparkles;

type Row = { bot: BotId; cat: string; catTitle: string; cmd: WikiCommand };

function CopyChip({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-sm ring-1 transition-colors",
        done ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40" : "bg-espresso text-ember ring-caramel/30 hover:ring-caramel/60",
      )}
      aria-label={`Copia ${text}`}
      title="Copia il comando"
    >
      {text}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? "ok" : "copy"}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5 opacity-60" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function CommandRow({
  row,
  open,
  onToggle,
  query,
  vip,
  showBot,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  query: string;
  vip: boolean;
  showBot: boolean;
}) {
  const { cmd } = row;
  const anchor = commandAnchor(row.bot, cmd.invoke);
  const usage = cmd.usage && cmd.usage !== cmd.invoke ? cmd.usage : "";
  const example = cmd.example && cmd.example !== cmd.invoke && cmd.example !== cmd.usage ? cmd.example : "";
  const [copied, setCopied] = useState(false);
  const BotIcon = row.bot === "prod" ? Disc3 : Coffee;

  return (
    <motion.li
      layout
      id={anchor}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn("scroll-mt-28 border-b border-dashed border-sand/15 last:border-b-0", open && "bg-crema/[0.03]")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-6">
        <CopyChip text={cmd.invoke} />
        {/* puntini da menù del bar tra nome e descrizione */}
        <span className="hidden h-px flex-none basis-6 border-b border-dotted border-sand/25 sm:block" />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`Dettagli di ${cmd.invoke}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-crema/75 sm:text-base">
            <Highlight text={cmd.description} query={query} />
          </span>
          <span className="ml-auto flex items-center gap-2">
          {showBot && (
            <span className="inline-flex items-center gap-1 rounded-full bg-crema/6 px-2 py-0.5 text-xs text-crema/55 ring-1 ring-sand/15">
              <BotIcon className="size-3" /> {row.bot === "prod" ? "Vinili" : "Caffè"}
            </span>
          )}
          {vip && (
            <span className="inline-flex items-center gap-1 rounded-full bg-caramel/15 px-2 py-0.5 text-xs font-semibold text-ember ring-1 ring-caramel/35">
              <Crown className="size-3" /> VIP
            </span>
          )}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="text-crema/35">
            <ChevronDown className="size-4" />
          </motion.span>
        </span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <dl className="grid gap-x-6 gap-y-2 px-4 pb-5 text-sm sm:grid-cols-[6rem_1fr] sm:px-6">
              <dt className="text-crema/40">Categoria</dt>
              <dd className="text-crema/75">{row.catTitle}</dd>
              {usage && (
                <>
                  <dt className="text-crema/40">Uso</dt>
                  <dd>
                    <code className="rounded bg-espresso px-1.5 py-0.5 font-mono text-ember">{usage}</code>
                  </dd>
                </>
              )}
              {example && (
                <>
                  <dt className="text-crema/40">Esempio</dt>
                  <dd className="flex items-center gap-1.5">
                    <CornerDownRight className="size-3.5 text-crema/30" />
                    <code className="rounded bg-espresso px-1.5 py-0.5 font-mono text-crema/85">{example}</code>
                  </dd>
                </>
              )}
              {cmd.aliases.length > 0 && (
                <>
                  <dt className="text-crema/40">Alias</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {cmd.aliases.map((a) => (
                      <code key={a} className="rounded bg-espresso px-1.5 py-0.5 font-mono text-crema/70">
                        {a}
                      </code>
                    ))}
                  </dd>
                </>
              )}
              {vip && (
                <>
                  <dt className="text-crema/40">Accesso</dt>
                  <dd className="text-crema/75">Riservato a chi ha il ruolo VIP</dd>
                </>
              )}
            </dl>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${anchor}`);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                } catch {}
              }}
              className="mb-4 ml-4 inline-flex items-center gap-1.5 text-xs text-crema/40 transition-colors hover:text-crema/70 sm:ml-6"
            >
              <Link2 className="size-3.5" />
              {copied ? "Link copiato!" : "Copia link al comando"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function WikiBrowser({ initial }: { initial: Record<BotId, WikiBot> }) {
  const [data, setData] = useState(initial);
  const [bot, setBot] = useState<BotId>("prod");
  const [cat, setCat] = useState<string>("tutte");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // comandi sempre aggiornati dai bot; da loggato anche quelli dei tuoi ruoli
  const { ready, token, user, login } = useAuth();
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    for (const b of ["prod", "coffee"] as BotId[]) {
      loadWikiBot(b, "", token).then((d) => alive && d && setData((prev) => ({ ...prev, [b]: d })));
    }
    return () => {
      alive = false;
    };
  }, [ready, token]);
  const personal = !!token && data.prod.guest === false;

  const allRows = useMemo(() => {
    const rows: Row[] = [];
    for (const b of ["prod", "coffee"] as BotId[]) {
      for (const c of data[b].categories) for (const cmd of c.commands) rows.push({ bot: b, cat: c.id, catTitle: c.title, cmd });
    }
    return rows;
  }, [data]);

  // /wiki/#cmd-prod-afk → bot giusto + comando aperto
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      const r = allRows.find((x) => commandAnchor(x.bot, x.cmd.invoke) === h);
      if (!r) return;
      setQuery("");
      setBot(r.bot);
      setCat("tutte");
      setOpenKey(h);
      window.setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [allRows]);

  const searching = query.trim().length > 0;
  const shown = useMemo(() => {
    const q = norm(query.trim());
    if (q) {
      return allRows.filter((r) =>
        norm(`${r.cmd.invoke} ${r.cmd.description} ${r.cmd.aliases.join(" ")} ${r.catTitle}`).includes(q),
      );
    }
    return allRows.filter((r) => r.bot === bot && (cat === "tutte" || r.cat === cat));
  }, [allRows, bot, cat, query]);

  // raggruppati per categoria (ordine del bot)
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; id: string; rows: Row[] }>();
    for (const r of shown) {
      const k = `${searching ? r.bot + ":" : ""}${r.cat}`;
      if (!map.has(k)) map.set(k, { id: r.cat, title: searching ? `${r.catTitle} · ${r.bot === "prod" ? "Vinili" : "Caffè"}` : r.catTitle, rows: [] });
      map.get(k)!.rows.push(r);
    }
    return [...map.values()];
  }, [shown, searching]);

  const cats = data[bot].categories;
  const total = (b: BotId) => data[b].categories.reduce((a, c) => a + c.commands.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      {/* i due bot — pt sul grid evita che hover y=-3 / watermark escano tagliati */}
      <div className="grid gap-4 pt-1 sm:grid-cols-2 sm:gap-5">
        {BOTS.map((b) => {
          const active = !searching && bot === b.id;
          const Icon = b.id === "prod" ? Disc3 : Coffee;
          return (
            <motion.button
              key={b.id}
              type="button"
              onClick={() => {
                setQuery("");
                setBot(b.id);
                setCat("tutte");
                setOpenKey(null);
              }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              aria-pressed={active}
              className={cn(
                "relative overflow-hidden rounded-3xl p-5 text-left ring-1 transition-colors sm:p-6",
                active ? "bg-gradient-to-br from-mocha to-roast ring-caramel/50" : "bg-roast/60 ring-sand/12 hover:ring-sand/30",
              )}
            >
              <motion.div
                className="absolute -right-6 -top-6 text-caramel/10"
                animate={active && b.id === "prod" ? { rotate: 360 } : { rotate: 0 }}
                transition={active && b.id === "prod" ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0.6 }}
              >
                <Icon className="size-32" strokeWidth={1} />
              </motion.div>
              <div className="relative flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-2xl ring-1",
                    active ? "bg-caramel/20 text-ember ring-caramel/40" : "bg-crema/5 text-caramel ring-sand/15",
                  )}
                >
                  <Icon className="size-6" />
                </span>
                <div>
                  <p className="font-display text-3xl font-semibold leading-none">Bot {b.name}</p>
                  <p className="mt-1.5 text-sm text-crema/55">{b.tagline}</p>
                </div>
              </div>
              <div className="relative mt-5 flex items-center gap-3 text-sm">
                <span className="rounded-lg bg-espresso px-2.5 py-1 font-mono text-ember ring-1 ring-caramel/30">
                  prefisso {b.prefix}
                </span>
                <span className="text-crema/50">{total(b.id)} comandi</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* per chi è la vista */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-crema/[0.04] px-4 py-3 text-sm text-crema/65 ring-1 ring-sand/10">
        {personal ? (
          <span>
            Stai vedendo i comandi disponibili per <strong className="text-crema">{user ? displayName(user) : "te"}</strong>, in base ai tuoi ruoli.
          </span>
        ) : (
          <>
            <span>Stai vedendo i comandi pubblici. Accedi per vedere anche quelli riservati ai tuoi ruoli.</span>
            {!token && (
              <button type="button" onClick={login} className="font-semibold text-caramel underline-offset-4 hover:underline">
                Accedi con Discord
              </button>
            )}
          </>
        )}
      </div>

      {/* ricerca */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-crema/40" />
        <input name="wiki-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un comando in entrambi i bot…"
          aria-label="Cerca un comando"
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

      {/* categorie del bot scelto */}
      <LayoutGroup id="wiki-cats">
        <div className={cn("mt-4 flex flex-wrap gap-2 transition-opacity", searching && "pointer-events-none opacity-30")} role="tablist" aria-label="Categorie">
          {[{ id: "tutte", title: "Tutte", commands: cats.flatMap((c) => c.commands) }, ...cats].map((c) => {
            const active = cat === c.id;
            const Icon = c.id === "tutte" ? Sparkles : catIcon(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCat(c.id)}
                className={cn(
                  "relative isolate inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "text-espresso" : "text-crema/70 hover:text-crema",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="wiki-cat-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-full bg-crema/6 ring-1 ring-sand/15" />}
                <Icon className="size-4" />
                {c.title}
                <span className={cn("text-xs tabular-nums", active ? "text-espresso/60" : "text-crema/40")}>{c.commands.length}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {/* il menù */}
      <div className="mt-6 space-y-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {groups.map((g) => {
            const Icon = catIcon(g.id);
            return (
              <motion.section
                key={g.title}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden rounded-3xl bg-gradient-to-b from-mocha/85 to-roast/85 ring-1 ring-sand/12"
              >
                <header className="flex items-center gap-3 border-b border-sand/10 px-4 py-3.5 sm:px-6">
                  <Icon className="size-5 text-caramel" />
                  <h3 className="font-display text-2xl font-semibold">{g.title}</h3>
                  <span className="ml-auto text-xs text-crema/40">{g.rows.length} comandi</span>
                </header>
                <ul>
                  {g.rows.map((r) => {
                    const key = commandAnchor(r.bot, r.cmd.invoke);
                    return (
                      <CommandRow
                        key={key}
                        row={r}
                        query={query}
                        showBot={searching}
                        vip={!!data[r.bot].vipRoleId && r.cmd.roles.includes(data[r.bot].vipRoleId!)}
                        open={openKey === key}
                        onToggle={() => setOpenKey((o) => (o === key ? null : key))}
                      />
                    );
                  })}
                </ul>
              </motion.section>
            );
          })}
        </AnimatePresence>

        {shown.length === 0 && (
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-10 text-center ring-1 ring-sand/12">
            <p className="font-display text-2xl">Nessun comando trovato per “{query}”</p>
            <p className="mt-2 text-crema/60">Prova con il nome del comando senza prefisso, per esempio “play” o “afk”.</p>
          </div>
        )}
      </div>
    </div>
  );
}
