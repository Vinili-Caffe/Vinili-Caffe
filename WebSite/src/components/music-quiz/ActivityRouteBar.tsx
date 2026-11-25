"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setLiveGame } from "@/lib/activityLive";
import { page } from "@/lib/site";
import { ACTIVITY_GAME_KEY, ActivityGameBar, type ActivityGame } from "./ActivityMusicQuizHome";

/**
 * Nell'Attività Discord, sulle pagine fuori dalla home (es. /music-quiz/, un pack):
 * la stessa barra dei giochi, che riporta alla home sul gioco scelto (navigazione interna, niente ricarica).
 * Non nella stanza di una partita, per non uscirne per sbaglio.
 */
export function ActivityRouteBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const path = pathname.replace(/^\/(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)(?=\/|$)/, "") || "/";
  const current: ActivityGame | null = path.startsWith("/music-quiz")
    ? "quiz"
    : path.startsWith("/quiz/numeri")
      ? "numeri"
      : path.startsWith("/quiz/canzone")
        ? "canzone"
        : path.startsWith("/quiz/copertina")
          ? "copertina"
          : path.startsWith("/quiz/angle")
        ? "angolo"
        : path.startsWith("/wordle/quattro")
          ? "quad"
          : path.startsWith("/wordle")
            ? "wordle"
            : null;
  /* Attività: gli altri della chiamata vedono a cosa stai giocando */
  const home = path === "/";
  useEffect(() => {
    if (!home && current) setLiveGame(current);
  }, [home, current]);
  if (home || path.startsWith("/music-quiz/party")) return null;
  return (
    <ActivityGameBar
      game={current}
      onPick={(g) => {
        try {
          sessionStorage.setItem(ACTIVITY_GAME_KEY, g);
        } catch {
          /* ignore */
        }
        router.push(page("/"));
      }}
    />
  );
}
