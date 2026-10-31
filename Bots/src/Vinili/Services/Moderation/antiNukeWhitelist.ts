/** Antinuke: chi può fare azioni pericolose (whitelist, manutenzione, bot verificati). */
const { UserFlagsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { isSecurityProfileImmune, hasAdminsProfileCapability, getSecurityStaticsSnapshot } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");

const UNKNOWN_EXECUTOR_ID = "__unknown_audit_executor__";
const VERIFIED_BOT_IDS = new Set(Object.values(IDs?.bots || {}).filter(Boolean).map(String),);
const VERIFIED_BOT_CACHE = new Map();
const MAINTENANCE_ALLOWLIST = new Map();
const MAINTENANCE_MAX_MS = 2 * 60 * 60_000;

function getMainRoleIds(guild?) {
  const statics = getSecurityStaticsSnapshot(String(guild?.id || ""));
  const dynamicMainRoles = Array.isArray(statics?.mainRoleIds) ? statics.mainRoleIds.map((id?) => String(id || "").trim()).filter(Boolean) : [];
  if (dynamicMainRoles.length) {
    return new Set([String(guild?.id || ""), ...dynamicMainRoles].filter(Boolean));
  }
  return new Set(
    [
      String(guild?.id || ""),
      String(IDs.roles.Member || ""),
      String(IDs.roles.separatore6 || ""),
      String(IDs.roles.separatore8 || ""),
      String(IDs.roles.separatore5 || ""),
      String(IDs.roles.separatore7 || ""),
    ].filter(Boolean),
  );
}

function cleanupMaintenanceAllowlist(guildId?, at = Date.now()) {
  const key = String(guildId || "");
  const bucket = MAINTENANCE_ALLOWLIST.get(key);
  if (!bucket) return;
  for (const [userId, expiresAt] of bucket.entries()) {
    if (Number(expiresAt || 0) <= at) bucket.delete(String(userId));
  }
  if (!bucket.size) MAINTENANCE_ALLOWLIST.delete(key);
}

function isMaintenanceAllowed(guildId?, userId?, at = Date.now()) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return false;
  cleanupMaintenanceAllowlist(g, at);
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  const expiresAt = Number(bucket?.get(u) || 0);
  return expiresAt > at;
}

function isWhitelistedExecutor(guild?, executorId?) {
  const userId = String(executorId || "");
  if (!userId || userId === UNKNOWN_EXECUTOR_ID) return false;
  if (isMaintenanceAllowed(guild?.id, userId)) return true;
  if (String(guild?.ownerId || "") === userId) return true;
  const member = guild?.members?.cache?.get(userId);
  if (isSecurityProfileImmune(String(guild?.id || ""), userId)) return true;
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (CORE_EXEMPT_USER_IDS.has(userId)) return true;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (!member) return false;
  if (member.roles.cache.has(String(IDs.roles.Founder || ""))) {
    return true;
  }
  return false;
}

async function isVerifiedBotExecutor(guild?, executorId?) {
  const userId = String(executorId || "");
  if (!userId) return false;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (VERIFIED_BOT_CACHE.has(userId)) return VERIFIED_BOT_CACHE.get(userId);

  let verified = false;
  try {
    const member = guild?.members?.cache?.get(userId) || (await guild?.members?.fetch(userId).catch(() => null));
    const user = member?.user;
    if (user?.bot) {
      const flags = user.flags || (typeof user.fetchFlags === "function" ? await user.fetchFlags().catch(() => null) : null);
      verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
    }
  } catch {
    verified = false;
  }
  VERIFIED_BOT_CACHE.set(userId, verified);
  return verified;
}

async function isWhitelistedExecutorAsync(guild?, executorId?) {
  const userId = String(executorId || "");
  if (!userId || userId === UNKNOWN_EXECUTOR_ID) return false;
  if (isMaintenanceAllowed(guild?.id, userId)) return true;
  if (String(guild?.ownerId || "") === userId) return true;
  let member = guild?.members?.cache?.get(userId) || null;
  if (isSecurityProfileImmune(String(guild?.id || ""), userId)) return true;
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (CORE_EXEMPT_USER_IDS.has(userId)) return true;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (await isVerifiedBotExecutor(guild, userId)) return true;
  if (!member) member = await guild?.members?.fetch(userId).catch(() => null);
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (!member) return false;
  if (member.roles.cache.has(String(IDs.roles.Founder || ""))) {
    return true;
  }
  return false;
}

function isCategoryWhitelisted(channel?) {
  const set = ANTINUKE_CONFIG.panicMode.whitelistCategoryIds;
  if (!set || !set.size || !channel) return false;
  const parentId = String(channel.parentId || "");
  const id = String(channel.id || "");
  return set.has(parentId) || set.has(id);
}

function addMaintenanceAllowlistUser(guildId?, userId?, durationMs = 15 * 60_000) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return { ok: false, reason: "missing_ids" };
  const safeDuration = Math.max(60_000, Math.min(MAINTENANCE_MAX_MS, Number(durationMs || 0)));
  cleanupMaintenanceAllowlist(g, Date.now());
  const bucket = MAINTENANCE_ALLOWLIST.get(g) || new Map();
  const expiresAt = Date.now() + safeDuration;
  bucket.set(u, expiresAt);
  MAINTENANCE_ALLOWLIST.set(g, bucket);
  return { ok: true, expiresAt, durationMs: safeDuration };
}

function removeMaintenanceAllowlistUser(guildId?, userId?) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return { ok: false, reason: "missing_ids" };
  cleanupMaintenanceAllowlist(g, Date.now());
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  if (!bucket) return { ok: true, removed: false };
  const removed = bucket.delete(u);
  if (!bucket.size) MAINTENANCE_ALLOWLIST.delete(g);
  return { ok: true, removed };
}

function listMaintenanceAllowlist(guildId?) {
  const g = String(guildId || "");
  if (!g) return [];
  const now = Date.now();
  cleanupMaintenanceAllowlist(g, now);
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  if (!bucket?.size) return [];
  return Array.from(bucket.entries())
    .map(([userId, expiresAt]) => ({
      userId: String(userId),
      expiresAt: Number(expiresAt || 0),
      remainingMs: Math.max(0, Number(expiresAt || 0) - now),
    }))
    .sort((a?, b?) => a.expiresAt - b.expiresAt);
}

export = { UNKNOWN_EXECUTOR_ID, MAINTENANCE_ALLOWLIST, getMainRoleIds, cleanupMaintenanceAllowlist, isWhitelistedExecutor, isWhitelistedExecutorAsync, isCategoryWhitelisted, addMaintenanceAllowlistUser, removeMaintenanceAllowlistUser, listMaintenanceAllowlist };
