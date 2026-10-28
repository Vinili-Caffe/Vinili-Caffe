"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BOT_FAQ_CATEGORIES, BOT_FAQ_ITEMS } from "@/lib/bot-faq";
import { cn } from "@/lib/cn";

/** FAQ dashboard: categorie a linguette + una risposta alla volta (come bot-faq-page.js). */
export function BotFaqBrowser() {
  const [cat, setCat] = useState(BOT_FAQ_CATEGORIES[0]?.id ?? "");
  const inCat = useMemo(() => BOT_FAQ_ITEMS.filter((i) => i.category === cat), [cat]);
  const [qi, setQi] = useState(0);
  const item = inCat[Math.min(qi, Math.max(0, inCat.length - 1))] ?? null;

  const pickCat = (id: string) => {
    setCat(id);
    setQi(0);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-crema/45">
        Scegli una categoria con le linguette qui sotto. Se ci sono più domande, scegli con lo switcher sotto e leggi la risposta.
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Categorie FAQ">
        {BOT_FAQ_CATEGORIES.map((c) => {
          const on = c.id === cat;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickCat(c.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                on ? "bg-caramel/20 text-ember ring-1 ring-caramel/35" : "bg-crema/5 text-crema/60 ring-1 ring-sand/12 hover:text-crema",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {inCat.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Domande">
          {inCat.map((q, i) => (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={i === qi}
              onClick={() => setQi(i)}
              className={cn(
                "max-w-full truncate rounded-md px-2.5 py-1 text-left text-[0.7rem] font-medium transition-colors sm:max-w-xs",
                i === qi ? "bg-crema/12 text-crema ring-1 ring-sand/20" : "text-crema/50 hover:bg-crema/6 hover:text-crema/80",
              )}
              title={q.title}
            >
              {q.title}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {item ? (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast p-4 ring-1 ring-sand/12 sm:p-5"
          >
            <h2 className="font-display text-xl font-semibold leading-snug text-crema sm:text-2xl">{item.title}</h2>
            <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">Risposta</p>
            <div className="mt-2 min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-crema/75 [overflow-wrap:anywhere]">{item.body}</div>
          </motion.article>
        ) : (
          <p className="rounded-2xl bg-roast/50 px-4 py-8 text-center text-sm text-crema/50 ring-1 ring-sand/10">
            Nessuna domanda in questa categoria.
          </p>
        )}
      </AnimatePresence>
    </div>
  );
}
