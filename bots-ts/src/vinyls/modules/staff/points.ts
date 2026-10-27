import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";

export interface StaffPoints {
  guildId: string;
  userId: string;
  points: number;
}

const store = new Map<string, StaffPoints>();
const dirty = new Set<string>();

function key(g: string, u: string): string {
  return `${g}:${u}`;
}

function ensure(guildId: string, userId: string): StaffPoints {
  const k = key(guildId, userId);
  let s = store.get(k);
  if (!s) {
    s = { guildId, userId, points: 0 };
    store.set(k, s);
  }
  return s;
}

export function getStaffPoints(guildId: string, userId: string): number {
  return ensure(guildId, userId).points;
}

export function addStaffPoints(guildId: string, userId: string, delta: number): number {
  const s = ensure(guildId, userId);
  s.points = Math.max(0, s.points + Math.floor(delta));
  if (isMongoConnected()) dirty.add(key(guildId, userId));
  return s.points;
}

export function listStaffLeaderboard(guildId: string, limit = 10): StaffPoints[] {
  return [...store.values()]
    .filter((s) => s.guildId === guildId && s.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, Math.max(1, limit));
}

export async function flushStaffPoints(): Promise<void> {
  if (!dirty.size || !isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  const col = database.collection(TS_COLLECTIONS.staffPoints);
  const keys = [...dirty];
  dirty.clear();
  for (const k of keys) {
    const s = store.get(k);
    if (!s) continue;
    await col
      .updateOne(
        { guildId: s.guildId, userId: s.userId },
        { $set: { points: s.points, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      )
      .catch((err) => {
        logger.error("[staff] flush", err);
        dirty.add(k);
      });
  }
}

export async function hydrateStaffPoints(): Promise<void> {
  if (!isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  const docs = await database
    .collection(TS_COLLECTIONS.staffPoints)
    .find({})
    .limit(5_000)
    .toArray()
    .catch(() => [] as Record<string, unknown>[]);
  for (const raw of docs) {
    const guildId = String(raw.guildId || "");
    const userId = String(raw.userId || "");
    if (!guildId || !userId) continue;
    ensure(guildId, userId).points = Math.max(0, Math.floor(Number(raw.points) || 0));
  }
}
