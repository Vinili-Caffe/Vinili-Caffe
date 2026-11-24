"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Grid2x2, Music2, SpellCheck } from "lucide-react";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { isDiscordActivity } from "@/lib/discordActivity";
import { cn } from "@/lib/cn";

const MusicQuizHub = dynamic(() => import("@/components/music-quiz/MusicQuizHub").then((m) => m.MusicQuizHub));
const WordleBoard = dynamic(() => import("@/components/wordle/WordleBoard").then((m) => m.WordleBoard), { loading: () => null });
const WordleQuadBoard = dynamic(() => import("@/components/wordle/WordleQuadBoard").then((m) => m.WordleQuadBoard), {
  loading: () => null,
});

type Game = "quiz" | "wordle" | "quad";

const GAMES: { id: Game; label: string; icon: React.ReactNode }[] = [
  { id: "quiz", label: "Music Quiz", icon: <Music2 className="size-4" /> },
  { id: "wordle", label: "Wordle", icon: <SpellCheck className="size-4" /> },
  { id: "quad", label: "Wordle ×4", icon: <Grid2x2 className="size-4" /> },
];

/**
 * Nell'Attività Discord non si può fare location.replace verso altre pagine:
 * READY dell'SDK arriva una sola volta per iframe — un reload lascia ready() appeso.
 * Quindi sulla home (entry tipica del proxy discordsays) si montano i giochi qui, con un selettore in alto.
 * Il quiz resta montato anche quando si passa al Wordle, così la stanza non si perde.
 */
export function ActivityMusicQuizHome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false);
  const [game, setGame] = useState<Game>("quiz");
  const [opened, setOpened] = useState<Record<Game, boolean>>({ quiz: true, wordle: false, quad: false });
  useEffect(() => {
    setActivity(isDiscordActivity());
  }, []);

  function pick(g: Game) {
    setGame(g);
    setOpened((o) => (o[g] ? o : { ...o, [g]: true }));
    window.scrollTo({ top: 0 });
  }

  if (!activity) return <>{children}</>;

  return (
    <>
      <nav aria-label="Giochi" className="sticky top-0 z-40 flex justify-center px-4 pb-2 pt-3">
        <div className="flex gap-1 rounded-full bg-espresso/85 p-1 ring-1 ring-sand/15 backdrop-blur-xl">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => pick(g.id)}
              aria-current={game === g.id ? "page" : undefined}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold uppercase tracking-wide transition sm:px-4",
                game === g.id ? "text-ink" : "text-crema/60 hover:text-crema",
              )}
            >
              {game === g.id ? <motion.span layoutId="activity-game" className="absolute inset-0 rounded-full bg-caramel" /> : null}
              <span className="relative">{g.icon}</span>
              <span className="relative">{g.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className={game === "quiz" ? undefined : "hidden"}>
        <MusicQuizGate>
          <MusicQuizHub />
        </MusicQuizGate>
      </div>
      {opened.wordle ? (
        <div className={cn("mx-auto max-w-3xl pt-2", game === "wordle" ? undefined : "hidden")}>
          <WordleBoard initial={null} />
        </div>
      ) : null}
      {opened.quad ? (
        <div className={cn("mx-auto max-w-3xl pt-2", game === "quad" ? undefined : "hidden")}>
          <WordleQuadBoard initial={null} />
        </div>
      ) : null}
    </>
  );
}
