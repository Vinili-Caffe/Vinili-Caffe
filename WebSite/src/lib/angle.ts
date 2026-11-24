/** Angolo: angolo del giorno, link di sfida e salvataggio del risultato. */

export const ANGLE_ATTEMPTS = 4;
/** vale come indovinato entro questi gradi (uguale sul server) */
export const ANGLE_TOLERANCE = 2;

/** stesso calcolo del server (Bots/src/Vinili/site/http/siteAngleApi.ts): FNV-1a sul giorno → 10°–350° */
export function dailyAngle(day: string) {
  let h = 0x811c9dc5;
  for (const ch of `${day}|vc-angolo`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 10 + (h % 341);
}

/** il giorno di Roma (uguale per tutti, anche sul server) */
export function romeDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** numero del gioco (come «Angolo #42») contato dal primo giorno */
export function dayNumber(day: string) {
  return Math.floor((Date.parse(`${day}T12:00:00Z`) - Date.parse("2026-11-25T12:00:00Z")) / 86_400_000) + 1;
}

/* link di sfida: l'angolo non si legge a occhio nell'indirizzo */
export function encodeChallenge(angle: number) {
  return ((Math.round(angle) * 7919 + 4242) % 1_000_003).toString(36);
}
export function decodeChallenge(code: string) {
  const n = parseInt(String(code || ""), 36);
  if (!Number.isFinite(n)) return null;
  for (let a = 1; a <= 359; a++) if ((a * 7919 + 4242) % 1_000_003 === n) return a;
  return null;
}

export type AngleStats = { played: number; won: number; streak: number; maxStreak: number; lastDay: string; dist: Record<string, number> };
export type AngleReward = { auth: "guest" | "outsider" | "member"; exp: number; capped?: boolean };

export async function postAngleResult(token: string | null | undefined, day: string, guesses: number[]) {
  try {
    const r = await fetch("/webhooks/site-angle/result", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ day, guesses }),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; stats?: AngleStats; reward?: AngleReward; already?: boolean } | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export async function loadAngleMe(token: string) {
  try {
    const r = await fetch("/webhooks/site-angle/me", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; stats?: AngleStats; today?: { attempts: number; solved: boolean } | null } | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/* partita del giorno salvata nel browser (anche senza accesso) */
const KEY = "vc-angolo-v1";
export function readLocalDay(day: string): number[] | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Array.isArray(all?.[day]) ? all[day] : null;
  } catch {
    return null;
  }
}
export function writeLocalDay(day: string, guesses: number[]) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    all[day] = guesses;
    for (const k of Object.keys(all).sort().slice(0, -14)) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* senza memoria la partita vale solo adesso */
  }
}
