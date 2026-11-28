"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Dices, Sun, Swords } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { parseLang, type WordleToday } from "@/lib/wordle";
import type { QuadToday } from "@/lib/wordleQuad";
import { cn } from "@/lib/cn";

const WordleBoard = dynamic(() => import("@/components/wordle/WordleBoard").then((m) => m.WordleBoard), { loading: () => null });
const WordleQuadBoard = dynamic(() => import("@/components/wordle/WordleQuadBoard").then((m) => m.WordleQuadBoard), { loading: () => null });
const WordleDuel = dynamic(() => import("@/components/duel/WordleDuel").then((m) => m.WordleDuel), { loading: () => null });

type Mode = "daily" | "practice" | "duel";

/**
 * Wordle e Quordle: la partita del giorno (con EXP), l'allenamento (parole a caso) e la sfida a un amico.
 * duelId: sfida aperta da un link (sul sito arriva da ?d=…, nell'Attività dal link condiviso su Discord).
 */
export function WordleModes({
  game,
  initial = null,
  quadInitial = null,
  duelId,
}: {
  game: "wordle" | "quad";
  initial?: WordleToday | null;
  quadInitial?: QuadToday | null;
  duelId?: string | null;
}) {
  const { locale } = useI18n();
  const lang = parseLang(locale);
  const [mode, setMode] = useState<Mode>(duelId ? "duel" : "daily");
  const [joinId, setJoinId] = useState<string | null>(duelId || null);
  /* ogni partita nuova riparte da zero */
  const [round, setRound] = useState(0);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("d");
    const id = duelId || fromUrl;
    if (id) {
      setJoinId(id);
      setMode("duel");
    }
  }, [duelId]);

  const tabs: Array<{ id: Mode; label: string; icon: React.ReactNode }> = [
    { id: "daily", label: "Del giorno", icon: <Sun className="size-4" /> },
    { id: "practice", label: "Allenamento", icon: <Dices className="size-4" /> },
    { id: "duel", label: "Sfida un amico", icon: <Swords className="size-4" /> },
  ];

  function pick(m: Mode) {
    setMode(m);
    if (m !== "duel") setJoinId(null);
    setRound((r) => r + 1);
  }

  return (
    <div>
      <div className="mx-auto mb-6 flex max-w-lg gap-1 rounded-2xl bg-ink/50 p-1 ring-1 ring-sand/15">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm",
              mode === t.id ? "text-ink" : "text-crema/65 hover:text-crema",
            )}
          >
            {mode === t.id ? <motion.span layoutId={`${game}-mode-tab`} className="absolute inset-0 rounded-xl bg-caramel" /> : null}
            <span className="relative">{t.icon}</span>
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      {/* una sola modalità montata: ognuna ascolta la tastiera */}
      {mode === "daily" ? (
        game === "quad" ? (
          <WordleQuadBoard initial={quadInitial} />
        ) : (
          <WordleBoard initial={initial} />
        )
      ) : (
        <WordleDuel key={`${mode}-${round}-${joinId || ""}`} game={game} mode={mode} lang={lang} joinId={mode === "duel" ? joinId : null} />
      )}
    </div>
  );
}
