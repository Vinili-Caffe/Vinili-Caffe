/**
 * Allenamento e sfide a un amico (Wordle, Quordle, Angle).
 * Sfida: anonima per entrambi, stessa parola o angolo, vince chi indovina per primo. Niente EXP.
 */
import type { Mark } from "@/lib/wordle";

export type DuelGame = "wordle" | "quad" | "angle";
export type DuelBoard = { rows: { guess: string; marks: Mark[] }[]; won: boolean };
export type DuelState = {
  ok: true;
  id: string;
  game: DuelGame;
  mode: "duel" | "practice";
  lang: string;
  status: "waiting" | "playing" | "finished";
  maxAttempts: number;
  boards?: DuelBoard[];
  angle?: number;
  rotation?: number;
  guesses?: number[];
  me: { attempts: number; solved: boolean; done: boolean };
  opponent: { attempts: number; solved: boolean; done: boolean } | null;
  result: "win" | "lose" | "draw" | null;
  answers?: string[];
  token?: string;
};
type Err = { ok: false; error?: string; message?: string };

const KEY = "vc-duel-tokens";

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}
export function duelToken(id: string) {
  return readTokens()[id] || "";
}
function saveToken(id: string, token: string) {
  try {
    const all = readTokens();
    all[id] = token;
    /* si tengono solo le ultime 40 */
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* senza memoria vale solo in questa pagina */
  }
}

async function call(path: string, init?: RequestInit): Promise<DuelState | Err> {
  try {
    const r = await fetch(`/webhooks/site-duel${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as DuelState | Err | null;
    if (!data) return { ok: false, error: "network" };
    if (data.ok && data.token) saveToken(data.id, data.token);
    return data;
  } catch {
    return { ok: false, error: "network" };
  }
}

export const createDuel = (game: DuelGame, mode: "duel" | "practice", lang: string) =>
  call("/create", { method: "POST", body: JSON.stringify({ game, mode, lang }) });

export const joinDuel = (id: string) =>
  call(`/${encodeURIComponent(id)}/join`, { method: "POST", body: JSON.stringify({ token: duelToken(id) }) });

export const getDuel = (id: string) => call(`/${encodeURIComponent(id)}?t=${encodeURIComponent(duelToken(id))}`);

export const guessDuel = (id: string, guess: string | number) =>
  call(`/${encodeURIComponent(id)}/guess`, { method: "POST", body: JSON.stringify({ token: duelToken(id), guess }) });

/** indirizzo della pagina del gioco con la sfida */
export function duelPath(game: DuelGame, id: string) {
  const base = game === "angle" ? "/quiz/angle/" : game === "quad" ? "/wordle/quattro/" : "/wordle/";
  return `${base}?d=${encodeURIComponent(id)}`;
}

export const DUEL_LABEL: Record<DuelGame, string> = { wordle: "Wordle", quad: "Quordle", angle: "Angle" };

/* ───── Attività Discord: la sfida arriva a chi è già nella stessa chiamata (senza nomi) ───── */
export type CallDuel = { id: string; game: DuelGame; duel: string; at: number };

export async function sendDuelToCall(instanceId: string, duel: string) {
  try {
    const r = await fetch("/webhooks/site-duel/call", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, duel }),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; id?: string } | null;
    if (data?.ok && data.id) sentCallIds.add(data.id);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/** sfide mandate da questo dispositivo: non si avvisa chi le ha mandate */
export const sentCallIds = new Set<string>();

export async function loadCallDuels(instanceId: string): Promise<CallDuel[]> {
  try {
    const r = await fetch(`/webhooks/site-duel/call/${encodeURIComponent(instanceId)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; challenges?: CallDuel[] } | null;
    return data?.ok && Array.isArray(data.challenges) ? data.challenges : [];
  } catch {
    return [];
  }
}
