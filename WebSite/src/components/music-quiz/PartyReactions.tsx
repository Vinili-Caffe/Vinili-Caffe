"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MUSIC_QUIZ_PARTY_REACTIONS, type MusicQuizPartyReaction } from "@/lib/musicQuiz";

/** Barra delle reazioni durante la partita. */
export function ReactionBar({ onReact, disabled }: { onReact: (emoji: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reazioni">
      {MUSIC_QUIZ_PARTY_REACTIONS.map((e) => (
        <motion.button
          key={e}
          type="button"
          disabled={disabled}
          whileTap={{ scale: 0.8 }}
          onClick={() => onReact(e)}
          className="grid size-10 place-items-center rounded-xl bg-crema/[0.06] text-xl ring-1 ring-sand/10 transition hover:bg-crema/[0.12] disabled:opacity-40"
          aria-label={`Reazione ${e}`}
        >
          {e}
        </motion.button>
      ))}
    </div>
  );
}

/** Le reazioni di tutti salgono dal basso dello schermo e svaniscono. */
export function FloatingReactions({ reactions, me }: { reactions: MusicQuizPartyReaction[]; me: string }) {
  const shown = useRef(new Set<string>());
  const [items, setItems] = useState<Array<MusicQuizPartyReaction & { x: number }>>([]);

  useEffect(() => {
    const fresh = reactions.filter((r) => !shown.current.has(r.id));
    if (!fresh.length) return;
    for (const r of fresh) shown.current.add(r.id);
    setItems((prev) => [...prev, ...fresh.map((r) => ({ ...r, x: 8 + Math.random() * 84 }))].slice(-30));
    const ids = fresh.map((r) => r.id);
    const t = window.setTimeout(() => setItems((prev) => prev.filter((p) => !ids.includes(p.id))), 3200);
    return () => window.clearTimeout(t);
  }, [reactions]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] h-2/3 overflow-hidden">
      <AnimatePresence>
        {items.map((r) => (
          <motion.div
            key={r.id}
            initial={{ y: 40, opacity: 0, scale: 0.6 }}
            animate={{ y: -420, opacity: [0, 1, 1, 0], scale: 1.1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: "easeOut" }}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: `${r.x}%` }}
          >
            <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
            <span className="mt-0.5 max-w-[7rem] truncate rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-semibold text-crema">
              {r.userId === me ? "tu" : r.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
