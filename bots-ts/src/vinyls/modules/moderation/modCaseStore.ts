import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";

export type ModCaseType = "warn" | "kick" | "ban" | "mute" | "unmute" | "unban";

export interface ModCaseContext {
  channelId?: string | null;
  messageId?: string | null;
}

export interface ModCase {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  /** Lowercase type (warn/kick/…). */
  type: ModCaseType;
  /** Uppercase action allineato al JS live (WARN/KICK/…). */
  action: string;
  reason: string;
  at: number;
  durationMs?: number;
  expiresAt?: number | null;
  active: boolean;
  context?: ModCaseContext;
  closedAt?: number | null;
  closeReason?: string | null;
}

const byGuild = new Map<string, ModCase[]>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `C${seq.toString(36).toUpperCase()}-${Date.now().toString(36)}`;
}

function persistAsync(full: ModCase): void {
  if (!isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  void database
    .collection(TS_COLLECTIONS.modCases)
    .updateOne(
      { guildId: full.guildId, id: full.id },
      {
        $set: { ...full, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date(full.at) },
      },
      { upsert: true },
    )
    .catch((err) => logger.error("[modCase] mongo upsert", err));
}

export function addCase(
  entry: Omit<ModCase, "id" | "at" | "action" | "active"> & {
    at?: number;
    action?: string;
    active?: boolean;
    expiresAt?: number | null;
  },
): ModCase {
  const at = entry.at ?? Date.now();
  const durationMs = entry.durationMs;
  const expiresAt =
    entry.expiresAt !== undefined
      ? entry.expiresAt
      : durationMs && entry.type === "mute"
        ? at + durationMs
        : null;

  const full: ModCase = {
    ...entry,
    id: nextId(),
    at,
    action: (entry.action || entry.type).toUpperCase(),
    active: entry.active !== false,
    expiresAt,
    durationMs,
  };
  const list = byGuild.get(full.guildId) || [];
  list.push(full);
  byGuild.set(full.guildId, list);
  persistAsync(full);
  return full;
}

export function closeCase(
  guildId: string,
  caseId: string,
  closeReason = "closed",
): ModCase | null {
  const c = getCase(guildId, caseId);
  if (!c) return null;
  c.active = false;
  c.closedAt = Date.now();
  c.closeReason = closeReason;
  persistAsync(c);
  return c;
}

export function listActiveMutes(guildId?: string): ModCase[] {
  const now = Date.now();
  const all = guildId
    ? byGuild.get(guildId) || []
    : [...byGuild.values()].flat();
  return all.filter(
    (c) => c.type === "mute" && c.active && c.expiresAt != null && c.expiresAt > now,
  );
}

export function listCasesForUser(guildId: string, userId: string, type?: ModCaseType): ModCase[] {
  const list = byGuild.get(guildId) || [];
  return list.filter((c) => c.userId === userId && (!type || c.type === type));
}

export function listRecentGuildCases(guildId: string, limit = 20): ModCase[] {
  const list = byGuild.get(guildId) || [];
  return list.slice(-Math.max(1, limit));
}

export function getCase(guildId: string, caseId: string): ModCase | undefined {
  return (byGuild.get(guildId) || []).find((c) => c.id.toLowerCase() === caseId.toLowerCase());
}

export function setCaseReason(guildId: string, caseId: string, reason: string): ModCase | null {
  const c = getCase(guildId, caseId);
  if (!c) return null;
  c.reason = reason.slice(0, 512) || "Nessun motivo specificato";
  persistAsync(c);
  return c;
}

/** Rimuove un singolo caso (es. delwarn). */
export function deleteCase(guildId: string, caseId: string): ModCase | null {
  const list = byGuild.get(guildId) || [];
  const idx = list.findIndex((c) => c.id.toLowerCase() === caseId.toLowerCase());
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  byGuild.set(guildId, list);
  if (removed && isMongoConnected()) {
    const database = getDb();
    if (database) {
      void database
        .collection(TS_COLLECTIONS.modCases)
        .deleteOne({ guildId, id: removed.id })
        .catch((err) => logger.error("[modCase] mongo delete", err));
    }
  }
  return removed || null;
}

export function clearCasesOfType(guildId: string, userId: string, type: ModCaseType): number {
  const list = byGuild.get(guildId) || [];
  const keep = list.filter((c) => !(c.userId === userId && c.type === type));
  const removed = list.length - keep.length;
  byGuild.set(guildId, keep);

  if (removed && isMongoConnected()) {
    const database = getDb();
    if (database) {
      void database
        .collection(TS_COLLECTIONS.modCases)
        .deleteMany({ guildId, userId, type })
        .catch((err) => logger.error("[modCase] mongo clear", err));
    }
  }
  return removed;
}

export async function hydrateModCasesFromMongo(limitPerGuild = 200): Promise<number> {
  if (!isMongoConnected()) return 0;
  const database = getDb();
  if (!database) return 0;
  const docs = await database
    .collection(TS_COLLECTIONS.modCases)
    .find({})
    .sort({ at: -1 })
    .limit(Math.max(100, limitPerGuild * 20))
    .toArray()
    .catch((err) => {
      logger.error("[modCase] hydrate", err);
      return [] as Record<string, unknown>[];
    });

  let n = 0;
  for (const raw of docs) {
    const c = raw as unknown as ModCase;
    if (!c?.guildId || !c?.id) continue;
    const list = byGuild.get(c.guildId) || [];
    if (list.some((x) => x.id === c.id)) continue;
    list.push({
      id: String(c.id),
      guildId: String(c.guildId),
      userId: String(c.userId),
      moderatorId: String(c.moderatorId),
      type: c.type,
      action: String(c.action || c.type).toUpperCase(),
      reason: String(c.reason || ""),
      at: Number(c.at) || Date.now(),
      durationMs: c.durationMs != null ? Number(c.durationMs) : undefined,
      expiresAt: c.expiresAt != null ? Number(c.expiresAt) : null,
      active: c.active !== false,
      context: c.context,
      closedAt: c.closedAt != null ? Number(c.closedAt) : null,
      closeReason: c.closeReason != null ? String(c.closeReason) : null,
    });
    list.sort((a, b) => a.at - b.at);
    byGuild.set(c.guildId, list);
    n += 1;
  }
  if (n) logger.info(`[modCase] hydrated ${n} from mongo`);
  return n;
}
