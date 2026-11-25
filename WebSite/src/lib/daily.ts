/**
 * Giochi del giorno: Canzone e Copertina del giorno, riepilogo (serie combinata) e classifica della settimana.
 */

export type DailyKind = "song" | "cover";
export type DailyGameId = "wordle" | "quad" | "angle" | "song" | "cover";
export type DailyGuess = { id?: string; title?: string; artist?: string; skip?: boolean };
export type DailyJudged = { label: string; result: "hit" | "artist" | "miss" | "skip" };
export type DailyToday = { ok: true; kind: DailyKind; day: string; number: number; maxAttempts: number; clips?: number[]; preview?: string; levels?: number };
export type DailyState = {
  ok: true;
  kind: DailyKind;
  day: string;
  number: number;
  maxAttempts: number;
  guesses: DailyJudged[];
  solved: boolean;
  done: boolean;
  attempts: number;
  answer?: { title: string; artist: string; cover: string; album: string };
  reward?: { auth: "guest" | "outsider" | "member"; exp: number; capped?: boolean };
};
export type DailyHit = { id: string; title: string; artist: string };
export type DailyMe = {
  ok: true;
  guest: boolean;
  games: DailyGameId[];
  today?: string;
  todayGames?: Partial<Record<DailyGameId, { p: number; s: boolean; a: number }>>;
  streak?: number;
  bestStreak?: number;
  weekPoints?: number;
};
export type DailyWeek = {
  ok: true;
  week: string;
  days: string[];
  players: number;
  top: Array<{ rank: number; userId: string; name: string; avatar: string; points: number; games: number; solved: number }>;
  me: { rank: number; points: number; games: number; solved: number } | null;
};

export const DAILY_GAMES: Array<{ id: DailyGameId; label: string; href: string }> = [
  { id: "wordle", label: "Wordle", href: "/wordle/" },
  { id: "quad", label: "Quordle", href: "/wordle/quattro/" },
  { id: "angle", label: "Angle", href: "/quiz/angle/" },
  { id: "song", label: "Canzone del giorno", href: "/quiz/canzone/" },
  { id: "cover", label: "Copertina del giorno", href: "/quiz/copertina/" },
];

async function get<T>(path: string, token?: string | null): Promise<T | null> {
  try {
    const r = await fetch(`/webhooks/site-daily${path}`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as (T & { ok?: boolean }) | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export const loadDailyToday = (kind: DailyKind) => get<DailyToday>(`/${kind}/today`);
export const loadDailyKindMe = (token: string, kind: DailyKind) => get<{ ok: true; guest: boolean; game: DailyState | null }>(`/${kind}/me`, token);
export const loadDailyMe = (token: string) => get<DailyMe>("/me", token);
export const loadDailyWeek = (token: string | null | undefined, prev = false) => get<DailyWeek>(`/week${prev ? "?prev=1" : ""}`, token);

export async function searchDaily(kind: DailyKind, q: string): Promise<DailyHit[]> {
  const r = await get<{ ok: true; results: DailyHit[] }>(`/search?type=${kind === "cover" ? "album" : "track"}&q=${encodeURIComponent(q)}`);
  return r?.results || [];
}

export async function guessDaily(token: string | null | undefined, kind: DailyKind, day: string, guesses: DailyGuess[]) {
  try {
    const r = await fetch(`/webhooks/site-daily/${kind}/guess`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ day, guesses }),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as DailyState | null;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/** immagine a quadretti della copertina (dal server: la foto vera arriva solo a fine partita) */
export const coverImageUrl = (day: string, level: number) => `/webhooks/site-daily/cover/img?day=${encodeURIComponent(day)}&level=${level}`;

/* partita del giorno salvata nel browser (anche senza accesso) */
const key = (kind: DailyKind) => `vc-daily-${kind}`;
export function readLocalDaily(kind: DailyKind, day: string): DailyGuess[] | null {
  try {
    const all = JSON.parse(localStorage.getItem(key(kind)) || "{}");
    return Array.isArray(all?.[day]) ? all[day] : null;
  } catch {
    return null;
  }
}
export function writeLocalDaily(kind: DailyKind, day: string, guesses: DailyGuess[]) {
  try {
    const all = JSON.parse(localStorage.getItem(key(kind)) || "{}") || {};
    all[day] = guesses;
    for (const k of Object.keys(all).sort().slice(0, -14)) delete all[k];
    localStorage.setItem(key(kind), JSON.stringify(all));
  } catch {
    /* senza memoria la partita vale solo adesso */
  }
}
