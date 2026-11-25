/**
 * Attività Discord: a cosa stai giocando, per la barra «In chiamata» degli altri.
 * Si manda solo un'anteprima ridotta: colori senza lettere, numero di tentativi, serie.
 * Mai parole, gradi o risposte (per privacy e per non aiutare gli altri).
 */
import { isDiscordActivity } from "@/lib/discordActivity";
import type { Mark } from "@/lib/wordle";

export type LiveGame = "quiz" | "numeri" | "angolo" | "wordle" | "quad" | "canzone" | "copertina";
export type LivePreview = {
  game: LiveGame;
  mode?: "daily" | "practice" | "duel" | "stream" | "party" | "solo";
  grids?: Mark[][][];
  attempts?: number;
  max?: number;
  solved?: boolean;
  done?: boolean;
  streak?: number;
};
export type LivePlayer = { userId: string; name: string; avatar: string; preview: LivePreview };

let current: LivePreview = { game: "quiz" };
const listeners = new Set<() => void>();

export function getLivePreview() {
  return current;
}
export function onLivePreview(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** un gioco racconta come sta andando (solo nell'Attività) */
export function reportLive(next: LivePreview) {
  if (typeof window === "undefined" || !isDiscordActivity()) return;
  const same = JSON.stringify(next) === JSON.stringify(current);
  current = next;
  if (!same) for (const fn of listeners) fn();
}

/** cambio di gioco dalla barra in alto: si riparte da «sta giocando a …» */
export function setLiveGame(game: LiveGame) {
  if (current.game === game) return;
  reportLive({ game });
}

export async function postLive(token: string, instanceId: string, preview: LivePreview | null) {
  try {
    await fetch("/webhooks/site-activity/live", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ instanceId, preview }),
      cache: "no-store",
    });
  } catch {
    /* si riprova al giro dopo */
  }
}

export async function loadLive(instanceId: string): Promise<LivePlayer[]> {
  try {
    const r = await fetch(`/webhooks/site-activity/live/${encodeURIComponent(instanceId)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; players?: LivePlayer[] } | null;
    return data?.ok && Array.isArray(data.players) ? data.players : [];
  } catch {
    return [];
  }
}
