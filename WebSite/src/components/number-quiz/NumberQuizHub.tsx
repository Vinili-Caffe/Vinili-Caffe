"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flame, Layers, Loader2, Search, X } from "lucide-react";
import { NQLink } from "./NumberQuizNav";
import { cn } from "@/lib/cn";
import { formatCount, listNumberQuizCategories, readBest, type NumberQuizCategory } from "@/lib/numberQuiz";

export function NumberQuizHub() {
  const [cats, setCats] = useState<NumberQuizCategory[] | null>(null);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("Tutte");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    void listNumberQuizCategories().then((r) => {
      if (!alive) return;
      if (r.ok) setCats(r.data.categories);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, []);

  const topics = useMemo(() => ["Tutte", ...new Set((cats || []).map((c) => c.topic))], [cats]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (cats || []).filter(
      (c) =>
        (topic === "Tutte" || c.topic === topic) &&
        (!needle || `${c.title} ${c.description} ${c.topic}`.toLowerCase().includes(needle)),
    );
  }, [cats, topic, q]);
  const total = (cats || []).reduce((s, c) => s + c.count, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20">
      {cats ? (
        <p className="mb-5 text-center text-sm text-crema/55">
          <span className="font-semibold text-caramel">{cats.length} categorie</span> e{" "}
          <span className="font-semibold text-caramel">{formatCount(total)}</span> voci da confrontare
        </p>
      ) : null}

      <div className="mb-6 space-y-3">
        <label className="relative block">
          <span className="sr-only">Cerca una categoria</span>
          <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-crema/45" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca: montagne, anime, film, Pokémon…"
            className="h-13 w-full rounded-full border-0 bg-roast/90 py-3.5 pl-14 pr-12 text-base text-crema outline-none ring-1 ring-sand/20 transition placeholder:text-crema/40 focus:ring-2 focus:ring-caramel/60"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Cancella la ricerca" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/50 hover:text-crema">
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide ring-1 transition",
                topic === t ? "text-ink ring-caramel" : "text-crema/65 ring-sand/15 hover:text-crema",
              )}
            >
              {topic === t ? <motion.span layoutId="nq-topic" className="absolute inset-0 rounded-full bg-caramel" /> : null}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-3xl bg-roast/60 px-5 py-6 text-center text-sm text-crema/60">{error}</p> : null}

      {!cats && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-crema/[0.05]" />
          ))}
        </div>
      ) : null}

      <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((c, i) => (
            <CategoryCard key={c.id} c={c} i={i} />
          ))}
        </AnimatePresence>
      </motion.div>
      {cats && !shown.length ? <p className="py-10 text-center text-sm text-crema/55">Nessuna categoria trovata.</p> : null}
    </div>
  );
}

function CategoryCard({ c, i }: { c: NumberQuizCategory; i: number }) {
  const [best, setBest] = useState(0);
  useEffect(() => setBest(readBest(c.id, "hl")), [c.id]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: Math.min(i, 9) * 0.03, type: "spring", stiffness: 300, damping: 30 }}
    >
      <NQLink
        to={{ cat: c.id }}
        className="group relative block aspect-[4/3] w-full text-left overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/12 transition hover:-translate-y-1 hover:ring-caramel/50 hover:shadow-[0_24px_50px_-24px_rgba(214,154,95,0.6)]"
      >
        {c.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.cover}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-85"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-roast via-espresso to-ink text-7xl opacity-60">{c.emoji}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/5" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-crema/85 ring-1 ring-sand/15 backdrop-blur">
          <span aria-hidden>{c.emoji}</span> {c.topic}
        </span>
        {best ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-caramel/90 px-2.5 py-1 text-[11px] font-bold text-ink">
            <Flame className="size-3" /> {best}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-display text-xl leading-tight text-crema drop-shadow sm:text-2xl">{c.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-crema/70">{c.description}</p>
          <p className="mt-2 flex items-center gap-3 text-xs font-semibold text-crema/55">
            {c.ready ? (
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5" /> {formatCount(c.count)} voci
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-caramel">
                <Loader2 className="size-3.5 animate-spin" /> In preparazione
              </span>
            )}
            {c.plays ? <span>{formatCount(c.plays)} partite</span> : null}
          </p>
        </div>
      </NQLink>
    </motion.div>
  );
}
