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
  /* i giorni più vecchi di 70 si tolgono, così il profilo non cresce all'infinito */
  if (r?.modifiedCount) void pruneOld(userId).catch(() => null);
  return Boolean(r?.modifiedCount);
}

async function pruneOld(userId: string) {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const guildId = mainGuildId();
  const doc: any = await ActivityUserProfile.findOne({ guildId, userId }).select("profile.dailyGames").lean().catch(() => null);
  const limit = shiftDay(romeDay(), -70);
  const old = Object.keys(doc?.profile?.dailyGames || {}).filter((d) => d < limit);
  if (!old.length) return;
  await ActivityUserProfile.updateOne({ guildId, userId }, { $unset: Object.fromEntries(old.map((d) => [`profile.dailyGames.${d}`, ""])) }).catch(() => null);
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

/** la situazione di chi guarda: oggi, serie e punti della settimana */
export async function dailyMe(userId: string) {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const doc: any = await ActivityUserProfile.findOne({ guildId: mainGuildId(), userId }).select("profile.dailyGames").lean().catch(() => null);
  const days: DayMap = doc?.profile?.dailyGames || {};
  const today = romeDay();
  const week = weekDays(weekStart(today));
  const weekPoints = week.reduce((sum, d) => sum + DAILY_GAMES.reduce((s, g) => s + (Number(days[d]?.[g]?.p) || 0), 0), 0);
  return { today, todayGames: days[today] || {}, streak: comboStreak(days, today), bestStreak: bestComboStreak(days), weekPoints };
}

export type WeekRow = { userId: string; points: number; games: number; solved: number };

/** classifica della settimana che comincia il lunedì indicato */
export async function weekLeaderboard(monday = weekStart()): Promise<WeekRow[]> {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const days = weekDays(monday);
  const select = ["userId", ...days.map((d) => `profile.dailyGames.${d}`)].join(" ");
  const docs: any[] = await ActivityUserProfile.find({
    guildId: mainGuildId(),
    $or: days.map((d) => ({ [`profile.dailyGames.${d}`]: { $exists: true } })),
  })
    .select(select)
    .lean()
    .catch(() => []);
  const rows: WeekRow[] = [];
  for (const doc of docs) {
    let points = 0;
    let games = 0;
    let solved = 0;
    for (const d of days) {
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
