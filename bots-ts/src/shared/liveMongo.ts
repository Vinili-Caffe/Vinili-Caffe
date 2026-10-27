import { logger } from "./logger";
import { getDb, isMongoConnected } from "./mongo";

/**
 * Dual-read verso collezioni live JS — SOLO lettura, dietro VC_TS_LIVE_MONGO_READ=1.
 * Nessun write su schema prod (cutover write = ok esplicito separato).
 */
export function isLiveMongoReadEnabled(): boolean {
  return process.env.VC_TS_LIVE_MONGO_READ === "1" && isMongoConnected();
}

export interface LiveExpRow {
  guildId: string;
  userId: string;
  totalExp: number;
  messages?: number;
  voiceMinutes?: number;
}

/** Prova a leggere ActivityUserProfile / simili se esistono nel DB. */
export async function tryReadLiveUserExp(
  guildId: string,
  userId: string,
): Promise<LiveExpRow | null> {
  if (!isLiveMongoReadEnabled()) return null;
  const db = getDb();
  if (!db) return null;
  const candidates = [
    process.env.VC_TS_LIVE_EXP_COLLECTION || "activityuserprofiles",
    "ActivityUserProfile",
    "activityuserprofiles",
  ];
  for (const name of candidates) {
    try {
      const col = db.collection(name);
      const doc = await col.findOne({
        $or: [
          { guildId, userId },
          { guildId, user: userId },
          { "guild.id": guildId, "user.id": userId },
        ],
      });
      if (!doc) continue;
      const totalExp = Math.max(
        0,
        Math.floor(Number((doc as { totalExp?: number; exp?: number; xp?: number }).totalExp
          ?? (doc as { exp?: number }).exp
          ?? (doc as { xp?: number }).xp
          ?? 0)),
      );
      logger.info(`[liveMongo] read exp ${name} ${guildId}/${userId}=${totalExp}`);
      return {
        guildId,
        userId,
        totalExp,
        messages: Number((doc as { messages?: number }).messages) || 0,
        voiceMinutes: Number((doc as { voiceMinutes?: number }).voiceMinutes) || 0,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function tryReadLiveWallet(
  guildId: string,
  userId: string,
): Promise<{ balance: number } | null> {
  if (!isLiveMongoReadEnabled()) return null;
  const db = getDb();
  if (!db) return null;
  const names = [
    process.env.VC_TS_LIVE_WALLET_COLLECTION || "serverwallets",
    "ServerWallet",
    "serverwallets",
  ];
  for (const name of names) {
    try {
      const doc = await db.collection(name).findOne({
        $or: [{ guildId, userId }, { guildId, ownerId: userId }],
      });
      if (!doc) continue;
      const balance = Math.max(
        0,
        Math.floor(Number((doc as { balance?: number; coins?: number }).balance
          ?? (doc as { coins?: number }).coins
          ?? 0)),
      );
      return { balance };
    } catch {
      /* next */
    }
  }
  return null;
}
