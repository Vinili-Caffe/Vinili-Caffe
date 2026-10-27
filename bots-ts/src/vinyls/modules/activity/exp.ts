import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";
import { emitLevelUp } from "./levelUp";

/** Allineato a Vinyls expService (curve + gain base). */
export const MESSAGE_EXP = 2;
export const VOICE_EXP_PER_MINUTE = 5;
const MESSAGE_COOLDOWN_MS = 45_000;

export interface LevelInfo {
  level: number;
  totalExp: number;
  currentLevelExp: number;
  nextThreshold: number;
  remainingToNext: number;
  progressPercent: number;
}

export interface UserExpStats {
  guildId: string;
  userId: string;
  totalExp: number;
  messages: number;
  voiceMinutes: number;
}

function roundToNearest50(value: number): number {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  if (safeLevel <= 10) return 120 + (safeLevel - 1) * 25;
  if (safeLevel <= 30) return 380 + (safeLevel - 10) * 55;
  if (safeLevel <= 60) return 1600 + (safeLevel - 30) * 120;
  return 5200 + (safeLevel - 60) * 210;
}

export function getLevelInfo(totalExp: number): LevelInfo {
  const exp = Math.max(0, Math.floor(Number(totalExp || 0)));
  let level = 0;
  let currentLevelExp = 0;
  let nextThreshold = 100;
  while (exp >= nextThreshold) {
    level += 1;
    currentLevelExp = nextThreshold;
    nextThreshold = roundToNearest50(nextThreshold + Math.max(110, getLevelStep(level)));
  }
  const remainingToNext = Math.max(0, nextThreshold - exp);
  const span = Math.max(1, nextThreshold - currentLevelExp);
  const progressPercent = Math.max(0, Math.min(100, Math.round(((exp - currentLevelExp) / span) * 100)));
  return { level, totalExp: exp, currentLevelExp, nextThreshold, remainingToNext, progressPercent };
}

const stats = new Map<string, UserExpStats>();
const lastMessageAward = new Map<string, number>();
const dirtyUsers = new Set<string>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function ensure(guildId: string, userId: string): UserExpStats {
  const k = key(guildId, userId);
  let s = stats.get(k);
  if (!s) {
    s = { guildId, userId, totalExp: 0, messages: 0, voiceMinutes: 0 };
    stats.set(k, s);
  }
  return s;
}

function markDirty(guildId: string, userId: string): void {
  if (!isMongoConnected()) return;
  dirtyUsers.add(key(guildId, userId));
}

export function getUserExpStats(guildId: string, userId: string): UserExpStats {
  return { ...ensure(guildId, userId) };
}

export function listTopExp(guildId: string, limit = 10): UserExpStats[] {
  return [...stats.values()]
    .filter((s) => s.guildId === guildId && s.totalExp > 0)
    .sort((a, b) => b.totalExp - a.totalExp)
    .slice(0, Math.max(1, limit));
}

export function getUserRank(guildId: string, userId: string): number {
  const mine = ensure(guildId, userId).totalExp;
  if (mine <= 0) return 0;
  let rank = 1;
  for (const s of stats.values()) {
    if (s.guildId !== guildId) continue;
    if (s.totalExp > mine) rank += 1;
  }
  return rank;
}

export function addExp(
  guildId: string,
  userId: string,
  amount: number,
  kind: "message" | "voice" | "other" = "other",
): { stats: UserExpStats; leveled: boolean; beforeLevel: number; afterLevel: number } {
  const s = ensure(guildId, userId);
  const before = getLevelInfo(s.totalExp).level;
  const add = Math.max(0, Math.floor(amount));
  s.totalExp += add;
  if (kind === "message") s.messages += 1;
  if (kind === "voice") s.voiceMinutes += Math.max(1, Math.round(add / VOICE_EXP_PER_MINUTE));
  markDirty(guildId, userId);
  const after = getLevelInfo(s.totalExp).level;
  const leveled = after > before;
  if (leveled) {
    emitLevelUp({
      guildId,
      userId,
      beforeLevel: before,
      afterLevel: after,
    });
  }
  return { stats: { ...s }, leveled, beforeLevel: before, afterLevel: after };
}

/** Award messaggio con cooldown 45s (come ordine di grandezza live). */
export function tryAwardMessageExp(guildId: string, userId: string): ReturnType<typeof addExp> | null {
  const k = key(guildId, userId);
  const now = Date.now();
  const last = lastMessageAward.get(k) || 0;
  if (now - last < MESSAGE_COOLDOWN_MS) return null;
  lastMessageAward.set(k, now);
  return addExp(guildId, userId, MESSAGE_EXP, "message");
}

export function awardVoiceMinute(guildId: string, userId: string): ReturnType<typeof addExp> {
  return addExp(guildId, userId, VOICE_EXP_PER_MINUTE, "voice");
}

export async function flushExpToMongo(): Promise<number> {
  if (!dirtyUsers.size || !isMongoConnected()) return 0;
  const database = getDb();
  if (!database) return 0;
  const col = database.collection(TS_COLLECTIONS.userExp);
  const keys = [...dirtyUsers];
  dirtyUsers.clear();
  let n = 0;
  for (const k of keys) {
    const s = stats.get(k);
    if (!s) continue;
    try {
      await col.updateOne(
        { guildId: s.guildId, userId: s.userId },
        {
          $set: {
            totalExp: s.totalExp,
            messages: s.messages,
            voiceMinutes: s.voiceMinutes,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      n += 1;
    } catch (err) {
      logger.error("[exp] mongo upsert", err);
      dirtyUsers.add(k);
    }
  }
  return n;
}

export async function hydrateExpFromMongo(limit = 5_000): Promise<number> {
  if (!isMongoConnected()) return 0;
  const database = getDb();
  if (!database) return 0;
  const docs = await database
    .collection(TS_COLLECTIONS.userExp)
    .find({})
    .limit(limit)
    .toArray()
    .catch((err) => {
      logger.error("[exp] hydrate", err);
      return [] as Record<string, unknown>[];
    });
  let n = 0;
  for (const raw of docs) {
    const guildId = String(raw.guildId || "");
    const userId = String(raw.userId || "");
    if (!guildId || !userId) continue;
    const s = ensure(guildId, userId);
    s.totalExp = Math.max(0, Math.floor(Number(raw.totalExp) || 0));
    s.messages = Math.max(0, Math.floor(Number(raw.messages) || 0));
    s.voiceMinutes = Math.max(0, Math.floor(Number(raw.voiceMinutes) || 0));
    n += 1;
  }
  if (n) logger.info(`[exp] hydrated ${n} from mongo`);
  return n;
}
