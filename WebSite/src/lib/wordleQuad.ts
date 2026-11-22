import { SITE_ORIGIN } from "./site";
import {
  WORD_LEN,
  emptyStats,
  parseLang,
  type BoardRow,
  type KeyMarks,
  type Mark,
  type WordleLang,
  type WordleRewardInfo,
  type WordleStats,
} from "./wordle";

export const QUAD_BOARDS = 4;
export const QUAD_MAX_ATTEMPTS = 9;

export type QuadBoardState = {
  rows: BoardRow[];
  won: boolean;
  done: boolean;
  answer?: string;
};

export type SavedQuadGame = {
  day: string;
  lang: WordleLang;
  guesses: string[];
  boards: QuadBoardState[];
  done: boolean;
  won: boolean;
  lost: boolean;
  keyMarks: KeyMarks;
};

export type QuadToday = {
  day: string;
  lang: WordleLang;
  wordLen: number;
  maxAttempts: number;
  boardCount: number;
  playUrl: string;
  game?: SavedQuadGame | null;
  locked?: boolean;
  lockedLang?: WordleLang | null;
  reward?: WordleRewardInfo;
  remindEnabled?: boolean;
};

export type QuadGuessOk = {
  ok: true;
  day: string;
  lang: WordleLang;
  guess?: string;
  marksPerBoard?: (Mark[] | null)[];
  guesses: string[];
  boards: QuadBoardState[];
  attempts: number;
  maxAttempts?: number;
  boardCount?: number;
  won: boolean;
  lost: boolean;
  done: boolean;
  keyMarks?: KeyMarks;
  synced?: boolean;
  locked?: boolean;
  lockedLang?: WordleLang;
  message?: string;
  expGained?: number;
  expAlready?: boolean;
  reward?: WordleRewardInfo;
};

export type QuadGuessErr = { ok: false; error?: string; message?: string };

export function quadStorageKey(lang: WordleLang, day: string) {
  return `vc_wordle_quad_v1:${lang}:${day || "na"}`;
}

export function quadDayLockKey(day: string) {
  return `vc_wordle_quad_day_lock_v1:${day || "na"}`;
}

export function quadStatsKey(lang: WordleLang) {
  return `vc_wordle_quad_stats_v1:${lang}`;
}

export function loadQuadStats(lang: WordleLang): WordleStats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = localStorage.getItem(quadStatsKey(lang));
    if (!raw) return emptyStats();
    const j = JSON.parse(raw) as WordleStats;
    const dist = Array.isArray(j.distribution) ? j.distribution.slice(0, QUAD_MAX_ATTEMPTS) : [];
    while (dist.length < QUAD_MAX_ATTEMPTS) dist.push(0);
    return {
      played: Number(j.played) || 0,
      won: Number(j.won) || 0,
      currentStreak: Number(j.currentStreak) || 0,
      maxStreak: Number(j.maxStreak) || 0,
      distribution: dist.map((n) => Number(n) || 0),
      lastDay: String(j.lastDay || ""),
      lastLang: (j.lastLang as WordleLang) || "",
    };
  } catch {
    return emptyStats();
  }
}

function saveQuadStats(lang: WordleLang, stats: WordleStats) {
  try {
    localStorage.setItem(quadStatsKey(lang), JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/** Stats ×4: una volta al giorno/lingua. Distribuzione 1…9 tentativi. */
export function recordFinishedQuad(opts: {
  lang: WordleLang;
  day: string;
  won: boolean;
  attempts: number;
}): WordleStats {
  const stats = loadQuadStats(opts.lang);
  if (stats.lastDay === opts.day) return stats;
  stats.played += 1;
  stats.lastDay = opts.day;
  stats.lastLang = opts.lang;
  if (opts.won) {
    stats.won += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
    const idx = Math.min(QUAD_MAX_ATTEMPTS, Math.max(1, opts.attempts)) - 1;
    while (stats.distribution.length < QUAD_MAX_ATTEMPTS) stats.distribution.push(0);
    stats.distribution[idx] = (stats.distribution[idx] || 0) + 1;
  } else {
    stats.currentStreak = 0;
  }
  saveQuadStats(opts.lang, stats);
  return stats;
}

export function isStartedQuad(game: SavedQuadGame | null | undefined): boolean {
  if (!game) return false;
  return Boolean(game.done || game.won || game.lost || (Array.isArray(game.guesses) && game.guesses.length > 0));
}

export function loadSavedQuad(lang: WordleLang, day: string): SavedQuadGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(quadStorageKey(lang, day));
    if (!raw) return null;
    const j = JSON.parse(raw) as SavedQuadGame;
    if (!j || j.day !== day || !Array.isArray(j.boards)) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveQuadGame(game: SavedQuadGame) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(quadStorageKey(game.lang, game.day), JSON.stringify(game));
    if (isStartedQuad(game)) {
      localStorage.setItem(quadDayLockKey(game.day), JSON.stringify({ day: game.day, lang: game.lang }));
    }
  } catch {
    /* ignore */
  }
}

export function findLocalStartedQuad(day: string): SavedQuadGame | null {
  if (typeof window === "undefined" || !day) return null;
  const langs: WordleLang[] = ["it", "en", "es", "fr", "de", "pt"];
  let best: SavedQuadGame | null = null;
  for (const lang of langs) {
    const g = loadSavedQuad(lang, day);
    if (!isStartedQuad(g)) continue;
    if (!best || (g!.guesses?.length || 0) > (best.guesses?.length || 0) || (g!.done && !best.done)) best = g;
  }
  try {
    const lock = localStorage.getItem(quadDayLockKey(day));
    if (lock) {
      const j = JSON.parse(lock) as { lang?: string };
      const g = loadSavedQuad(parseLang(j?.lang), day);
      if (isStartedQuad(g)) best = g;
    }
  } catch {
    /* ignore */
  }
  return best;
}

export function preferQuad(local: SavedQuadGame | null, remote: SavedQuadGame | null): SavedQuadGame | null {
  if (!local) return remote;
  if (!remote) return local;
  if (local.day !== remote.day) return local.day >= remote.day ? local : remote;
  if (local.done !== remote.done) return local.done ? local : remote;
  if ((local.guesses?.length || 0) !== (remote.guesses?.length || 0)) {
    return (local.guesses?.length || 0) >= (remote.guesses?.length || 0) ? local : remote;
  }
  return local;
}

export function buildQuadShareText(opts: {
  lang: WordleLang;
  day: string;
  won: boolean;
  attempts: number;
  boards: QuadBoardState[];
  playUrl?: string;
}) {
  const score = opts.won ? `${opts.attempts}/${QUAD_MAX_ATTEMPTS}` : `X/${QUAD_MAX_ATTEMPTS}`;
  const flag = String(opts.lang || "it").toUpperCase();
  const blocks = opts.boards.map((b, i) => {
    const lines = (b.rows || []).map((row) =>
      (row.marks || [])
        .map((m) => (m === "g" ? "🟩" : m === "y" ? "🟨" : "⬛"))
        .join(""),
    );
    return [`#${i + 1}`, ...lines].join("\n");
  });
  const url = opts.playUrl || `${SITE_ORIGIN}/wordle/quattro/`;
  return [`Vinili & Caffè Wordle ×4 ${flag} ${score}`, opts.day, "", ...blocks, "", url].join("\n");
}

export async function loadQuadToday(opts: {
  origin?: string;
  lang?: WordleLang;
  token?: string | null;
} = {}): Promise<QuadToday | null> {
  const lang = opts.lang || "it";
  try {
    const headers: HeadersInit = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(
      `${opts.origin ?? ""}/webhooks/site-wordle-quad/today?lang=${encodeURIComponent(lang)}`,
      { cache: "no-store", credentials: "omit", headers },
    );
    const j = await r.json();
    if (!j?.ok) return null;
    const lockedLang = j.lockedLang ? parseLang(j.lockedLang) : null;
    return {
      day: String(j.day || ""),
      lang: parseLang(j.lang || lockedLang || lang),
      wordLen: Number(j.wordLen) || WORD_LEN,
      maxAttempts: Number(j.maxAttempts) || QUAD_MAX_ATTEMPTS,
      boardCount: Number(j.boardCount) || QUAD_BOARDS,
      playUrl: String(j.playUrl || `${SITE_ORIGIN}/wordle/quattro/`),
      game: j.game && typeof j.game === "object" ? (j.game as SavedQuadGame) : null,
      locked: Boolean(j.locked),
      lockedLang,
      reward: j.reward && typeof j.reward === "object" ? (j.reward as WordleRewardInfo) : undefined,
      remindEnabled: Boolean(j.remindEnabled),
    };
  } catch {
    return null;
  }
}

export const loadBuildWordleQuad = (lang: WordleLang = "it") => loadQuadToday({ origin: SITE_ORIGIN, lang });

export async function postQuadGuess(opts: {
  origin?: string;
  lang: WordleLang;
  guess: string;
  history: string[];
  token?: string | null;
}): Promise<QuadGuessOk | QuadGuessErr> {
  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-wordle-quad/guess`, {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify({ lang: opts.lang, guess: opts.guess, history: opts.history }),
    });
    const j = (await r.json().catch(() => null)) as QuadGuessOk | QuadGuessErr | null;
    if (!j) return { ok: false, message: "Rete occupata, riprova" };
    return j;
  } catch {
    return { ok: false, message: "Rete occupata, riprova" };
  }
}

export async function pushQuadDaily(token: string, game: SavedQuadGame) {
  try {
    await fetch("/webhooks/site-wordle-quad/daily", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lang: game.lang, game }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export async function fetchQuadDaily(token: string, lang: WordleLang, day?: string): Promise<SavedQuadGame | null> {
  try {
    const q = new URLSearchParams({ lang });
    if (day) q.set("day", day);
    const r = await fetch(`/webhooks/site-wordle-quad/daily?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await r.json();
    if (!j?.ok || !j.game) return null;
    return j.game as SavedQuadGame;
  } catch {
    return null;
  }
}

export async function claimQuadExp(opts: {
  token: string;
  lang: WordleLang;
  history: string[];
}): Promise<{ ok: boolean; expGained?: number; expAlready?: boolean; reward?: WordleRewardInfo; message?: string }> {
  try {
    const r = await fetch("/webhooks/site-wordle-quad/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lang: opts.lang, history: opts.history }),
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, message: "Rete occupata" };
    return j;
  } catch {
    return { ok: false, message: "Rete occupata" };
  }
}
