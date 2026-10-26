import { SITE_ORIGIN } from "./site";

/** Wordle giornaliero: stesso puzzle di site-wordle (wordleService).
 *  Con login la partita del giorno è anche sul profilo (wordleDailySync1). */

export const WORD_LEN = 5;
export const MAX_ATTEMPTS = 6;
export const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

export type WordleLang = "it" | "en" | "es" | "fr" | "de" | "pt";
export const WORDLE_LANGS: readonly WordleLang[] = ["it", "en", "es", "fr", "de", "pt"] as const;
export type Mark = "g" | "y" | "b";
export type BoardRow = { guess: string; marks: Mark[] };
export type KeyMarks = Record<string, Mark>;

export type SavedGame = {
  day: string;
  lang: WordleLang;
  board: BoardRow[];
  done: boolean;
  won: boolean;
  lost: boolean;
  answer: string;
  keyMarks: KeyMarks;
};

export type WordleToday = {
  day: string;
  lang: WordleLang;
  wordLen: number;
  maxAttempts: number;
  playUrl: string;
  game?: SavedGame | null;
  /** wordleOnePerDay1: già iniziata oggi (anche in altra lingua) */
  locked?: boolean;
  lockedLang?: WordleLang | null;
};

export type GuessOk = {
  ok: true;
  day: string;
  lang: WordleLang;
  guess?: string;
  marks?: Mark[];
  board: BoardRow[];
  attempts: number;
  maxAttempts?: number;
  won: boolean;
  lost: boolean;
  done: boolean;
  answer?: string;
  synced?: boolean;
  keyMarks?: KeyMarks;
  locked?: boolean;
  lockedLang?: WordleLang;
  message?: string;
};

export type GuessErr = { ok: false; error?: string; message?: string };
export type WordleStats = {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** Indice 0 = 1 tentativo … 5 = 6 tentativi */
  distribution: number[];
  lastDay: string;
  lastLang: WordleLang | "";
};

const MARK_RANK: Record<Mark, number> = { b: 1, y: 2, g: 3 };

/** Mappa lingua del sito → bank Wordle (solo alfabeto latino a 5 lettere). */
export function parseLang(raw: string | null | undefined): WordleLang {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return "it";
  if (v === "eng" || v === "english" || v === "inglese") return "en";
  if (v === "ita" || v === "italian" || v === "italiano") return "it";
  const base = v.slice(0, 2) as WordleLang | string;
  if ((WORDLE_LANGS as readonly string[]).includes(base)) return base as WordleLang;
  /* altre lingue del sito senza dizionario → EN (tastiera latina) */
  if (["nl", "sv", "pl", "tr", "id", "ro", "vi", "ru", "zh", "ja", "ko", "ar", "hi", "uk"].includes(base)) {
    return "en";
  }
  return "it";
}

export function storageKey(lang: WordleLang, day: string) {
  /* v2: allinea al sito vecchio (invalida partite IT salvate con risposta EN) */
  return `vc_wordle_v2:${lang}:${day || "na"}`;
}

/** Lock locale: 1 partita/giorno cross-lingua (anche offline / senza login). */
export function dayLockKey(day: string) {
  return `vc_wordle_day_lock_v1:${day || "na"}`;
}

export function statsKey(lang: WordleLang) {
  return `vc_wordle_stats_v1:${lang}`;
}

export function isStartedGame(game: SavedGame | null | undefined): boolean {
  if (!game) return false;
  return Boolean(game.done || game.won || game.lost || (Array.isArray(game.board) && game.board.length > 0));
}

export function readDayLock(day: string): WordleLang | null {
  if (typeof window === "undefined" || !day) return null;
  try {
    const raw = localStorage.getItem(dayLockKey(day));
    if (!raw) return null;
    const j = JSON.parse(raw) as { lang?: string };
    return parseLang(j?.lang);
  } catch {
    return null;
  }
}

export function writeDayLock(day: string, lang: WordleLang) {
  if (typeof window === "undefined" || !day) return;
  try {
    localStorage.setItem(dayLockKey(day), JSON.stringify({ day, lang }));
  } catch {
    /* ignore */
  }
}

/** Cerca una partita locale già iniziata oggi in qualsiasi lingua. */
export function findLocalStartedGame(day: string): SavedGame | null {
  if (typeof window === "undefined" || !day) return null;
  let best: SavedGame | null = null;
  for (const lang of WORDLE_LANGS) {
    const g = loadSavedGame(lang, day);
    if (!isStartedGame(g)) continue;
    best = preferGame(best, g);
  }
  const locked = readDayLock(day);
  if (locked) {
    const g = loadSavedGame(locked, day);
    if (isStartedGame(g)) best = preferGame(best, g);
  }
  return best;
}

export function emptyStats(): WordleStats {
  return {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0],
    lastDay: "",
    lastLang: "",
  };
}

export function loadSavedGame(lang: WordleLang, day: string): SavedGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(lang, day));
    if (!raw) return null;
    const j = JSON.parse(raw) as SavedGame;
    if (!j || j.day !== day || !Array.isArray(j.board)) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(game.lang, game.day),
      JSON.stringify({
        day: game.day,
        lang: game.lang,
        board: game.board,
        done: game.done,
        won: game.won,
        lost: game.lost,
        answer: game.answer || "",
        keyMarks: game.keyMarks || {},
      }),
    );
    if (isStartedGame(game)) writeDayLock(game.day, game.lang);
  } catch {
    /* quota / private mode */
  }
}

export function loadStats(lang: WordleLang): WordleStats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = localStorage.getItem(statsKey(lang));
    if (!raw) return emptyStats();
    const j = JSON.parse(raw) as WordleStats;
    const dist = Array.isArray(j.distribution) ? j.distribution.slice(0, 6) : [];
    while (dist.length < 6) dist.push(0);
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

function saveStats(lang: WordleLang, stats: WordleStats) {
  try {
    localStorage.setItem(statsKey(lang), JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/** Aggiorna le stats locali una sola volta per giorno/lingua. */
export function recordFinishedGame(opts: {
  lang: WordleLang;
  day: string;
  won: boolean;
  attempts: number;
}): WordleStats {
  const stats = loadStats(opts.lang);
  if (stats.lastDay === opts.day) return stats;

  stats.played += 1;
  stats.lastDay = opts.day;
  stats.lastLang = opts.lang;

  if (opts.won) {
    stats.won += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
    const idx = Math.min(MAX_ATTEMPTS, Math.max(1, opts.attempts)) - 1;
    stats.distribution[idx] = (stats.distribution[idx] || 0) + 1;
  } else {
    stats.currentStreak = 0;
  }

  saveStats(opts.lang, stats);
  return stats;
}

export function upgradeKey(marks: KeyMarks, ch: string, m: Mark): KeyMarks {
  const cur = marks[ch];
  if (!cur || MARK_RANK[m] > MARK_RANK[cur]) return { ...marks, [ch]: m };
  return marks;
}

export function marksFromBoard(board: BoardRow[]): KeyMarks {
  let keys: KeyMarks = {};
  for (const row of board) {
    const g = String(row.guess || "").toLowerCase();
    const marks = row.marks || [];
    for (let i = 0; i < WORD_LEN; i++) {
      const ch = g.charAt(i);
      if (!ch) continue;
      keys = upgradeKey(keys, ch, (marks[i] as Mark) || "b");
    }
  }
  return keys;
}

/** Testo condivisibile (emoji come Discord: 🟩 🟨 ⬛). */
export function buildShareText(opts: {
  lang: WordleLang;
  day: string;
  won: boolean;
  attempts: number;
  board: BoardRow[];
  playUrl?: string;
}) {
  const score = opts.won ? `${opts.attempts}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  const flag = String(opts.lang || "it").toUpperCase();
  const lines = opts.board.map((row) =>
    (row.marks || [])
      .map((m) => (m === "g" ? "🟩" : m === "y" ? "🟨" : "⬛"))
      .join(" "),
  );
  const url = opts.playUrl || `${SITE_ORIGIN}/wordle/`;
  return [`Vinili & Caffè Wordle ${flag} ${score}`, opts.day, "", ...lines, "", url].join("\n");
}

export async function loadToday(opts: {
  origin?: string;
  lang?: WordleLang;
  token?: string | null;
} = {}): Promise<WordleToday | null> {
  const lang = opts.lang || "it";
  try {
    const headers: HeadersInit = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-wordle/today?lang=${encodeURIComponent(lang)}`, {
      cache: "no-store",
      credentials: "omit",
      headers,
    });
    const j = await r.json();
    if (!j?.ok) return null;
    const lockedLang = j.lockedLang ? parseLang(j.lockedLang) : null;
    return {
      day: String(j.day || ""),
      lang: parseLang(j.lang || lockedLang || lang),
      wordLen: Number(j.wordLen) || WORD_LEN,
      maxAttempts: Number(j.maxAttempts) || MAX_ATTEMPTS,
      playUrl: String(j.playUrl || `${SITE_ORIGIN}/wordle/`),
      game: j.game && typeof j.game === "object" ? (j.game as SavedGame) : null,
      locked: Boolean(j.locked),
      lockedLang,
    };
  } catch {
    return null;
  }
}

/** Preferisce la partita più avanzata (done > board più lunga). */
export function preferGame(local: SavedGame | null, remote: SavedGame | null): SavedGame | null {
  if (!local) return remote;
  if (!remote) return local;
  if (local.day !== remote.day) return local.day >= remote.day ? local : remote;
  if (local.done !== remote.done) return local.done ? local : remote;
  if (local.board.length !== remote.board.length) {
    return local.board.length >= remote.board.length ? local : remote;
  }
  return local;
}

export async function fetchDailyGame(token: string, lang: WordleLang, day?: string): Promise<SavedGame | null> {
  try {
    const q = new URLSearchParams({ lang });
    if (day) q.set("day", day);
    const r = await fetch(`/webhooks/site-wordle/daily?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await r.json();
    if (!j?.ok || !j.game) return null;
    return j.game as SavedGame;
  } catch {
    return null;
  }
}

export async function pushDailyGame(token: string, game: SavedGame) {
  try {
    await fetch("/webhooks/site-wordle/daily", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lang: game.lang, game }),
      keepalive: true,
    });
  } catch {
    /* si riprova alla prossima apertura */
  }
}

export const loadBuildWordle = (lang: WordleLang = "it") => loadToday({ origin: SITE_ORIGIN, lang });

export async function postGuess(opts: {
  origin?: string;
  lang: WordleLang;
  guess: string;
  history: string[];
  token?: string | null;
}): Promise<GuessOk | GuessErr> {
  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-wordle/guess`, {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify({
        lang: opts.lang,
        guess: opts.guess,
        history: opts.history,
      }),
    });
    const j = (await r.json().catch(() => null)) as GuessOk | GuessErr | null;
    if (!j) return { ok: false, message: "Rete occupata, riprova" };
    return j;
  } catch {
    return { ok: false, message: "Rete occupata, riprova" };
  }
}

/* wordleStatsSync1: statistiche anche sul profilo (bot), così si ritrovano su telefono e PC.
   Vince la copia con più partite giocate; il bot applica la stessa regola. */
function moreComplete(a: WordleStats, b: WordleStats) {
  if (a.played !== b.played) return a.played > b.played;
  return a.lastDay > b.lastDay;
}

/** Allinea locale e profilo per la lingua: ritorna le statistiche da mostrare. */
export async function syncStats(token: string, lang: WordleLang): Promise<WordleStats> {
  const local = loadStats(lang);
  try {
    const r = await fetch("/webhooks/site-wordle/stats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const j = (await r.json()) as { ok?: boolean; stats?: Partial<Record<WordleLang, WordleStats>> };
    const remote = j?.ok ? j.stats?.[lang] : undefined;
    if (remote && moreComplete(remote, local)) {
      saveStats(lang, remote);
      return loadStats(lang);
    }
    if (local.played > 0 && (!remote || moreComplete(local, remote))) void pushStats(token, lang, local);
  } catch {
    /* offline: restano quelle del dispositivo */
  }
  return local;
}

export async function pushStats(token: string, lang: WordleLang, stats: WordleStats = loadStats(lang)) {
  try {
    await fetch("/webhooks/site-wordle/stats", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lang, stats }),
      keepalive: true,
    });
  } catch {
    /* si riprova alla prossima apertura */
  }
}
