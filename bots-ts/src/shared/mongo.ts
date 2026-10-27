import { MongoClient, type Db } from "mongodb";
import { logger } from "./logger";

let client: MongoClient | null = null;
let db: Db | null = null;

/** Prefisso collezioni isolate dal bot JS live (niente dual-write su schema prod). */
export const TS_COLLECTIONS = {
  modCases: "bots_ts_mod_cases",
  activityHourly: "bots_ts_activity_hourly",
  userExp: "bots_ts_user_exp",
  wallets: "bots_ts_wallets",
  staffPoints: "bots_ts_staff_points",
  tickets: "bots_ts_tickets",
} as const;

export function isMongoConnected(): boolean {
  return Boolean(client && db);
}

export function getDb(): Db | null {
  return db;
}

export function isTsMongoEnabled(): boolean {
  return process.env.VC_TS_MONGO === "1";
}

/**
 * Connette solo se URI + VC_TS_MONGO=1.
 * Usa DB name da URI; collezioni `bots_ts_*` separate dal live.
 */
export async function connectMongoIfConfigured(uri: string): Promise<boolean> {
  if (!uri) {
    logger.info("[mongo] skip — MONGODB_URI vuoto");
    return false;
  }
  if (!isTsMongoEnabled()) {
    logger.warn(
      "[mongo] URI presente ma VC_TS_MONGO≠1 — non connetto (evita doppio write col JS live).",
    );
    return false;
  }
  if (db) return true;

  try {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8_000 });
    await client.connect();
    db = client.db();
    await ensureIndexes(db);
    logger.info(`[mongo] connected db=${db.databaseName} (collezioni ${Object.values(TS_COLLECTIONS).join(", ")})`);
    return true;
  } catch (err) {
    logger.error("[mongo] connect failed", err);
    client = null;
    db = null;
    return false;
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection(TS_COLLECTIONS.modCases).createIndexes([
    { key: { guildId: 1, id: 1 }, unique: true, name: "guild_id" },
    { key: { guildId: 1, userId: 1, at: -1 }, name: "guild_user_at" },
    { key: { guildId: 1, at: -1 }, name: "guild_at" },
  ]);
  await database.collection(TS_COLLECTIONS.activityHourly).createIndexes([
    { key: { guildId: 1, hourKey: 1 }, unique: true, name: "guild_hour" },
  ]);
  await database.collection(TS_COLLECTIONS.userExp).createIndexes([
    { key: { guildId: 1, userId: 1 }, unique: true, name: "guild_user" },
    { key: { guildId: 1, totalExp: -1 }, name: "guild_exp" },
  ]);
  await database.collection(TS_COLLECTIONS.wallets).createIndexes([
    { key: { guildId: 1, userId: 1 }, unique: true, name: "guild_user" },
  ]);
  await database.collection(TS_COLLECTIONS.staffPoints).createIndexes([
    { key: { guildId: 1, userId: 1 }, unique: true, name: "guild_user" },
    { key: { guildId: 1, points: -1 }, name: "guild_points" },
  ]);
  await database.collection(TS_COLLECTIONS.tickets).createIndexes([
    { key: { id: 1 }, unique: true, name: "id" },
    { key: { guildId: 1, status: 1 }, name: "guild_status" },
  ]);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close().catch(() => undefined);
  }
  client = null;
  db = null;
}
