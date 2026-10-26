"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ghost, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchContestHighlight, type ContestHighlight } from "@/lib/contest";
import { SmartLink } from "@/components/SmartLink";

/** Card contest in home: chiudi con X, ma ricompare a ogni visita home (solo state locale). */
export function ContestHomeCard() {
  const { token } = useAuth();
  const [item, setItem] = useState<ContestHighlight | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchContestHighlight(token).then((h) => {
      if (alive) setItem(h);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const show = Boolean(item && !closed);

  return (
    <AnimatePresence>
      {show && item && (
        <motion.aside
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto fixed right-4 bottom-4 z-[56] w-[min(20.5rem,calc(100vw-2rem))] sm:right-5 sm:bottom-5"
          role="dialog"
          aria-label={item.title}
        >
          <div className="relative overflow-hidden rounded-2xl bg-espresso/95 p-4 text-crema shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] ring-1 ring-sand/25">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(194,122,66,0.22),transparent_55%)]"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="absolute top-2.5 right-2.5 z-10 inline-flex size-8 items-center justify-center rounded-full bg-crema/8 text-crema/70 ring-1 ring-crema/15 transition-colors hover:bg-crema/15 hover:text-crema"
              aria-label="Chiudi"
            >
              <X className="size-4" strokeWidth={2.25} />
            </button>
            <div className="relative pr-8">
              <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-caramel uppercase">
                <Ghost className="size-3.5" />
                {item.phase === "after" ? "Classifica" : "In corso"}
              </p>
              <h2 className="font-display text-lg leading-snug text-crema">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-crema/65">{item.blurb}</p>
              <SmartLink
                href={item.href || `/contest/${item.eventKey}/`}
                className="mt-3.5 inline-flex items-center justify-center rounded-full bg-caramel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-sand"
              >
                {item.cta || (item.phase === "after" ? "Vedi classifica" : "Partecipa")}
              </SmartLink>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
