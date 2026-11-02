/** Mute: ruoli salvati prima del mute (salvataggio, lettura, recupero). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { ensureMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { persistMuteRoleSnapshotToProfile, loadStoredPersonalityRoleIds } = require("../../Utils/Community/personalityRolePersistence") as typeof import("../../Utils/Community/personalityRolePersistence");
const { memorySnapshots, markMuteMirrorStaffProtect, snapshotKey, normalizeSnapshotRoleIds, dbReady, loadProfileMuteSnapshotRoleIds, loadSnapshot, isCommunicationTimeoutActive, hasPendingMuteMirrorSnapshot } = require("./muteStaffProtect") as typeof import("./muteStaffProtect");

const EMPTY_SNAPSHOT_COOLDOWN_MS = 30 * 60 * 1000;
const emptySnapshotCooldownUntil = new Map();
const SNAPSHOT_PERSIST_WAIT_MS = 8000;

async function upsertSnapshot(guildId?, userId?, roleIds?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const ids = normalizeSnapshotRoleIds(roleIds);
  const key = snapshotKey(gid, uid);
  if (!isValidGuildUserId(gid, uid)) return false;

    const existingMem = Array.isArray(memorySnapshots.get(key)) ? memorySnapshots.get(key) : [];
  let existingDb = [];
  await ensureMongoReady({ maxWaitMs: SNAPSHOT_PERSIST_WAIT_MS }).catch(() => false);
  if (dbReady()) {
    existingDb = await loadProfileMuteSnapshotRoleIds(gid, uid).catch(() => []);
  }
  const existing = existingMem.length >= existingDb.length ? existingMem : existingDb;
  if (existing.length > 0 && ids.length < existing.length) {
    global.logger?.warn?.(
      "[mutedMirrorRole] skip snapshot shrink:",
      gid,
      uid,
      `${ids.length}<${existing.length}`,
    );
    memorySnapshots.set(key, existing);
    return true;
  }
  if (existing.length > 0 && ids.length === existing.length) {
    const same = ids.every((id?) => existing.includes(id));
    if (same) {
      memorySnapshots.set(key, existing);
      return true;
    }
  }

  memorySnapshots.set(key, ids);

  await persistMuteRoleSnapshotToProfile(gid, uid, ids).catch((err?) => {
    global.logger?.warn?.("[mutedMirrorRole] snapshot persist failed:", gid, uid, err?.message || err);
  });
  markMuteMirrorStaffProtect(gid, uid);
  return true;
}

async function hasSnapshot(guildId?, userId?) {
  const ids = await loadSnapshot(guildId, userId);
  return ids.length > 0;
}

function emptySnapshotCooldownKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function isEmptySnapshotOnCooldown(guildId?, userId?) {
  const until = Number(emptySnapshotCooldownUntil.get(emptySnapshotCooldownKey(guildId, userId)) || 0);
  return Number.isFinite(until) && until > Date.now();
}

function markEmptySnapshotCooldown(guildId?, userId?) {
  const key = emptySnapshotCooldownKey(guildId, userId);
  if (!key || key === ":") return;
  emptySnapshotCooldownUntil.set(key, Date.now() + EMPTY_SNAPSHOT_COOLDOWN_MS);
    if (emptySnapshotCooldownUntil.size > 2000) {
    const now = Date.now();
    for (const [k, until] of emptySnapshotCooldownUntil) {
      if (!Number.isFinite(until) || until <= now) emptySnapshotCooldownUntil.delete(k);
    }
  }
}

function clearEmptySnapshotCooldown(guildId?, userId?) {
  emptySnapshotCooldownUntil.delete(emptySnapshotCooldownKey(guildId, userId));
}

async function recoverSnapshotRoleIdsFallback(guildId?, userId?, mutedRoleId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const muted = String(mutedRoleId || "").trim();
  try {
    const fromPersonality = await loadStoredPersonalityRoleIds(gid, uid).catch(() => []);
    let fromDiscordState = [];
    if (dbReady()) {
      const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
        .select("profile.discordState.roleIds profile.personalityRoleIds")
        .lean()
        .catch(() => null);
      fromDiscordState = normalizeSnapshotRoleIds(doc?.profile?.discordState?.roleIds);
      const personalityExtra = normalizeSnapshotRoleIds(doc?.profile?.personalityRoleIds);
      fromDiscordState = normalizeSnapshotRoleIds([...fromDiscordState, ...personalityExtra]);
    }
    return normalizeSnapshotRoleIds([...fromDiscordState, ...fromPersonality]).filter(
      (id?) => id && id !== muted,
    );
  } catch (_) {
    return [];
  }
}

async function clearSnapshot(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  memorySnapshots.delete(snapshotKey(gid, uid));
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "profile.muteRoleSnapshot.roleIds": [], "profile.muteRoleSnapshot.at": null } },
  ).catch(() => {});
}

function buildRestoreTargetRoleIds(member?, me?, allowedRoleIds?, mutedRoleId?) {
  const guildId = String(member?.guild?.id || "");
  const muted = String(mutedRoleId || "").trim();
  const target = new Set(normalizeSnapshotRoleIds(allowedRoleIds));
  const highest = Number(me?.roles?.highest?.position || 0);
  const cache = member?.roles?.cache;
  if (!cache || !guildId) return [...target];
  for (const [id, role] of cache) {
    const rid = String(id || "").trim();
    if (!rid || rid === guildId) continue;
    if (muted && rid === muted) continue;
                if (role?.managed || Number(role?.position || 0) >= highest) target.add(rid);
  }
  return [...target];
}

function collectSnapshotRoleIds(member?, mutedRoleId?) {
  const guildId = String(member?.guild?.id || "");
  const muted = String(mutedRoleId || "").trim();
  const cache = member?.roles?.cache;
  if (!cache || !guildId) return [];
  const out = [];
  for (const [id, role] of cache) {
    const rid = String(id || "").trim();
    if (!rid || rid === guildId) continue;
    if (muted && rid === muted) continue;
    if (role?.managed) continue;
    out.push(rid);
  }
  return [...new Set(out)];
}

function buildRolesWhileMuted(member?, me?, mutedRoleId?) {
  const guildId = String(member?.guild?.id || "");
  const muted = String(mutedRoleId || "").trim();
  const highest = Number(me?.roles?.highest?.position || 0);
  const out = new Set();
  if (muted) out.add(muted);
  const cache = member?.roles?.cache;
  if (!cache) return [...out];
  for (const [id, role] of cache) {
    const rid = String(id || "").trim();
    if (!rid || rid === guildId || rid === muted) continue;
    if (role?.managed || Number(role?.position || 0) >= highest) out.add(rid);
  }
  return [...out];
}

async function filterRestorableRoleIds(guild?, me?, roleIds?, mutedRoleId?) {
  const highest = Number(me?.roles?.highest?.position || 0);
  const muted = String(mutedRoleId || "").trim();
  const gid = String(guild?.id || "");
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(roleIds) ? roleIds : []) {
    const rid = String(raw || "").trim();
    if (!rid || rid === gid) continue;
    if (muted && rid === muted) continue;
    if (seen.has(rid)) continue;
    let role = guild.roles.cache.get(rid);
    if (!role) role = await guild.roles.fetch(rid).catch(() => null);
    if (!role || role.managed) continue;
    if (Number(role.position || 0) >= highest) continue;
    seen.add(rid);
    out.push(rid);
  }
  return out;
}

async function resolveMutedRoleContext(guild?, me?, mutedRoleId?, mutedRoleOption?) {
  const mutedRoleIdNorm = String(mutedRoleId || "").trim();
  if (!mutedRoleIdNorm) return null;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return null;
  let mutedRole = mutedRoleOption || guild.roles.cache.get(mutedRoleIdNorm);
  if (!mutedRole) mutedRole = await guild.roles.fetch(mutedRoleIdNorm).catch(() => null);
  if (!mutedRole || mutedRole.managed) return null;
  if (mutedRole.position >= me.roles.highest.position) {
    global.logger?.warn?.("[mutedMirrorRole] Muted role above bot:", guild.id, mutedRoleIdNorm);
    return null;
  }
  return { mutedRoleId: mutedRoleIdNorm, mutedRole };
}

async function shouldDeferRoleRestoreForMuteMirror(member?) {
  if (!member?.guild?.id || !member?.id) return false;
  if (isCommunicationTimeoutActive(member)) return true;
  return hasPendingMuteMirrorSnapshot(member.guild.id, member.id);
}

async function captureMuteRoleSnapshot(member?, options: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "bad_member", roleIds: [] };
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(member.guild.id)) return { ok: false, reason: "out_of_scope", roleIds: [] };
  } catch (_) {}

  const mutedRoleId = String(options.mutedRoleId || IDs.roles?.Muted || "").trim();
  const existing = await loadSnapshot(member.guild.id, member.id);
  if (existing.length) return { ok: true, reason: "already_saved", roleIds: existing };

  const fromProfile = await loadProfileMuteSnapshotRoleIds(member.guild.id, member.id);
  const current = collectSnapshotRoleIds(member, mutedRoleId);
    const roleIds =
    fromProfile.length >= current.length && fromProfile.length
      ? fromProfile
      : current.length
        ? current
        : fromProfile;
  if (!roleIds.length) return { ok: false, reason: "empty_roles", roleIds: [] };

  await upsertSnapshot(member.guild.id, member.id, roleIds);
  clearEmptySnapshotCooldown(member.guild.id, member.id);
  if (!(await hasSnapshot(member.guild.id, member.id))) {
    return { ok: false, reason: "persist_failed", roleIds };
  }
  return { ok: true, reason: String(options.reason || "captured"), roleIds };
}

export = { EMPTY_SNAPSHOT_COOLDOWN_MS, upsertSnapshot, hasSnapshot, isEmptySnapshotOnCooldown, markEmptySnapshotCooldown, clearEmptySnapshotCooldown, recoverSnapshotRoleIdsFallback, clearSnapshot, buildRestoreTargetRoleIds, collectSnapshotRoleIds, buildRolesWhileMuted, filterRestorableRoleIds, resolveMutedRoleContext, shouldDeferRoleRestoreForMuteMirror, captureMuteRoleSnapshot };
