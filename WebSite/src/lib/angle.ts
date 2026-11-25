/** Angolo: angolo del giorno, link di sfida e salvataggio del risultato. */

export const ANGLE_ATTEMPTS = 4;
/** vale come indovinato entro questi gradi (uguale sul server) */
export const ANGLE_TOLERANCE = 2;

function fnv(text: string) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** stesso calcolo del server (Bots/src/Vinili/site/http/siteAngleApi.ts): FNV-1a sul giorno → angolo interno 10°–170° */
export function dailyAngle(day: string) {
  return 10 + (fnv(`${day}|vc-angolo`) % 161);
}

/** di quanto è girata la figura (così il primo braccio non è sempre orizzontale) */
export function dailyRotation(day: string) {
  return fnv(`${day}|vc-angolo-giro`) % 360;
}
/** rotazione fissa per un angolo (sfide), diversa da angolo ad angolo */
export function rotationFor(angle: number) {
  return (Math.round(angle) * 137 + 61) % 360;
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
  for (let a = 1; a <= 179; a++) if ((a * 7919 + 4242) % 1_000_003 === n) return a;
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
    const data = (await r.json().catch(() => null)) as { ok?: boolean; stats?: AngleStats; today?: { attempts?: number; solved?: boolean; guesses?: number[]; partial?: boolean } | null } | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/** tentativi a metà partita: con l'accesso si continua su un altro dispositivo */
export async function postAngleProgress(token: string, day: string, guesses: number[]) {
  try {
    await fetch("/webhooks/site-angle/progress", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ day, guesses }),
      cache: "no-store",
    });
  } catch {
    /* resta nel browser */
  }
}

/* partita del giorno salvata nel browser (anche senza accesso) */
/* v2: da quando gli angoli sono solo interni (10°–170°) */
const KEY = "vc-angolo-v2";
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
