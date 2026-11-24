"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpDown, Grid2x2, Music2, SpellCheck } from "lucide-react";
import { NumberQuizNav } from "@/components/number-quiz/NumberQuizNav";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { isDiscordActivity } from "@/lib/discordActivity";
import { cn } from "@/lib/cn";

const MusicQuizHub = dynamic(() => import("@/components/music-quiz/MusicQuizHub").then((m) => m.MusicQuizHub));
const WordleBoard = dynamic(() => import("@/components/wordle/WordleBoard").then((m) => m.WordleBoard), { loading: () => null });
const NumberQuizHub = dynamic(() => import("@/components/number-quiz/NumberQuizHub").then((m) => m.NumberQuizHub), { loading: () => null });
const NumberQuizPlay = dynamic(() => import("@/components/number-quiz/NumberQuizPlay").then((m) => m.NumberQuizPlay), { loading: () => null });
const WordleQuadBoard = dynamic(() => import("@/components/wordle/WordleQuadBoard").then((m) => m.WordleQuadBoard), {
  loading: () => null,
});

type Game = "quiz" | "numeri" | "wordle" | "quad";

const GAMES: { id: Game; label: string; icon: React.ReactNode }[] = [
  { id: "quiz", label: "Music Quiz", icon: <Music2 className="size-4" /> },
  { id: "numeri", label: "Number Quiz", icon: <ArrowUpDown className="size-4" /> },
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
  const [opened, setOpened] = useState<Record<Game, boolean>>({ quiz: true, numeri: false, wordle: false, quad: false });
  /* Number Quiz: categoria aperta (null = elenco), senza cambiare pagina */
  const [numCat, setNumCat] = useState<string | null>(null);
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
              {/* su schermi stretti il nome si vede solo sul gioco scelto */}
              <span className={cn("relative", game === g.id ? "" : "hidden sm:inline")}>{g.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className={game === "quiz" ? undefined : "hidden"}>
        <MusicQuizGate>
          <MusicQuizHub />
        </MusicQuizGate>
      </div>
      {opened.numeri ? (
        <div className={cn("pt-2", game === "numeri" ? undefined : "hidden")}>
          <NumberQuizNav.Provider value={{ list: () => setNumCat(null), open: (id) => { setNumCat(id); window.scrollTo({ top: 0 }); } }}>
            <Suspense fallback={null}>{numCat ? <NumberQuizPlay key={numCat} catId={numCat} /> : <NumberQuizHub />}</Suspense>
          </NumberQuizNav.Provider>
        </div>
      ) : null}
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
