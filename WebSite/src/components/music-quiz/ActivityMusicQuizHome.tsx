"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowUpDown, Compass, Disc3, Grid2x2, Image as ImageIcon, Music2, SpellCheck, Swords, X } from "lucide-react";
import { NumberQuizNav } from "@/components/number-quiz/NumberQuizNav";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { activityCustomId, activityInstanceId, isDiscordActivity } from "@/lib/discordActivity";
import { setLiveGame } from "@/lib/activityLive";
import { useAuth } from "@/lib/auth";
import { DUEL_LABEL, duelToken, loadCallDuels, sentCallIds, type CallDuel, type DuelGame } from "@/lib/duel";
import { cn } from "@/lib/cn";

const MusicQuizHub = dynamic(() => import("@/components/music-quiz/MusicQuizHub").then((m) => m.MusicQuizHub));
const WordleModes = dynamic(() => import("@/components/duel/WordleModes").then((m) => m.WordleModes), { loading: () => null });
const NumberQuizHub = dynamic(() => import("@/components/number-quiz/NumberQuizHub").then((m) => m.NumberQuizHub), { loading: () => null });
const NumberQuizPlay = dynamic(() => import("@/components/number-quiz/NumberQuizPlay").then((m) => m.NumberQuizPlay), { loading: () => null });
const DailyMusicGame = dynamic(() => import("@/components/daily/DailyMusicGame").then((m) => m.DailyMusicGame), { loading: () => null });
const AngleGame = dynamic(() => import("@/components/angle/AngleGame").then((m) => m.AngleGame), { loading: () => null });

export type ActivityGame = "quiz" | "numeri" | "angolo" | "wordle" | "quad" | "canzone" | "copertina";
type Game = ActivityGame;
/** gioco scelto dalla barra mentre si era su un'altra pagina (es. /music-quiz/): la home lo apre */
export const ACTIVITY_GAME_KEY = "vc_activity_game";

const GAMES: { id: Game; label: string; icon: React.ReactNode }[] = [
  { id: "quiz", label: "Music Quiz", icon: <Music2 className="size-4" /> },
  { id: "numeri", label: "Number Quiz", icon: <ArrowUpDown className="size-4" /> },
  { id: "angolo", label: "Angle", icon: <Compass className="size-4" /> },
  { id: "wordle", label: "Wordle", icon: <SpellCheck className="size-4" /> },
  { id: "quad", label: "Quordle", icon: <Grid2x2 className="size-4" /> },
  { id: "canzone", label: "Canzone", icon: <Disc3 className="size-4" /> },
  { id: "copertina", label: "Copertina", icon: <ImageIcon className="size-4" /> },
];

/** la barra dei giochi in alto nell'Attività (anche sulle pagine del Music Quiz) */
export function ActivityGameBar({ game, onPick }: { game: Game | null; onPick: (g: Game) => void }) {
  return (
    <nav aria-label="Giochi" className="sticky top-0 z-40 flex justify-center px-4 pb-2 pt-3">
      <div className="flex gap-1 rounded-full bg-espresso/85 p-1 ring-1 ring-sand/15 backdrop-blur-xl">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g.id)}
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
  );
}

/**
 * Nell'Attività Discord non si può fare location.replace verso altre pagine:
 * READY dell'SDK arriva una sola volta per iframe — un reload lascia ready() appeso.
 * Quindi sulla home (entry tipica del proxy discordsays) si montano i giochi qui, con un selettore in alto.
 * Il quiz resta montato anche quando si passa al Wordle, così la stanza non si perde.
 */
export function ActivityMusicQuizHome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false);
  const [game, setGame] = useState<Game>("quiz");
  const [opened, setOpened] = useState<Record<Game, boolean>>({ quiz: true, numeri: false, angolo: false, wordle: false, quad: false, canzone: false, copertina: false });
  /* Number Quiz: categoria aperta (null = elenco), senza cambiare pagina */
  const [numCat, setNumCat] = useState<string | null>(null);
  /* sfida aperta (link condiviso su Discord o avviso dalla chiamata): una per gioco */
  const [duelIds, setDuelIds] = useState<Partial<Record<DuelGame, string>>>({});
  /* vecchi link «indovina il mio angolo» */
  const [angleChallenge, setAngleChallenge] = useState<string | null>(null);

  function openDuel(g: DuelGame, id: string) {
    setDuelIds((d) => ({ ...d, [g]: id }));
    pick(g === "angle" ? "angolo" : g);
  }

  useEffect(() => {
    setActivity(isDiscordActivity());
    try {
      const want = sessionStorage.getItem(ACTIVITY_GAME_KEY) as Game | null;
      sessionStorage.removeItem(ACTIVITY_GAME_KEY);
      if (want && GAMES.some((g) => g.id === want)) {
        setGame(want);
        setOpened((o) => ({ ...o, [want]: true }));
      }
    } catch {
      /* ignore */
    }
    const id = activityCustomId();
    const duel = id?.match(/^duel-(wordle|quad|angle)-([\w-]+)$/);
    if (duel) openDuel(duel[1] as DuelGame, duel[2]);
    else if (id?.startsWith("angolo-")) {
      setAngleChallenge(id.slice(7));
      pick("angolo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* sfide mandate da chi è nella stessa chiamata: avviso in basso, con chi ti sfida */
  const { user } = useAuth();
  const myId = user?.id || "";
  const [incoming, setIncoming] = useState<CallDuel | null>(null);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!activity) return;
    const instance = activityInstanceId();
    if (!instance) return;
    let alive = true;
    const tick = async () => {
      const list = await loadCallDuels(instance);
      if (!alive) return;
      if (!seen.current) {
        /* all'apertura: valgono solo quelle degli ultimi minuti */
        seen.current = new Set(list.filter((c) => Date.now() - c.at > 3 * 60_000).map((c) => c.id));
      }
      /* non le proprie (create qui o su questo dispositivo) */
      const fresh = list.filter((c) => !seen.current!.has(c.id) && !sentCallIds.has(c.id) && !duelToken(c.duel) && (!myId || c.fromId !== myId));
      const last = fresh[fresh.length - 1];
      if (last) {
        for (const c of fresh) seen.current.add(c.id);
        setIncoming(last);
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 4000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [activity, myId]);

  function playIncoming() {
    if (!incoming) return;
    openDuel(incoming.game, incoming.duel);
    setIncoming(null);
  }

  /* Attività: gli altri della chiamata vedono a cosa stai giocando */
  useEffect(() => {
    if (activity) setLiveGame(game);
  }, [activity, game]);

  function pick(g: Game) {
    setGame(g);
    setOpened((o) => (o[g] ? o : { ...o, [g]: true }));
    window.scrollTo({ top: 0 });
  }

  if (!activity) return <>{children}</>;

  return (
    <>
      <AnimatePresence>
        {incoming ? (
          <motion.div
            key={incoming.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-roast/95 p-3 pl-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-caramel/35 backdrop-blur-xl"
          >
            {incoming.fromAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={incoming.fromAvatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <Swords className="size-5 shrink-0 text-caramel" />
            )}
            <p className="min-w-0 flex-1 text-sm text-crema">
              <b>{incoming.fromName || "Qualcuno"}</b> ti sfida a <b>{DUEL_LABEL[incoming.game]}</b>: vince chi indovina per primo
            </p>
            <button type="button" onClick={playIncoming} className="h-9 shrink-0 rounded-xl bg-caramel px-4 text-xs font-bold uppercase tracking-wide text-ink">
              Gioca
            </button>
            <button type="button" onClick={() => setIncoming(null)} aria-label="Chiudi" className="grid size-8 shrink-0 place-items-center rounded-lg text-crema/50 hover:text-crema">
              <X className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ActivityGameBar game={game} onPick={pick} />

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
      {/* Angle, Wordle e Quordle restano montati solo mentre si vedono: ognuno ascolta la tastiera */}
      {game === "angolo" ? (
        <div className="pt-2">
          <Suspense fallback={null}>
            <AngleGame key={duelIds.angle || "angle"} challengeCode={angleChallenge} duelId={duelIds.angle} />
          </Suspense>
        </div>
      ) : null}
      {game === "wordle" ? (
        <div className="mx-auto max-w-3xl pt-2">
          <WordleModes key={duelIds.wordle || "wordle"} game="wordle" duelId={duelIds.wordle} />
        </div>
      ) : null}
      {game === "canzone" || game === "copertina" ? (
        <div className="pt-2">
          <DailyMusicGame key={game} kind={game === "canzone" ? "song" : "cover"} />
        </div>
      ) : null}
      {game === "quad" ? (
        <div className="mx-auto max-w-3xl pt-2">
          <WordleModes key={duelIds.quad || "quad"} game="quad" duelId={duelIds.quad} />
        </div>
      ) : null}
    </>
  );
}
