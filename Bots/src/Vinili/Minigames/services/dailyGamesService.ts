/**
 * Giochi del giorno (Wordle, Quordle, Angle, Canzone, Copertina): un registro unico per
 * - i punti di ogni partita (classifica settimanale, sul sito e su Discord)
 * - la serie combinata (giorni di fila in cui hai fatto tutti i giochi del giorno)
 *
 * profile.dailyGames = { "YYYY-MM-DD": { wordle: { p, s, a }, quad: {...}, ... } }
 *   p = punti, s = indovinato, a = tentativi. Conta solo la prima partita del giorno di ogni gioco.
 */
"use strict";

const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

export const DAILY_GAMES = ["wordle", "quad", "angle", "song", "cover"] as const;
export type DailyGame = (typeof DAILY_GAMES)[number];

export const DAILY_LABEL: Record<DailyGame, string> = {
  wordle: "Wordle",
  quad: "Quordle",
  angle: "Angle",
  song: "Canzone del giorno",
  cover: "Copertina del giorno",
};

/** tentativi massimi di ogni gioco (per i punti) */
const MAX: Record<DailyGame, number> = { wordle: 6, quad: 9, angle: 4, song: 6, cover: 6 };

const mainGuildId = () => String(IDs.guilds?.main || "").trim();

/** giorno di Roma YYYY-MM-DD */
export function romeDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shiftDay(day: string, n: number) {
  const t = Date.parse(`${day}T12:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** lunedì della settimana del giorno (le settimane vanno da lunedì a domenica) */
export function weekStart(day = romeDay()) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); /* 0 = domenica */
  return shiftDay(day, -((dow + 6) % 7));
}

export function weekDays(monday: string) {
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

/** punti: indovinato da 3 a 10 (meno tentativi = di più), giocato ma non indovinato 1 */
export function pointsFor(game: DailyGame, solved: boolean, attempts: number) {
  if (!solved) return 1;
  const max = MAX[game];
  const a = Math.max(1, Math.min(max, Math.floor(attempts) || max));
  return 3 + Math.round((7 * (max - a)) / Math.max(1, max - 1));
}

/** Fine di una partita del giorno: si segna (solo la prima volta per gioco e giorno). */
export async function recordDailyResult(userId: string, game: DailyGame, day: string, opts: { solved: boolean; attempts: number; points?: number }) {
  if (!userId || !DAILY_GAMES.includes(game) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const guildId = mainGuildId();
  const path = `profile.dailyGames.${day}.${game}`;
  const entry = { p: opts.points != null ? Math.max(0, Math.min(10, Math.round(opts.points))) : pointsFor(game, Boolean(opts.solved), Number(opts.attempts) || 0), s: Boolean(opts.solved), a: Math.max(0, Math.floor(Number(opts.attempts) || 0)) };
  await ActivityUserProfile.updateOne({ guildId, userId }, { $setOnInsert: { guildId, userId } }, { upsert: true }).catch(() => null);
  const r = await ActivityUserProfile.updateOne({ guildId, userId, [path]: { $exists: false } }, { $set: { [path]: entry } }).catch(() => null);
  /* dailyAllTime1: niente più pulizia dei giorni vecchi, servono alla classifica All-Time
     (5 voci piccole al giorno: il profilo cresce poco) */
  return Boolean(r?.modifiedCount);
}

type DayMap = Record<string, Partial<Record<DailyGame, { p: number; s: boolean; a: number }>>>;

const allDone = (games?: Partial<Record<DailyGame, unknown>>) => Boolean(games) && DAILY_GAMES.every((g) => games![g]);

/** serie combinata: giorni di fila con tutti i giochi fatti (oggi conta se è già completo, altrimenti si parte da ieri) */
export function comboStreak(days: DayMap, today = romeDay()) {
  let day = allDone(days[today]) ? today : shiftDay(today, -1);
  let n = 0;
  while (allDone(days[day])) {
    n += 1;
    day = shiftDay(day, -1);
  }
  return n;
}

/** la serie più lunga negli ultimi giorni salvati */
export function bestComboStreak(days: DayMap) {
  const list = Object.keys(days).sort();
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const d of list) {
    if (!allDone(days[d])) {
      cur = 0;
      prev = d;
      continue;
    }
    cur = prev && shiftDay(prev, 1) === d && cur ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/* ───── recupero: Wordle e Quordle salvano già la partita del giorno; se manca nel registro (es. giocata prima
   che il registro esistesse) la si ricava da lì e la si segna ───── */
const WORDLE_LANGS = ["it", "en", "es", "fr", "de", "pt"];
const WORDLE_FIELDS = "profile.siteWordleDaily profile.siteWordleQuadDaily";

function fromWordleSaves(profile: any) {
  const out: Array<{ game: DailyGame; day: string; solved: boolean; attempts: number; points?: number }> = [];
  for (const g of Object.values(profile?.siteWordleDaily || {}) as any[]) {
    if (!g?.done || !g?.day) continue;
    const board = Array.isArray(g.board) ? g.board : [];
    out.push({ game: "wordle", day: String(g.day), solved: Boolean(g.won), attempts: board.length });
  }
  for (const g of Object.values(profile?.siteWordleQuadDaily || {}) as any[]) {
    if (!g?.done || !g?.day) continue;
    const guesses = Array.isArray(g.guesses) ? g.guesses : [];
    const taken = (Array.isArray(g.boards) ? g.boards : []).filter((b: any) => b?.won).length;
    out.push({ game: "quad", day: String(g.day), solved: Boolean(g.won), attempts: guesses.length, ...(g.won ? {} : { points: 1 + taken }) });
  }
  return out;
}

/** aggiunge (in memoria e nel profilo) le partite di Wordle e Quordle che mancano nel registro */
function mergeWordleSaves(userId: string, profile: any, days: DayMap, onlyDays?: Set<string>) {
  for (const e of fromWordleSaves(profile)) {
    if (onlyDays && !onlyDays.has(e.day)) continue;
    if (days[e.day]?.[e.game]) continue;
    const p = e.points != null ? e.points : pointsFor(e.game, e.solved, e.attempts);
    days[e.day] = { ...(days[e.day] || {}), [e.game]: { p, s: e.solved, a: e.attempts } };
    void recordDailyResult(userId, e.game, e.day, { solved: e.solved, attempts: e.attempts, ...(e.points != null ? { points: e.points } : {}) }).catch(() => false);
  }
  return days;
}

/** la situazione di chi guarda: oggi, serie e punti della settimana */
export async function dailyMe(userId: string) {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const doc: any = await ActivityUserProfile.findOne({ guildId: mainGuildId(), userId }).select(`profile.dailyGames ${WORDLE_FIELDS}`).lean().catch(() => null);
  const days: DayMap = mergeWordleSaves(userId, doc?.profile, { ...(doc?.profile?.dailyGames || {}) });
  const today = romeDay();
  const week = weekDays(weekStart(today));
  const weekPoints = week.reduce((sum, d) => sum + DAILY_GAMES.reduce((s, g) => s + (Number(days[d]?.[g]?.p) || 0), 0), 0);
  /* calendario a quadretti: punti di ogni giorno delle ultime 12 settimane (84 giorni) */
  const history: Record<string, number> = {};
  for (let i = 0; i < 84; i++) {
    const d = shiftDay(today, -i);
    const pts = DAILY_GAMES.reduce((s, g) => s + (Number(days[d]?.[g]?.p) || 0), 0);
    if (pts > 0) history[d] = pts;
  }
  return { today, todayGames: days[today] || {}, streak: comboStreak(days, today), bestStreak: bestComboStreak(days), weekPoints, history };
}

export type WeekRow = { userId: string; points: number; games: number; solved: number };

/** giorni del mese del giorno indicato, dal primo fino a quel giorno */
export function monthDays(day = romeDay()) {
  const first = `${day.slice(0, 8)}01`;
  const out: string[] = [];
  for (let d = first; d <= day && out.length < 31; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** classifica della settimana che comincia il lunedì indicato */
export async function weekLeaderboard(monday = weekStart()): Promise<WeekRow[]> {
  return daysLeaderboard(weekDays(monday));
}

/** classifica sui giorni indicati (una settimana, un mese); null = tutti i giorni salvati (All-Time) */
export async function daysLeaderboard(days: string[] | null): Promise<WeekRow[]> {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  if (days && !days.length) return [];
  const select = days
    ? ["userId", WORDLE_FIELDS, ...days.map((d) => `profile.dailyGames.${d}`)].join(" ")
    : ["userId", WORDLE_FIELDS, "profile.dailyGames"].join(" ");
  const docs: any[] = await ActivityUserProfile.find({
    guildId: mainGuildId(),
    $or: days
      ? [
          ...days.map((d) => ({ [`profile.dailyGames.${d}`]: { $exists: true } })),
          /* anche chi ha solo Wordle o Quordle salvati (non ancora nel registro) */
          ...WORDLE_LANGS.flatMap((l) => [{ [`profile.siteWordleDaily.${l}.day`]: { $in: days } }, { [`profile.siteWordleQuadDaily.${l}.day`]: { $in: days } }]),
        ]
      : [
          { "profile.dailyGames": { $exists: true } },
          ...WORDLE_LANGS.flatMap((l) => [{ [`profile.siteWordleDaily.${l}.done`]: true }, { [`profile.siteWordleQuadDaily.${l}.done`]: true }]),
        ],
  })
    .select(select)
    .lean()
    .catch(() => []);
  const rows: WeekRow[] = [];
  const inRange = days ? new Set(days) : undefined;
  for (const doc of docs) {
    if (doc?.profile) doc.profile.dailyGames = mergeWordleSaves(String(doc.userId), doc.profile, { ...(doc.profile.dailyGames || {}) }, inRange);
    let points = 0;
    let games = 0;
    let solved = 0;
    for (const d of days || Object.keys(doc?.profile?.dailyGames || {})) {
      for (const g of DAILY_GAMES) {
        const e = doc?.profile?.dailyGames?.[d]?.[g];
        if (!e) continue;
        points += Number(e.p) || 0;
        games += 1;
        if (e.s) solved += 1;
      }
    }
    if (games) rows.push({ userId: String(doc.userId), points, games, solved });
  }
  /* pari punti: chi ha indovinato di più, poi chi ha giocato di più */
  return rows.sort((a, b) => b.points - a.points || b.solved - a.solved || b.games - a.games);
}
