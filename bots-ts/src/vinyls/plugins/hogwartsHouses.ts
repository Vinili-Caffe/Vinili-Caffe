import { logger } from "../../shared";

/** Hogwarts houses — store in-memory/plugin (no inventati prefix sorting). */
export type HouseId = "gryffindor" | "slytherin" | "ravenclaw" | "hufflepuff";

export const HOUSES: HouseId[] = ["gryffindor", "slytherin", "ravenclaw", "hufflepuff"];

interface MemberRow {
  houseId: HouseId;
  total: number;
  byPeriod: Record<string, number>;
}

const byGuildEvent = new Map<string, Map<string, MemberRow>>(); // key guild:event → user → row
const sorted = new Map<string, HouseId>(); // guild:user → house

function ek(guildId: string, eventKey: string): string {
  return `${guildId}:${eventKey || "default"}`;
}

function periodKeyNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-W${Math.ceil(d.getUTCDate() / 7)}`;
}

export function normalizeHouseInput(raw: string): HouseId | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (HOUSES.includes(s as HouseId)) return s as HouseId;
  const aliases: Record<string, HouseId> = {
    grifondoro: "gryffindor",
    serpeverde: "slytherin",
    corvonero: "ravenclaw",
    tasso: "hufflepuff",
    g: "gryffindor",
    s: "slytherin",
    r: "ravenclaw",
    h: "hufflepuff",
  };
  return aliases[s] || null;
}

export function assignHouse(guildId: string, userId: string, houseId: HouseId): void {
  sorted.set(`${guildId}:${userId}`, houseId);
}

export function getHouse(guildId: string, userId: string): HouseId | null {
  return sorted.get(`${guildId}:${userId}`) || null;
}

export function addHousePoints(opts: {
  guildId: string;
  eventKey?: string;
  userId: string;
  houseId?: HouseId | string;
  points: number;
}): { ok: boolean; total: number; houseId: HouseId | null } {
  const pts = Math.floor(Number(opts.points) || 0);
  if (pts <= 0) return { ok: false, total: 0, houseId: null };
  let house =
    (opts.houseId ? normalizeHouseInput(String(opts.houseId)) : null) || getHouse(opts.guildId, opts.userId);
  if (!house) {
    house = HOUSES[Math.floor(Math.random() * HOUSES.length)]!;
    assignHouse(opts.guildId, opts.userId, house);
  } else {
    assignHouse(opts.guildId, opts.userId, house);
  }
  const mapKey = ek(opts.guildId, opts.eventKey || "default");
  let members = byGuildEvent.get(mapKey);
  if (!members) {
    members = new Map();
    byGuildEvent.set(mapKey, members);
  }
  let row = members.get(opts.userId);
  if (!row) {
    row = { houseId: house, total: 0, byPeriod: {} };
    members.set(opts.userId, row);
  }
  row.houseId = house;
  row.total += pts;
  const pk = periodKeyNow();
  row.byPeriod[pk] = (row.byPeriod[pk] || 0) + pts;
  return { ok: true, total: row.total, houseId: house };
}

export function getMemberPoints(
  guildId: string,
  userId: string,
  eventKey = "default",
): { totalPoints: number; periodPoints: number; houseId: HouseId | null } {
  const members = byGuildEvent.get(ek(guildId, eventKey));
  const row = members?.get(userId);
  const pk = periodKeyNow();
  return {
    totalPoints: row?.total || 0,
    periodPoints: row?.byPeriod?.[pk] || 0,
    houseId: row?.houseId || getHouse(guildId, userId),
  };
}

export function houseLeaderboard(
  guildId: string,
  houseId: HouseId,
  eventKey = "default",
  limit = 10,
): Array<{ userId: string; totalPoints: number; periodPoints: number }> {
  const members = byGuildEvent.get(ek(guildId, eventKey));
  if (!members) return [];
  const pk = periodKeyNow();
  return [...members.entries()]
    .filter(([, r]) => r.houseId === houseId)
    .map(([userId, r]) => ({
      userId,
      totalPoints: r.total,
      periodPoints: r.byPeriod[pk] || 0,
    }))
    .sort((a, b) => b.periodPoints - a.periodPoints || b.totalPoints - a.totalPoints)
    .slice(0, limit);
}

export function cupTotals(guildId: string, eventKey = "default"): Record<HouseId, number> {
  const out: Record<HouseId, number> = {
    gryffindor: 0,
    slytherin: 0,
    ravenclaw: 0,
    hufflepuff: 0,
  };
  const members = byGuildEvent.get(ek(guildId, eventKey));
  if (!members) return out;
  for (const r of members.values()) out[r.houseId] += r.total;
  return out;
}

export function logHogwartsReady(): void {
  logger.info("[hogwarts] houses/points store ready (in-memory plugin)");
}
