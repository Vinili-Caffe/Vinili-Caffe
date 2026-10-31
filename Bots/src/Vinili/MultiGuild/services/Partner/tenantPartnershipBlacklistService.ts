const { getBotState, setBotState } = require("../../../Utils/BotState/botStateStore") as typeof import("../../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../../Utils/Database/mongoConnect") as typeof import("../../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");

const BOT_STATE_KEY = "tenantPartnershipBlacklist.v1";

function normalizeTargetGuildId(id?) {
  const s = String(id || "").trim();
  if (!/^\d{16,20}$/.test(s)) return null;
  return s;
}

async function loadBlacklistMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function saveBlacklistMap(map?) {
  if (!isMongoReady()) return false;
  return setBotState(BOT_STATE_KEY, map);
}

function normalizeEntry(raw: Record<string, any> = {}) {
  const guildId = normalizeTargetGuildId(raw.guildId);
  if (!guildId) return null;
  return {
    guildId,
    addedBy: String(raw.addedBy || "").trim(),
    note: String(raw.note || "").slice(0, 500),
    addedAt: raw.addedAt ? new Date(raw.addedAt) : new Date(),
    invite: String(raw.invite || "").trim().slice(0, 300) || null,
    guildName: String(raw.guildName || "").trim().slice(0, 100) || null,
    iconUrl: String(raw.iconUrl || "").trim().slice(0, 500) || null,
  };
}

async function listTenantPartnershipBlacklistGuilds(ownerGuildId?, limit = 50) {
  const ownerId = normalizeGuildId(ownerGuildId);
  if (!ownerId) return [];
  const map = await loadBlacklistMap();
  const rows = Array.isArray(map[ownerId]) ? map[ownerId] : [];
  return rows
    .map((row?) => normalizeEntry(row))
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(200, Math.floor(limit))));
}

async function isTenantPartnershipGuildBlacklisted(ownerGuildId?, targetGuildId?) {
  const ownerId = normalizeGuildId(ownerGuildId);
  const targetId = normalizeTargetGuildId(targetGuildId);
  if (!ownerId || !targetId) return false;
  const rows = await listTenantPartnershipBlacklistGuilds(ownerId, 500);
  return rows.some((row?) => row.guildId === targetId);
}

async function addTenantPartnershipBlacklistGuild(ownerGuildId?, targetGuildId?, addedBy?, note = "", meta: Record<string, any> = {}) {
  const ownerId = normalizeGuildId(ownerGuildId);
  const targetId = normalizeTargetGuildId(targetGuildId);
  if (!ownerId || !targetId) return { ok: false, reason: "invalid_id" };
  if (ownerId === targetId) return { ok: false, reason: "self_blacklist" };

  const map = await loadBlacklistMap();
  const prev = Array.isArray(map[ownerId]) ? map[ownerId] : [];
  const next = prev.filter((row?) => String(row?.guildId || "") !== targetId);
  const invite = String(meta?.invite || "").trim();
  const guildName = String(meta?.guildName || "").trim();
  const iconUrl = String(meta?.iconUrl || "").trim();
  next.push({
    guildId: targetId,
    addedBy: String(addedBy || ""),
    note: String(note || "").slice(0, 500),
    addedAt: new Date(),
    ...(invite ? { invite: invite.slice(0, 300) } : {}),
    ...(guildName ? { guildName: guildName.slice(0, 100) } : {}),
    ...(iconUrl ? { iconUrl: iconUrl.slice(0, 500) } : {}),
  });
  map[ownerId] = next;
  const saved = await saveBlacklistMap(map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, guildId: targetId };
}

async function removeTenantPartnershipBlacklistGuild(ownerGuildId?, targetGuildId?) {
  const ownerId = normalizeGuildId(ownerGuildId);
  const targetId = normalizeTargetGuildId(targetGuildId);
  if (!ownerId || !targetId) return { ok: false, reason: "invalid_id" };

  const map = await loadBlacklistMap();
  const prev = Array.isArray(map[ownerId]) ? map[ownerId] : [];
  const next = prev.filter((row?) => String(row?.guildId || "") !== targetId);
  map[ownerId] = next;
  const saved = await saveBlacklistMap(map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, deleted: prev.length > next.length, guildId: targetId };
}

async function clearTenantPartnershipBlacklist(ownerGuildId?) {
  const ownerId = normalizeGuildId(ownerGuildId);
  if (!ownerId) return { ok: false, reason: "invalid_id" };
  const map = await loadBlacklistMap();
  if (!Array.isArray(map[ownerId]) || !map[ownerId].length) {
    return { ok: true, deleted: false };
  }
  delete map[ownerId];
  const saved = await saveBlacklistMap(map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, deleted: true };
}

export = {
  normalizeTargetGuildId,
  listTenantPartnershipBlacklistGuilds,
  isTenantPartnershipGuildBlacklisted,
  addTenantPartnershipBlacklistGuild,
  removeTenantPartnershipBlacklistGuild,
  clearTenantPartnershipBlacklist,
};
