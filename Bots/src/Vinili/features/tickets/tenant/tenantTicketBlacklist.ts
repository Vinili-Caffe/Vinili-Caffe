const crypto = require("node:crypto") as typeof import("node:crypto");
const { getBotState, setBotState } = require("../../../Utils/BotState/botStateStore") as typeof import("../../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../../Utils/Database/mongoConnect") as typeof import("../../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTicketBlacklist.v1";
const MAX_ENTRIES = 200;
const MAX_REASON = 200;

let blacklistCache = Object.freeze({});

function newEntryId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeSnowflake(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,22}$/.test(id) ? id : null;
}

function normalizePanelId(value?) {
  const id = String(value || "").trim();
  if (!id || id === "*" || id === "all") return null;
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : null;
}

function normalizeEntryType(value?) {
  const t = String(value || "").trim().toLowerCase();
  if (t === "user" || t === "member") return "user";
  if (t === "role") return "role";
  return null;
}

function normalizeEntry(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const type = normalizeEntryType(src.type ?? base.type);
  const targetId = normalizeSnowflake(src.targetId ?? src.id ?? src.userId ?? src.roleId ?? base.targetId);
  if (!type || !targetId) return null;
  const reason = String(src.reason ?? base.reason ?? "")
    .trim()
    .slice(0, MAX_REASON);
  return {
    id: String(src.id || base.id || newEntryId()).trim() || newEntryId(),
    type,
    targetId,
    panelId: normalizePanelId(src.panelId ?? base.panelId),
    reason: reason || null,
    createdAt: src.createdAt || base.createdAt || new Date().toISOString(),
    createdBy: normalizeSnowflake(src.createdBy ?? base.createdBy) || null,
  };
}

function emptyBucket() {
  return { entries: [] };
}

function normalizeBucket(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const entries = [];
  const seen = new Set();
  for (const row of Array.isArray(src.entries) ? src.entries : []) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    const key = `${entry.type}:${entry.targetId}:${entry.panelId || "*"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= MAX_ENTRIES) break;
  }
  return { entries };
}

function readRootFromCache() {
  return blacklistCache && typeof blacklistCache === "object" ? blacklistCache : {};
}

async function loadBlacklistRoot() {
  if (!isMongoReady()) return readRootFromCache();
  const raw = await getBotState(BOT_STATE_KEY, {});
  const root = raw && typeof raw === "object" ? raw : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(root)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeBucket(bucket);
  }
  blacklistCache = Object.freeze(next);
  return blacklistCache;
}

async function saveBlacklistRoot(root?) {
  const src = root && typeof root === "object" ? root : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(src)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeBucket(bucket);
  }
  const ok = await setBotState(BOT_STATE_KEY, next);
  if (ok) blacklistCache = Object.freeze(next);
  return ok;
}

function getGuildTicketBlacklistSync(guildId?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return emptyBucket();
  const hit = readRootFromCache()[gid];
  return hit ? normalizeBucket(hit) : emptyBucket();
}

async function getGuildTicketBlacklist(guildId?) {
  await loadBlacklistRoot();
  return getGuildTicketBlacklistSync(guildId);
}

async function refreshTicketBlacklistCache() {
  return loadBlacklistRoot();
}

async function mutateGuildTicketBlacklist(guildId?, mutator?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  const root = { ...(await loadBlacklistRoot()) };
  const prev = normalizeBucket(root[gid]);
  const nextBucket = normalizeBucket(mutator(prev) || prev);
  root[gid] = nextBucket;
  const saved = await saveBlacklistRoot(root);
  if (!saved) return { ok: false, reason: "persist_failed", bucket: prev };
  return { ok: true, bucket: nextBucket };
}

function memberIsTicketBlacklisted(member?, guildId?, panelId = null) {
  if (!member) return false;
  const bucket = getGuildTicketBlacklistSync(guildId);
  const entries = bucket.entries || [];
  if (!entries.length) return false;
  const uid = String(member.id || member.user?.id || "").trim();
  const roleCache = member.roles?.cache;
  const wantPanel = normalizePanelId(panelId);

  for (const entry of entries) {
    const entryPanel = entry.panelId || null;
        if (entryPanel && entryPanel !== wantPanel) continue;
    if (entry.type === "user" && uid && entry.targetId === uid) return true;
    if (entry.type === "role" && roleCache?.has?.(entry.targetId)) return true;
  }
  return false;
}

async function addGuildTicketBlacklistEntry(guildId?, payload: Record<string, any> = {}) {
  const entry = normalizeEntry(payload);
  if (!entry) return { ok: false, reason: "invalid_entry" };
  let created = null;
  let duplicate = false;
  const saved = await mutateGuildTicketBlacklist(guildId, (prev?) => {
    const entries = [...(prev.entries || [])];
    const key = `${entry.type}:${entry.targetId}:${entry.panelId || "*"}`;
    if (entries.some((e?) => `${e.type}:${e.targetId}:${e.panelId || "*"}` === key)) {
      duplicate = true;
      return prev;
    }
    if (entries.length >= MAX_ENTRIES) return prev;
    created = entry;
    entries.unshift(entry);
    return { entries };
  });
  if (!saved.ok) return saved;
  if (duplicate) return { ok: false, reason: "duplicate", bucket: saved.bucket };
  if (!created) return { ok: false, reason: "quota", bucket: saved.bucket };
  return { ok: true, entry: created, bucket: saved.bucket };
}

async function removeGuildTicketBlacklistEntry(guildId?, entryId?) {
  const id = String(entryId || "").trim();
  if (!id) return { ok: false, reason: "not_found" };
  let removed = null;
  const saved = await mutateGuildTicketBlacklist(guildId, (prev?) => {
    const entries = [...(prev.entries || [])];
    const idx = entries.findIndex((e?) => String(e.id) === id);
    if (idx < 0) return prev;
    removed = entries[idx];
    entries.splice(idx, 1);
    return { entries };
  });
  if (!saved.ok) return saved;
  if (!removed) return { ok: false, reason: "not_found", bucket: saved.bucket };
  return { ok: true, entry: removed, bucket: saved.bucket };
}

export = {
  BOT_STATE_KEY,
  MAX_ENTRIES,
  MAX_REASON,
  newEntryId,
  normalizeEntry,
  normalizePanelId,
  getGuildTicketBlacklist,
  getGuildTicketBlacklistSync,
  refreshTicketBlacklistCache,
  mutateGuildTicketBlacklist,
  addGuildTicketBlacklistEntry,
  removeGuildTicketBlacklistEntry,
  memberIsTicketBlacklisted,
};
