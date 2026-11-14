/**
 * Giveaway programmati dalla dashboard: restano qui finché non arriva l'ora, poi il bot li pubblica
 * come un giveaway normale (stesso percorso di "Pubblica giveaway").
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

type ScheduledGiveaway = {
  id: string;
  prize: string;
  channelId: string;
  hostId: string;
  durationMs: number;
  winnerCount: number;
  minLevel: number;
  startAt: string;
  createdBy: string;
  createdAt: string;
};

const MAX_PER_GUILD = 25;

function normalize(raw: unknown): ScheduledGiveaway[] {
  const out: ScheduledGiveaway[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const x: any = r || {};
    const start = new Date(x.startAt).getTime();
    const durationMs = Math.floor(Number(x.durationMs));
    const prize = String(x.prize || "").trim().slice(0, 200);
    if (!prize || !T.isId(x.channelId) || !Number.isFinite(start) || !Number.isFinite(durationMs) || durationMs < 60_000) continue;
    out.push({
      id: String(x.id || "").slice(0, 40) || Date.now().toString(36),
      prize,
      channelId: String(x.channelId),
      hostId: T.isId(x.hostId) ? String(x.hostId) : "",
      durationMs,
      winnerCount: Math.max(1, Math.min(20, Math.floor(Number(x.winnerCount) || 1))),
      minLevel: Math.max(0, Math.min(10000, Math.floor(Number(x.minLevel) || 0))),
      startAt: new Date(start).toISOString(),
      createdBy: String(x.createdBy || ""),
      createdAt: String(x.createdAt || new Date().toISOString()),
    });
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, MAX_PER_GUILD);
}

async function list(guildId: string, fresh = true): Promise<ScheduledGiveaway[]> {
  const blob = await T.getGuildBlob("giveawaysScheduled", String(guildId), fresh).catch(() => null);
  return normalize(blob?.items);
}

async function save(guildId: string, items: ScheduledGiveaway[]) {
  await T.setGuildBlob("giveawaysScheduled", String(guildId), items.length ? { items: normalize(items) } : null);
}

async function add(guildId: string, item: Omit<ScheduledGiveaway, "id" | "createdAt">) {
  const items = await list(guildId);
  if (items.length >= MAX_PER_GUILD) return { ok: false as const, message: `Massimo ${MAX_PER_GUILD} giveaway programmati.` };
  items.push({ ...item, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() });
  await save(guildId, items);
  return { ok: true as const };
}

/** Toglie e restituisce un programmato (per annullarlo o farlo partire subito). */
async function take(guildId: string, id: string): Promise<ScheduledGiveaway | null> {
  const items = await list(guildId);
  const hit = items.find((x) => x.id === String(id)) || null;
  if (hit) await save(guildId, items.filter((x) => x.id !== hit.id));
  return hit;
}

/** Toglie e restituisce quelli arrivati all'ora (graceMs: ritardo minimo, per non pestare i piedi al timer del bot). */
async function takeDue(guildId: string, graceMs = 0): Promise<ScheduledGiveaway[]> {
  const items = await list(guildId);
  const limit = Date.now() - graceMs;
  const due = items.filter((x) => new Date(x.startAt).getTime() <= limit);
  if (due.length) await save(guildId, items.filter((x) => !due.includes(x)));
  return due;
}

/** Server con almeno un giveaway programmato. */
async function guildsWithScheduled(): Promise<string[]> {
  const all = await T.allGuildBlobs("giveawaysScheduled", true).catch(() => null);
  return all && typeof all === "object" ? Object.keys(all).filter((k) => Array.isArray(all[k]?.items) && all[k].items.length) : [];
}

let ticker: NodeJS.Timeout | null = null;
/** Ogni 30 secondi pubblica i giveaway arrivati all'ora (un solo processo lo avvia). */
function startTicker(client?) {
  if (ticker) return;
  const run = async () => {
    const X = require("../site/dashboard/dashboardCommunityExtraApi") as typeof import("../site/dashboard/dashboardCommunityExtraApi");
    for (const gid of await guildsWithScheduled().catch(() => [] as string[])) {
      for (const item of await takeDue(gid).catch(() => [] as ScheduledGiveaway[])) {
        const out: any = await X.publishGiveaway(client, gid, item).catch((e: any) => ({ ok: false, message: String(e?.message || e) }));
        if (!out?.ok) global.logger?.warn?.("[giveawaySchedule] pubblicazione non riuscita:", gid, item.prize, out?.message);
      }
    }
  };
  ticker = setInterval(() => void run().catch(() => null), 30_000);
  ticker.unref?.();
  void run().catch(() => null);
}

export = { list, add, take, takeDue, startTicker };
