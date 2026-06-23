const { PermissionsBitField } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, CommunicationTimeoutRoleSnapshot, CustomRole } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ensureMongoReady } = require("../../Utils/Database/mongoConnect");
const { getUserExpStats, syncLevelRolesForMember } = require("../Community/expService");
const { applyTenureForMember } = require("../Community/communityOpsService");
const { applyZodiacRoleFromBirthday } = require("../../Utils/Community/zodiacRoles");
const { applyAgeBracketRoleFromBirthday } = require("../../Utils/Community/ageBracketRoles");
const { restorePersistedPersonalityRoles, persistMuteRoleSnapshotToProfile } = require("../../Utils/Community/personalityRolePersistence");
const {
  registerMuteMirrorRestoreRoleSuppress,
  wasRoleRestoredByMuteMirror,
} = require("../../Utils/Moderation/muteRestoreAnnounceSuppress");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("../Community/clanTagRoleService");
const { hasEventWeekWinnerGrant } = require("../Community/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../../Utils/Community/customPerksUnlock");

const RECENT_UNMUTE_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_UNMUTE_RECOVERY_DEDUPE_MS = 6 * 60 * 60 * 1000;
const recentUnmuteProfileRecoveryUntil = new Map();
const SNAPSHOT_PERSIST_WAIT_MS = 8000;
const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [IDs.roles.VIP, IDs.roles.ServerBooster, IDs.roles.DoubleBooster, IDs.roles.Level50].filter(Boolean);
const memorySnapshots = new Map();
let muteMirrorSweepInFlight = null;
const postUnmuteReconciledMemory = new Set();

function getLatestUnmuteCaseAt(profileDoc) {
  const cases = Array.isArray(profileDoc?.moderation?.modCases) ? profileDoc.moderation.modCases : [];
  let latest = 0;
  for (const row of cases) {
    if (String(row?.action || "").toUpperCase() !== "UNMUTE") continue;
    const ts = new Date(row?.createdAt || 0).getTime();
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  }
  return latest;
}

function isPostUnmuteReconciliationCurrent(profileDoc, guildId, userId) {
  const key = snapshotKey(guildId, userId);
  if (key && postUnmuteReconciledMemory.has(key)) return true;
  const unmuteAt = getLatestUnmuteCaseAt(profileDoc);
  if (!unmuteAt) return false;
  const reconciledAt = new Date(profileDoc?.moderation?.postUnmuteRolesReconciledAt || 0).getTime();
  return Number.isFinite(reconciledAt) && reconciledAt > 0 && reconciledAt >= unmuteAt;
}

function profileResyncMadeChanges(profileResync) {
  if (!profileResync?.ok) return false;
  return Boolean(
    (Array.isArray(profileResync.levelRoles) && profileResync.levelRoles.length) ||
    (Array.isArray(profileResync.customRole) && profileResync.customRole.length) ||
    (Array.isArray(profileResync.secondaryCustomRole) && profileResync.secondaryCustomRole.length) ||
    (Array.isArray(profileResync.personality) && profileResync.personality.length) ||
    (Array.isArray(profileResync.minigame) && profileResync.minigame.length),
  );
}

async function markPostUnmuteReconciliationComplete(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const key = snapshotKey(gid, uid);
  if (key) postUnmuteReconciledMemory.add(key);
  markRecentUnmuteProfileRecovery(gid, uid);
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "moderation.postUnmuteRolesReconciledAt": new Date() } },
  ).maxTimeMS(5000).catch(() => null);
}

function cleanupRecentUnmuteProfileRecovery(now = Date.now()) {
  for (const [key, until] of recentUnmuteProfileRecoveryUntil.entries()) {
    if (!until || now >= Number(until)) recentUnmuteProfileRecoveryUntil.delete(key);
  }
}

function markRecentUnmuteProfileRecovery(guildId, userId, now = Date.now()) {
  recentUnmuteProfileRecoveryUntil.set(snapshotKey(guildId, userId), now + RECENT_UNMUTE_RECOVERY_DEDUPE_MS);
}

function wasRecentUnmuteProfileRecoveryDone(guildId, userId, now = Date.now()) {
  cleanupRecentUnmuteProfileRecovery(now);
  const until = recentUnmuteProfileRecoveryUntil.get(snapshotKey(guildId, userId));
  return Boolean(until && now < Number(until));
}

function snapshotKey(guildId, userId) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function normalizeSnapshotRoleIds(roleIds) {
  return [...new Set((Array.isArray(roleIds) ? roleIds : []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function dbReady() {
  return mongoose.connection?.readyState === 1;
}

async function upsertSnapshot(guildId, userId, roleIds) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const ids = normalizeSnapshotRoleIds(roleIds);
  const key = snapshotKey(gid, uid);
  if (!isValidGuildUserId(gid, uid)) return false;
  memorySnapshots.set(key, ids);

  void persistMuteRoleSnapshotToProfile(gid, uid, ids).catch(() => null);

  await ensureMongoReady({ maxWaitMs: SNAPSHOT_PERSIST_WAIT_MS }).catch(() => false);
  if (!dbReady()) return true;

  try {
    await CommunicationTimeoutRoleSnapshot.updateOne(
      { guildId: gid, userId: uid },
      { $set: { guildId: gid, userId: uid, roleIds: ids } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    global.logger?.warn?.("[mutedMirrorRole] snapshot persist failed:", gid, uid, err?.message || err);
    return true;
  }
}

async function loadSnapshot(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const key = snapshotKey(gid, uid);
  if (!isValidGuildUserId(gid, uid)) return [];

  const mem = memorySnapshots.get(key);
  if (Array.isArray(mem) && mem.length) return [...mem];

  await ensureMongoReady({ maxWaitMs: 5000 }).catch(() => false);
  if (!dbReady()) return [];

  const doc = await CommunicationTimeoutRoleSnapshot.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const ids = normalizeSnapshotRoleIds(doc?.roleIds);
  if (ids.length) memorySnapshots.set(key, ids);
  return ids;
}

async function hasSnapshot(guildId, userId) {
  const ids = await loadSnapshot(guildId, userId);
  return ids.length > 0;
}

async function clearSnapshot(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  memorySnapshots.delete(snapshotKey(gid, uid));
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await CommunicationTimeoutRoleSnapshot.deleteOne({ guildId: gid, userId: uid }).catch(() => {});
}

function buildRestoreTargetRoleIds(member, me, allowedRoleIds, mutedRoleId) {
  const guildId = String(member?.guild?.id || "");
  const muted = String(mutedRoleId || "").trim();
  const highest = Number(me?.roles?.highest?.position || 0);
  const target = new Set(normalizeSnapshotRoleIds(allowedRoleIds));
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

function didCommunicationTimeoutChange(oldMember, newMember) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  return Number(oldTs) !== Number(newTs);
}

function isCommunicationTimeoutActive(member) {
  const until = member?.communicationDisabledUntilTimestamp;
  return Boolean(until && Number(until) > Date.now());
}

function collectSnapshotRoleIds(member, mutedRoleId) {
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

/** Ruoli che Discord non lascia togliere al bot (sopra il ruolo del bot o managed). */
function buildRolesWhileMuted(member, me, mutedRoleId) {
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

async function filterRestorableRoleIds(guild, me, roleIds, mutedRoleId) {
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

async function resolveMutedRoleContext(guild, me, mutedRoleId, mutedRoleOption) {
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

/**
 * Ripristina i ruoli salvati e rimuove Muted quando il timeout Discord non è più attivo.
 */
async function restoreRolesAfterCommunicationTimeoutEnd(member, options = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "invalid_member" };
  if (isCommunicationTimeoutActive(member)) return { ok: false, reason: "timeout_active" };

  const mutedRoleId = String(options.mutedRoleId || IDs.roles?.Muted || "").trim();
  const guild = member.guild;
  const me = options.me || guild.members.me;
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId, options.mutedRole);
  if (!ctx) return { ok: false, reason: "muted_role_unusable" };

  const reasonOut = String(options.reason || "Fine timeout / +unmute");
  const hasMuted = member.roles.cache.has(ctx.mutedRoleId);
  const saved = await loadSnapshot(guild.id, member.id);
  const wasUnmuteFlow = Boolean(options.wasUnmuteFlow);
  if (!hasMuted && saved.length === 0 && !wasUnmuteFlow) return { ok: true, restored: false, reason: "noop" };

  let profileDoc = options.profileDoc || null;
  if (wasUnmuteFlow && !hasMuted && saved.length === 0) {
    if (!profileDoc) {
      profileDoc = await ActivityUserProfile.findOne({ guildId: guild.id, userId: member.id })
        .select("moderation.modCases moderation.postUnmuteRolesReconciledAt")
        .lean()
        .catch(() => null);
    }
    if (isPostUnmuteReconciliationCurrent(profileDoc, guild.id, member.id)) {
      markRecentUnmuteProfileRecovery(guild.id, member.id);
      return { ok: true, restored: false, restoreOk: true, reason: "already_reconciled" };
    }
  }

  const allowed = await filterRestorableRoleIds(guild, me, saved, ctx.mutedRoleId);
  let restored = false;
  let restoreOk = false;

  if (allowed.length > 0) {
    registerMuteMirrorRestoreRoleSuppress(guild.id, member.id, allowed);
  }

  try {
    if (saved.length > 0) {
      const targetIds = buildRestoreTargetRoleIds(member, me, allowed, ctx.mutedRoleId);
      await member.roles.set(targetIds, reasonOut);
      restored = true;
      restoreOk = true;
      if (allowed.length < saved.length) {
        global.logger?.warn?.(
          "[mutedMirrorRole] restore parziale:",
          guild.id,
          member.id,
          `${allowed.length}/${saved.length} ruoli`,
        );
      }
    } else if (hasMuted) {
      await member.roles.remove(ctx.mutedRoleId, reasonOut);
      restored = true;
      restoreOk = true;
    }
  } catch (err) {
    global.logger?.warn?.("[mutedMirrorRole] restore failed:", guild.id, member.id, err?.message || err);
    if (hasMuted) {
      const removed = await member.roles.remove(ctx.mutedRoleId, reasonOut).then(() => true).catch((err2) => {
        global.logger?.warn?.("[mutedMirrorRole] remove after restore fail:", guild.id, member.id, err2?.message || err2);
        return false;
      });
      if (removed) {
        restored = true;
        restoreOk = saved.length === 0;
      }
    }
  }

  if (member.roles.cache.has(ctx.mutedRoleId)) {
    await member.roles.remove(ctx.mutedRoleId, reasonOut).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] remove stale muted:", guild.id, member.id, err?.message || err);
    });
    restored = true;
    if (!restoreOk && saved.length === 0) restoreOk = true;
  }

  if (restoreOk) {
    await clearSnapshot(guild.id, member.id);
  } else if (saved.length > 0) {
    global.logger?.warn?.("[mutedMirrorRole] snapshot kept for retry:", guild.id, member.id, saved.length);
  }

  let profileResync = null;
  const shouldProfileResync =
    options.runProfileResync !== false &&
    (restored || saved.length > 0 || hasMuted || wasUnmuteFlow);
  if (shouldProfileResync) {
    const freshMember = (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
    profileResync = await resyncProfileDerivedRolesForMember(freshMember, options.client || guild.client, {
      reason: reasonOut,
      skipMutedRemove: true,
    }).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] profile resync failed:", guild.id, member.id, err?.message || err);
      return null;
    });
    if (profileResync?.ok && profileResyncMadeChanges(profileResync)) restored = true;
  }

  const pendingSnapshot = await loadSnapshot(guild.id, member.id);
  const stillMuted = member.roles.cache.has(ctx.mutedRoleId);
  if (
    wasUnmuteFlow &&
    !isCommunicationTimeoutActive(member) &&
    !stillMuted &&
    pendingSnapshot.length === 0
  ) {
    await markPostUnmuteReconciliationComplete(guild.id, member.id);
  }

  const hadWork = Boolean(restored || restoreOk || profileResyncMadeChanges(profileResync));
  return { ok: true, restored: hadWork, restoreOk, profileResync, reason: hadWork ? undefined : "noop" };
}

/**
 * Timeout Discord (+mute, AutoMod, client): all'ingresso salva i ruoli, lascia solo Muted; alla fine ripristina e rimuove Muted.
 */
async function syncMutedMirrorRoleFromMemberUpdate(oldMember, newMember) {
  if (!newMember?.guild || newMember.user?.bot) return;
  if (!didCommunicationTimeoutChange(oldMember, newMember)) return;

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  const guild = newMember.guild;
  const me = guild.members.me;
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return;

  const wasActive = isCommunicationTimeoutActive(oldMember);
  const nowActive = isCommunicationTimeoutActive(newMember);
  const hasMuted = newMember.roles.cache.has(ctx.mutedRoleId);
  const reasonIn = "Timeout Discord / +mute";
  const reasonOut = "Fine timeout / +unmute";

  if (nowActive && !wasActive) {
    const fresh =
      (await getGuildMemberCached(guild, newMember.id, { preferFresh: true }).catch(() => null)) ||
      oldMember ||
      newMember;
    let snapshotIds = collectSnapshotRoleIds(fresh, ctx.mutedRoleId);
    if (!snapshotIds.length) {
      snapshotIds = collectSnapshotRoleIds(oldMember, ctx.mutedRoleId);
    }
    if (!snapshotIds.length) {
      global.logger?.warn?.(
        "[mutedMirrorRole] snapshot vuoto al mute (ruoli non ripristinabili allo smute):",
        guild.id,
        newMember.id,
      );
    }
    await upsertSnapshot(guild.id, newMember.id, snapshotIds);
    if (snapshotIds.length > 0 && !(await hasSnapshot(guild.id, newMember.id))) {
      global.logger?.error?.(
        "[mutedMirrorRole] abort strip: snapshot non disponibile",
        guild.id,
        newMember.id,
        snapshotIds.length,
      );
      await newMember.roles.add(ctx.mutedRoleId, reasonIn).catch((err) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
      return;
    }
    const stripTarget = buildRolesWhileMuted(fresh, me, ctx.mutedRoleId);
    await newMember.roles.set(stripTarget, reasonIn).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] strip+mirror failed:", guild.id, newMember.id, err?.message || err);
    });
    return;
  }

  if (nowActive && wasActive) {
    if (!hasMuted) {
      await newMember.roles.add(ctx.mutedRoleId, `${reasonIn} (sync)`).catch((err) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
    }
    return;
  }

  if (!nowActive) {
    const saved = await loadSnapshot(guild.id, newMember.id);
    if (wasActive || hasMuted || saved.length > 0) {
      await restoreRolesAfterCommunicationTimeoutEnd(newMember, {
        me,
        mutedRoleId: ctx.mutedRoleId,
        mutedRole: ctx.mutedRole,
        reason: reasonOut,
        wasUnmuteFlow: true,
        client: newMember.client || guild.client,
      });
    }
  }
}

/**
 * Sweep snapshot e membri con ruolo Muted ma timeout scaduto (startup + tick periodico).
 */
async function sweepExpiredCommunicationTimeoutMirrors(client, options = {}) {
  if (muteMirrorSweepInFlight) return muteMirrorSweepInFlight;
  muteMirrorSweepInFlight = runSweepExpiredCommunicationTimeoutMirrors(client, options).finally(() => {
    muteMirrorSweepInFlight = null;
  });
  return muteMirrorSweepInFlight;
}

async function runSweepExpiredCommunicationTimeoutMirrors(client, options = {}) {
  if (!client?.guilds || !dbReady()) return { reconciled: 0, scanned: 0 };

  const limit = Math.max(1, Math.min(200, Number(options.limit) || SWEEP_DEFAULT_LIMIT));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  let reconciled = 0;
  let scanned = 0;
  const seen = new Set();

  const docs = await CommunicationTimeoutRoleSnapshot.find({}).limit(limit).lean().catch(() => []);
  for (const doc of docs) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    const key = `${guildId}:${userId}`;
    if (!guildId || !userId || seen.has(key)) continue;
    seen.add(key);
    scanned += 1;

    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      await clearSnapshot(guildId, userId);
      continue;
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await clearSnapshot(guildId, userId);
      continue;
    }
    if (isCommunicationTimeoutActive(member)) continue;

    const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
      ...options,
      client,
      wasUnmuteFlow: true,
    });
    if (result?.restored && result?.reason !== "already_reconciled") reconciled += 1;
  }

  if (mutedRoleId) {
    for (const guild of client.guilds.cache.values()) {
      const me = guild.members.me;
      if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) continue;
      let mutedRole = guild.roles.cache.get(mutedRoleId);
      if (!mutedRole) mutedRole = await guild.roles.fetch(mutedRoleId).catch(() => null);
      if (!mutedRole) continue;

      for (const [, member] of mutedRole.members) {
        if (member.user?.bot) continue;
        const key = `${guild.id}:${member.id}`;
        if (seen.has(key)) continue;
        if (isCommunicationTimeoutActive(member)) continue;

        const saved = await loadSnapshot(guild.id, member.id);
        if (saved.length === 0 && !member.roles.cache.has(mutedRoleId)) continue;

        seen.add(key);
        scanned += 1;
        const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
          ...options,
          client,
          wasUnmuteFlow: true,
        });
        if (result?.restored && result?.reason !== "already_reconciled") reconciled += 1;
      }
    }
  }

  const recent = options.includeRecentUnmuteRecovery
    ? await sweepRecentUnmuteProfileRecovery(client, options).catch(() => ({ recovered: 0 }))
    : { recovered: 0 };
  reconciled += Number(recent?.recovered || 0);

  if (reconciled > 0) {
    global.logger?.info?.(`[mutedMirrorRole] sweep reconciled ${reconciled} member(s), scanned=${scanned}`);
  }
  return { reconciled, scanned };
}

async function sweepRecentUnmuteProfileRecovery(client, options = {}) {
  if (!client?.guilds || !dbReady()) return { recovered: 0, scanned: 0 };
  const since = new Date(Date.now() - RECENT_UNMUTE_RECOVERY_MS);
  const limit = Math.max(1, Math.min(100, Number(options.recentUnmuteLimit) || 30));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const profiles = await ActivityUserProfile.find({
    "moderation.modCases": {
      $elemMatch: { action: "UNMUTE", createdAt: { $gte: since } },
    },
  })
    .limit(limit)
    .select("guildId userId moderation.modCases moderation.postUnmuteRolesReconciledAt")
    .lean()
    .maxTimeMS(8000)
    .catch(() => []);

  let recovered = 0;
  let scanned = 0;
  for (const row of profiles) {
    const guildId = String(row.guildId || "");
    const userId = String(row.userId || "");
    if (!guildId || !userId) continue;
    if (isPostUnmuteReconciliationCurrent(row, guildId, userId)) continue;
    if (wasRecentUnmuteProfileRecoveryDone(guildId, userId)) continue;

    const guild = await getClientGuildCached(client, guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user?.bot || isCommunicationTimeoutActive(member)) continue;

    const hasMuted = Boolean(mutedRoleId && member.roles.cache.has(mutedRoleId));
    const saved = await loadSnapshot(guildId, userId);
    if (!hasMuted && saved.length === 0) {
      await markPostUnmuteReconciliationComplete(guildId, userId);
      continue;
    }

    scanned += 1;
    const resync = await restoreRolesAfterCommunicationTimeoutEnd(member, {
      client,
      wasUnmuteFlow: true,
      profileDoc: row,
      reason: String(options.reason || "Recupero automatico post-unmute"),
    }).catch(() => null);
    if (resync?.restored && resync?.reason !== "already_reconciled" && resync?.reason !== "noop") {
      recovered += 1;
    }
  }

  if (recovered > 0) {
    global.logger?.info?.(`[mutedMirrorRole] recent unmute profile recovery: ${recovered} member(s), scanned=${scanned}`);
  }
  return { recovered, scanned };
}

async function hasPendingMuteMirrorSnapshot(guildId, userId) {
  const saved = await loadSnapshot(guildId, userId);
  return saved.length > 0;
}

async function shouldDeferRoleRestoreForMuteMirror(member) {
  if (!member?.guild?.id || !member?.id) return false;
  if (isCommunicationTimeoutActive(member)) return true;
  return hasPendingMuteMirrorSnapshot(member.guild.id, member.id);
}

async function handleMuteMirrorOnMemberLeave(member) {
  if (!member?.guild || member.user?.bot) return;
  const saved = await loadSnapshot(member.guild.id, member.id);
  if (!saved.length) return;
  if (isCommunicationTimeoutActive(member)) return;
  await clearSnapshot(member.guild.id, member.id);
}

async function syncMutedMirrorOnMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return;

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  const guild = member.guild;
  const me = guild.members.me;
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return;

  const timeoutActive = isCommunicationTimeoutActive(member);
  const saved = await loadSnapshot(guild.id, member.id);
  if (!timeoutActive && !saved.length) return;

  const reasonIn = "Timeout Discord / +mute (rejoin)";
  if (!saved.length && timeoutActive) {
    const snapshotIds = collectSnapshotRoleIds(member, ctx.mutedRoleId);
    if (snapshotIds.length) await upsertSnapshot(guild.id, member.id, snapshotIds);
  }
  const stripTarget = me
    ? buildRolesWhileMuted(member, me, ctx.mutedRoleId)
    : [ctx.mutedRoleId];
  await member.roles.set(stripTarget, reasonIn).catch((err) => {
    global.logger?.warn?.("[mutedMirrorRole] rejoin strip+mirror failed:", guild.id, member.id, err?.message || err);
    if (!timeoutActive) clearSnapshot(guild.id, member.id).catch(() => {});
  });
}

function isCustomRoleDocActive(doc) {
  if (!doc) return false;
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) return false;
  return Boolean(String(doc?.roleId || "").trim());
}

async function restoreCustomRoleIfEligible(member) {
  if (!member?.guild?.id || !member?.id) return { ok: false, added: [] };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.roleId || "").trim();
  if (!roleId || !isCustomRoleDocActive(doc)) return { ok: true, added: [] };
  if (member.roles.cache.has(roleId)) return { ok: true, added: [] };

  const role = await getGuildRoleCached(member.guild, roleId);
  const me = member.guild.members.me;
  if (!role || !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return { ok: false, added: [] };
  if (role.position >= me.roles.highest.position) return { ok: false, added: [] };

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((rid) => member.roles.cache.has(rid));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) {
    return { ok: true, skipped: true, added: [] };
  }

  const refreshed = await addRolesAndGetMember(member.guild, userId, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has(roleId)) return { ok: false, added: [] };
  return { ok: true, added: [roleId] };
}

async function restoreSecondaryCustomRoleIfEligible(member) {
  if (!member?.guild?.id || !member?.id) return { ok: false, added: [] };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.secondaryRoleId || "").trim();
  if (!roleId || !isCustomRoleDocActive(doc)) return { ok: true, added: [] };
  if (member.roles.cache.has(roleId)) return { ok: true, added: [] };

  const role = await getGuildRoleCached(member.guild, roleId);
  const me = member.guild.members.me;
  if (!role || !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return { ok: false, added: [] };
  if (role.position >= me.roles.highest.position) return { ok: false, added: [] };

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((rid) => member.roles.cache.has(rid));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) {
    return { ok: true, skipped: true, added: [] };
  }

  const refreshed = await addRolesAndGetMember(member.guild, userId, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has(roleId)) return { ok: false, added: [] };
  return { ok: true, added: [roleId] };
}

const MINIGAME_EXP_REWARD_TIERS = [
  [500, IDs.roles.Rookie],
  [1000, IDs.roles.Scout],
  [1500, IDs.roles.Explorer],
  [2500, IDs.roles.Tracker],
  [5000, IDs.roles.Achiever],
  [10000, IDs.roles.Vanguard],
  [50000, IDs.roles.Mentor],
  [100000, IDs.roles.Strategist],
].filter(([, rid]) => rid);

async function syncMinigameRewardRolesForMember(member, totalExp, reason = "Recupero ruoli minigame") {
  if (!member?.guild || member.user?.bot) return [];
  const expValue = Number(totalExp || 0);
  if (!Number.isFinite(expValue) || expValue <= 0) return [];
  const added = [];
  for (const [threshold, roleId] of MINIGAME_EXP_REWARD_TIERS) {
    const rid = String(roleId || "").trim();
    if (!rid || expValue < threshold) continue;
    if (member.roles.cache.has(rid)) continue;
    const ok = await member.roles.add(rid, reason).then(() => true).catch(() => false);
    if (ok) added.push(rid);
  }
  return added;
}

async function resyncProfileDerivedRolesForMember(member, client, options = {}) {
  if (!member?.guild?.id || !member?.id) return { ok: false, reason: "invalid_member" };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const reason = String(options.reason || "Recupero ruoli post-mute");
  const out = { levelRoles: [], tenure: false, zodiac: false, ageBracket: false, clanTag: false, customRole: [], secondaryCustomRole: [], personality: [], minigame: [] };

  const stats = await getUserExpStats(guildId, userId).catch(() => null);
  if (stats?.level != null) {
    out.levelRoles = await syncLevelRolesForMember(member.guild, userId, stats.level).catch(() => []);
  }

  const profileDoc = await ActivityUserProfile.findOne({ guildId, userId }).lean().catch(() => null);
  if (profileDoc) {
    await applyTenureForMember(member, profileDoc).catch(() => null);
    out.tenure = true;
    const bday = profileDoc?.profile?.birthday;
    if (bday?.month && bday?.day) {
      const z = await applyZodiacRoleFromBirthday(member.guild, userId, bday.month, bday.day).catch(() => null);
      out.zodiac = Boolean(z?.ok);
      if (bday?.birthYear) {
        const a = await applyAgeBracketRoleFromBirthday(member.guild, userId, bday.day, bday.month, bday.birthYear).catch(() => null);
        out.ageBracket = Boolean(a?.ok);
      }
    }
    const personality = await restorePersistedPersonalityRoles(member, { reason, profileDoc }).catch(() => ({ added: [] }));
    if (Array.isArray(personality?.added) && personality.added.length) {
      registerMuteMirrorRestoreRoleSuppress(guildId, userId, personality.added);
      out.personality = personality.added;
    }
    const minigameExp = Number(profileDoc?.profile?.totals?.exp?.minigame?.totalExp || 0);
    if (minigameExp > 0) {
      out.minigame = await syncMinigameRewardRolesForMember(member, minigameExp, reason).catch(() => []);
    }
  }

  if (client) {
    await syncClanTagRolesForUserEverywhereAfterMemberEvent(client, member.user).catch(() => null);
    out.clanTag = true;
  }

  const custom = await restoreCustomRoleIfEligible(member).catch(() => ({ added: [] }));
  out.customRole = Array.isArray(custom?.added) ? custom.added : [];
  const secondary = await restoreSecondaryCustomRoleIfEligible(member).catch(() => ({ added: [] }));
  out.secondaryCustomRole = Array.isArray(secondary?.added) ? secondary.added : [];

  if (!options.skipMutedRemove) {
    const mutedId = String(IDs.roles?.Muted || "").trim();
    if (mutedId && member.roles.cache.has(mutedId)) {
      await member.roles.remove(mutedId, reason).catch(() => null);
    }
  }

  return { ok: true, ...out };
}

module.exports = {
  syncMutedMirrorRoleFromMemberUpdate,
  syncMutedMirrorOnMemberJoin,
  handleMuteMirrorOnMemberLeave,
  hasPendingMuteMirrorSnapshot,
  shouldDeferRoleRestoreForMuteMirror,
  restoreRolesAfterCommunicationTimeoutEnd,
  resyncProfileDerivedRolesForMember,
  registerMuteMirrorRestoreRoleSuppress,
  wasRoleRestoredByMuteMirror,
  sweepExpiredCommunicationTimeoutMirrors,
  isCommunicationTimeoutActive,
  didCommunicationTimeoutChange,
  memberIsInMuteMirrorState: (member) => {
    const mutedId = String(IDs.roles?.Muted || "").trim();
    if (mutedId && member?.roles?.cache?.has(mutedId)) return true;
    return isCommunicationTimeoutActive(member);
  },
};