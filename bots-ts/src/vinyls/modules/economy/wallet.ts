import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";

export interface Wallet {
  guildId: string;
  userId: string;
  balance: number;
  lastDailyAt: number;
  lastWeeklyAt: number;
  lastMonthlyAt: number;
  lastWorkAt: number;
  inventory: Record<string, number>;
}

const wallets = new Map<string, Wallet>();
const dirty = new Set<string>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function ensure(guildId: string, userId: string): Wallet {
  const k = key(guildId, userId);
  let w = wallets.get(k);
  if (!w) {
    w = {
      guildId,
      userId,
      balance: 0,
      lastDailyAt: 0,
      lastWeeklyAt: 0,
      lastMonthlyAt: 0,
      lastWorkAt: 0,
      inventory: {},
    };
    wallets.set(k, w);
  }
  if (!w.inventory) w.inventory = {};
  return w;
}

function mark(guildId: string, userId: string): void {
  if (isMongoConnected()) dirty.add(key(guildId, userId));
}

export function getBalance(guildId: string, userId: string): number {
  return ensure(guildId, userId).balance;
}

export function getInventory(guildId: string, userId: string): Record<string, number> {
  return { ...ensure(guildId, userId).inventory };
}

export function addCoins(guildId: string, userId: string, amount: number): number {
  const w = ensure(guildId, userId);
  w.balance = Math.max(0, w.balance + Math.floor(amount));
  mark(guildId, userId);
  return w.balance;
}

export function transfer(
  guildId: string,
  fromId: string,
  toId: string,
  amount: number,
): { ok: true; from: number; to: number } | { ok: false; error: string } {
  const n = Math.floor(amount);
  if (n <= 0) return { ok: false, error: "Importo non valido." };
  if (fromId === toId) return { ok: false, error: "Non puoi pagare te stesso." };
  const from = ensure(guildId, fromId);
  if (from.balance < n) return { ok: false, error: "Saldo insufficiente." };
  from.balance -= n;
  const to = ensure(guildId, toId);
  to.balance += n;
  mark(guildId, fromId);
  mark(guildId, toId);
  return { ok: true, from: from.balance, to: to.balance };
}

type ClaimFail = { ok: false; error: string; retryInMs: number };
type ClaimOk = { ok: true; amount: number; balance: number };

function claimPeriod(
  guildId: string,
  userId: string,
  field: "lastDailyAt" | "lastWeeklyAt" | "lastMonthlyAt",
  periodMs: number,
  amount: number,
  label: string,
): ClaimOk | ClaimFail {
  const w = ensure(guildId, userId);
  const now = Date.now();
  const last = w[field];
  const elapsed = now - last;
  if (last && elapsed < periodMs) {
    return { ok: false, error: `${label} già preso.`, retryInMs: periodMs - elapsed };
  }
  w[field] = now;
  w.balance += amount;
  mark(guildId, userId);
  return { ok: true, amount, balance: w.balance };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const WORK_CD_MS = 60 * 60 * 1000;

export function claimDaily(guildId: string, userId: string): ClaimOk | ClaimFail {
  return claimPeriod(guildId, userId, "lastDailyAt", DAY_MS, 250, "Daily");
}

export function claimWeekly(guildId: string, userId: string): ClaimOk | ClaimFail {
  return claimPeriod(guildId, userId, "lastWeeklyAt", WEEK_MS, 1_500, "Weekly");
}

export function claimMonthly(guildId: string, userId: string): ClaimOk | ClaimFail {
  return claimPeriod(guildId, userId, "lastMonthlyAt", MONTH_MS, 5_000, "Monthly");
}

export function tryWork(
  guildId: string,
  userId: string,
): ClaimOk | ClaimFail {
  const w = ensure(guildId, userId);
  const now = Date.now();
  const elapsed = now - w.lastWorkAt;
  if (w.lastWorkAt && elapsed < WORK_CD_MS) {
    return { ok: false, error: "Work in cooldown.", retryInMs: WORK_CD_MS - elapsed };
  }
  const amount = 40 + Math.floor(Math.random() * 80);
  w.lastWorkAt = now;
  w.balance += amount;
  mark(guildId, userId);
  return { ok: true, amount, balance: w.balance };
}

export function buyItem(
  guildId: string,
  userId: string,
  itemId: string,
  price: number,
): { ok: true; balance: number; qty: number } | { ok: false; error: string } {
  const w = ensure(guildId, userId);
  const p = Math.floor(price);
  if (p <= 0) return { ok: false, error: "Prezzo non valido." };
  if (w.balance < p) return { ok: false, error: "Saldo insufficiente." };
  w.balance -= p;
  w.inventory[itemId] = (w.inventory[itemId] || 0) + 1;
  mark(guildId, userId);
  return { ok: true, balance: w.balance, qty: w.inventory[itemId]! };
}

export async function flushWalletsToMongo(): Promise<number> {
  if (!dirty.size || !isMongoConnected()) return 0;
  const database = getDb();
  if (!database) return 0;
  const col = database.collection(TS_COLLECTIONS.wallets);
  const keys = [...dirty];
  dirty.clear();
  let n = 0;
  for (const k of keys) {
    const w = wallets.get(k);
    if (!w) continue;
    try {
      await col.updateOne(
        { guildId: w.guildId, userId: w.userId },
        { $set: { ...w, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      n += 1;
    } catch (err) {
      logger.error("[economy] flush", err);
      dirty.add(k);
    }
  }
  return n;
}

export async function hydrateWalletsFromMongo(limit = 5_000): Promise<number> {
  if (!isMongoConnected()) return 0;
  const database = getDb();
  if (!database) return 0;
  const docs = await database
    .collection(TS_COLLECTIONS.wallets)
    .find({})
    .limit(limit)
    .toArray()
    .catch(() => [] as Record<string, unknown>[]);
  let n = 0;
  for (const raw of docs) {
    const guildId = String(raw.guildId || "");
    const userId = String(raw.userId || "");
    if (!guildId || !userId) continue;
    const w = ensure(guildId, userId);
    w.balance = Math.max(0, Math.floor(Number(raw.balance) || 0));
    w.lastDailyAt = Math.max(0, Math.floor(Number(raw.lastDailyAt) || 0));
    w.lastWeeklyAt = Math.max(0, Math.floor(Number(raw.lastWeeklyAt) || 0));
    w.lastMonthlyAt = Math.max(0, Math.floor(Number(raw.lastMonthlyAt) || 0));
    w.lastWorkAt = Math.max(0, Math.floor(Number(raw.lastWorkAt) || 0));
    w.inventory =
      raw.inventory && typeof raw.inventory === "object"
        ? (raw.inventory as Record<string, number>)
        : {};
    n += 1;
  }
  if (n) logger.info(`[economy] hydrated ${n} wallets`);
  return n;
}
