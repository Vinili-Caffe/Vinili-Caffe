"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

type Card = { href: string; title: string; text: string; note?: string; icon: React.ReactNode };

/** Le schede della pagina /quiz/: un quiz per scheda. */
export function QuizHubCards({ cards }: { cards: Card[] }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2">
      {cards.map((c, i) => (
        <motion.div key={c.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
          <SmartLink
            href={page(c.href)}
            className="group flex h-full flex-col rounded-3xl bg-roast/75 p-6 ring-1 ring-sand/12 transition  hover:ring-caramel/45"
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-caramel text-ink shadow-[0_12px_30px_-14px_rgba(0,0,0,0.55)]">
              {c.icon}
            </span>
            <span className="mt-5 font-display text-2xl text-crema">{c.title}</span>
            <span className="mt-1.5 flex-1 text-sm text-crema/60">{c.text}</span>
            <span className="mt-5 flex items-center justify-between gap-3">
              <span className="text-xs text-crema/40">{c.note}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-crema/[0.07] px-4 py-2 text-xs font-semibold text-crema ring-1 ring-sand/15 transition group-hover:bg-caramel group-hover:text-ink">
                Gioca <ArrowRight className="size-4" />
              </span>
            </span>
          </SmartLink>
        </motion.div>
      ))}
    </div>
  );
}
