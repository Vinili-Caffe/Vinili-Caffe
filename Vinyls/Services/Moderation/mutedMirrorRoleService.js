const { PermissionsBitField } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, CustomRole } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached, getGuildRoleCached, isUnknownDiscordMemberError } = require("../../Utils/Interaction/interactionEntityCache");
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
const SWEEP_DEFAULT_LIMIT = 50;
const ACTIVE_MUTE_RECONCILE_LIMIT = 80;
const recentUnmuteProfileRecoveryUntil = new Map();
const SNAPSHOT_PERSIST_WAIT_MS = 8000;
const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [IDs.roles.VIP, IDs.roles.ServerBooster, IDs.roles.DoubleBooster, IDs.roles.Level50].filter(Boolean);
const memorySnapshots = new Map();
let muteMirrorSweepInFlight = null;
let activeMuteReconcileInFlight = null;
const postUnmuteReconciledMemory = new Set();

function syncLocalMemberRolesCache(member, guild, roleIds) {
  try {
    const cache = member?.roles?.cache;
    if (!cache || typeof cache.set !== "function") return;
    const keep = new Set((roleIds || []).map(String));
    for (const key of [...(cache.keys?.() || [])]) {
      if (!keep.has(String(key))) cache.delete(key);
    }
    for (const rid of keep) {
      if (!cache.has(rid)) cache.set(rid, guild?.roles?.cache?.get(rid) || { id: rid });
    }
  } catch (_) {}
}

/** True only for real role managers (discord.js / REST wrapMember), not Map/Collection.set. */
function hasUsableRolesSet(member) {
  const roles = member?.roles;
  const setFn = roles?.set;
  if (typeof setFn !== "function") return false;
  // Stub: roles is the cache map itself.
  if (typeof roles?.has === "function" && typeof roles?.get === "function" && !roles.cache) return false;
  // Stub: set is the cache's Map.set.
  if (roles?.cache && setFn === roles.cache.set) return false;
  return true;
}

async function setMemberRolesViaRest(guild, userId, roleIds, reasonOpt) {
  const rest = guild?.client?._rest;
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!rest || typeof rest.patch !== "function" || !guildId || !uid) return false;
  const { Routes } = require("discord.js");
  await rest.patch(Routes.guildMember(guildId, uid), {
    body: { roles: roleIds },
    reason: reasonOpt,
  });
  return true;
}

async function setMemberRolesSafe(member, roleIds, reason) {
  const guild = member?.guild;
  const userId = String(member?.id || "").trim();
  const guildId = String(guild?.id || "").trim();
  const ids = [
    ...new Set(
      (Array.isArray(roleIds) ? roleIds : [roleIds])
        .map((x) => String(x || "").trim())
        .filter((id) => id && id !== guildId),
    ),
  ];
  const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;

  // REST-first for site-api / bot-scheduler workers (reliable, no gateway RoleManager).
  if (await setMemberRolesViaRest(guild, userId, ids, reasonOpt)) {
    syncLocalMemberRolesCache(member, guild, ids);
    return true;
  }

  if (hasUsableRolesSet(member)) {
    try {
      await member.roles.set(ids, reasonOpt);
      return true;
    } catch (err) {
      const msg = String(err?.message || err || "");
      // Fall through only for stub managers; real Discord errors must propagate.
      if (!/is not a function/i.test(msg)) throw err;
    }
  }

  const current = [...(member?.roles?.cache?.keys?.() || [])].map(String);
  const want = new Set(ids);
  const toRemove = current.filter((id) => id !== guildId && !want.has(id));
  const toAdd = ids.filter((id) => !member?.roles?.cache?.has?.(id));
  if (typeof member?.roles?.remove === "function" && toRemove.length) {
    await member.roles.remove(toRemove, reasonOpt);
  }
  if (typeof member?.roles?.add === "function" && toAdd.length) {
    // Un id per chiamata: su client REST String([a,b]) diventava "a,b" (400 Discord).
    for (const roleId of toAdd) {
      await member.roles.add(roleId, reasonOpt);
    }
  }
  if (typeof member?.roles?.add === "function" || typeof member?.roles?.remove === "function") {
    syncLocalMemberRolesCache(member, guild, ids);
    return true;
  }

  throw new Error(
    `cannot set member roles (guild=${guildId || "?"} user=${userId || "?"} rest=${Boolean(guild?.client?._rest)} set=${typeof member?.roles?.set})`,
  );
}

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

  await ensureMongoReady({ maxWaitMs: SNAPSHOT_PERSIST_WAIT_MS }).catch(() => false);

  await persistMuteRoleSnapshotToProfile(gid, uid, ids).catch((err) => {
    global.logger?.warn?.("[mutedMirrorRole] snapshot persist failed:", gid, uid, err?.message || err);
  });
  return true;
}

async function loadProfileMuteSnapshotRoleIds(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return [];
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.muteRoleSnapshot.roleIds")
    .lean()
    .catch(() => null);
  return normalizeSnapshotRoleIds(doc?.profile?.muteRoleSnapshot?.roleIds);
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

  const fromProfile = await loadProfileMuteSnapshotRoleIds(gid, uid);
  if (fromProfile.length) {
    memorySnapshots.set(key, fromProfile);
    return fromProfile;
  }
  return [];
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
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "profile.muteRoleSnapshot.roleIds": [], "profile.muteRoleSnapshot.at": null } },
  ).catch(() => {});
}

function buildRestoreTargetRoleIds(member, me, allowedRoleIds, mutedRoleId) {
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
    // Solo ruoli che non possiamo togliere (managed / sopra il bot).
    // Unire TUTTI i ruoli correnti faceva restare Member/NuovoUtente
    // riapplicati per errore durante il mute (rejoin/tenure).
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
  const until =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil
      ? new Date(member.communicationDisabledUntil).getTime()
      : 0);
  return Boolean(Number.isFinite(until) && until > Date.now());
}

/**
 * bot-scheduler (REST): a volte il member in cache non ha il timeout → lo sweep
 * credeva finito e “riconciliava” ogni minuto. Conferma via REST raw se manca.
 * @returns {Promise<number|null>} ms epoch fine timeout, 0 se assente, null se sconosciuto
 */
async function resolveCommunicationTimeoutUntilMs(member, guild) {
  const local =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil
      ? new Date(member.communicationDisabledUntil).getTime()
      : 0);
  if (Number.isFinite(local) && local > 0) return local;

  const gid = String(guild?.id || member?.guild?.id || "").trim();
  const uid = String(member?.id || "").trim();
  const rest = guild?.client?._rest || member?.client?._rest || guild?.client?.rest || member?.client?.rest;
  // Senza REST non possiamo distinguere "timeout finito" da "campo assente in cache".
  // Restituire 0 qui faceva riconciliare ogni minuto mentre il timeout era ancora attivo.
  if (!gid || !uid || typeof rest?.get !== "function") return null;
  try {
    const { Routes } = require("discord.js");
    const raw = await rest.get(Routes.guildMember(gid, uid));
    if (!raw || typeof raw !== "object") return null;
    if (!raw.communication_disabled_until) return 0;
    const parsed = Date.parse(raw.communication_disabled_until);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
async function resolveGuildBotMember(guild, options = {}) {
  if (!guild) return null;
  if (options.me) return options.me;
  const cached = guild.members?.me || null;
  if (cached) return cached;
  if (typeof guild.members?.fetchMe === "function") {
    return guild.members.fetchMe().catch(() => null);
  }
  const meId = String(guild.client?.user?.id || "").trim();
  if (meId && typeof guild.members?.fetch === "function") {
    return guild.members.fetch(meId).catch(() => null);
  }
  return null;
}

async function restoreRolesAfterCommunicationTimeoutEnd(member, options = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "invalid_member" };
  if (isCommunicationTimeoutActive(member)) return { ok: false, reason: "timeout_active" };

  const mutedRoleId = String(options.mutedRoleId || IDs.roles?.Muted || "").trim();
  const guild = member.guild;
  const me = await resolveGuildBotMember(guild, options);
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId, options.mutedRole);
  if (!ctx) return { ok: false, reason: "muted_role_unusable" };

  const reasonOut = String(options.reason || "Fine timeout / +unmute");
  const hasMuted = member.roles.cache.has(ctx.mutedRoleId);
  const saved = await loadSnapshot(guild.id, member.id);
  const wasUnmuteFlow = Boolean(options.wasUnmuteFlow);
  if (!hasMuted && saved.length === 0 && !wasUnmuteFlow) return { ok: true, restored: false, reason: "noop" };

  let profileDoc = options.profileDoc || null;
  if (wasUnmuteFlow && !hasMuted) {
    if (!profileDoc) {
      profileDoc = await ActivityUserProfile.findOne({ guildId: guild.id, userId: member.id })
        .select("moderation.modCases moderation.postUnmuteRolesReconciledAt")
        .lean()
        .catch(() => null);
    }
    if (isPostUnmuteReconciliationCurrent(profileDoc, guild.id, member.id)) {
      const memberRoleId = String(IDs.roles?.Member || "").trim();
      const missingCoreMember = Boolean(memberRoleId && !member.roles.cache.has(memberRoleId) && saved.length > 0);
      if (!missingCoreMember) {
        markRecentUnmuteProfileRecovery(guild.id, member.id);
        // Clear stale in-memory/Mongo snapshots left by workers that failed mid-restore.
        if (saved.length > 0) await clearSnapshot(guild.id, member.id);
        return { ok: true, restored: false, restoreOk: true, reason: "already_reconciled" };
      }
      global.logger?.warn?.(
        "[mutedMirrorRole] already_reconciled ma Member assente: riprovo restore",
        guild.id,
        member.id,
      );
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
      await setMemberRolesSafe(member, targetIds, reasonOut);
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
    if (isUnknownDiscordMemberError(err)) {
      await clearSnapshot(guild.id, member.id);
      try {
        guild.members?.cache?.delete?.(member.id);
      } catch (_) {}
      return { ok: true, restored: false, restoreOk: true, reason: "unknown_member" };
    }
    global.logger?.warn?.("[mutedMirrorRole] restore failed:", guild.id, member.id, err?.message || err);
    if (hasMuted) {
      const removed = await member.roles.remove(ctx.mutedRoleId, reasonOut).then(() => true).catch((err2) => {
        if (isUnknownDiscordMemberError(err2)) return true;
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
    const removedStale = await member.roles.remove(ctx.mutedRoleId, reasonOut).then(() => true).catch((err) => {
      if (isUnknownDiscordMemberError(err)) {
        clearSnapshot(guild.id, member.id).catch(() => {});
        try {
          guild.members?.cache?.delete?.(member.id);
        } catch (_) {}
        return true;
      }
      global.logger?.warn?.("[mutedMirrorRole] remove stale muted:", guild.id, member.id, err?.message || err);
      return false;
    });
    if (removedStale) {
      restored = true;
      if (!restoreOk && saved.length === 0) restoreOk = true;
    }
  }

  if (restoreOk) {
    await clearSnapshot(guild.id, member.id);
  } else if (saved.length > 0) {
    global.logger?.warn?.("[mutedMirrorRole] snapshot kept for retry:", guild.id, member.id, saved.length);
  }

  // Conta solo lavoro mute/snapshot: il profileResync da solo generava log 1/min falsi.
  const muteWorkDone = Boolean(restored || restoreOk);

  let profileResync = null;
  const shouldProfileResync =
    options.runProfileResync !== false &&
    (muteWorkDone || saved.length > 0 || hasMuted || wasUnmuteFlow);
  if (shouldProfileResync) {
    const freshMember = (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
    profileResync = await resyncProfileDerivedRolesForMember(freshMember, options.client || guild.client, {
      reason: reasonOut,
      skipMutedRemove: true,
    }).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] profile resync failed:", guild.id, member.id, err?.message || err);
      return null;
    });
  }

  const pendingSnapshot = await loadSnapshot(guild.id, member.id);
  const stillMuted = member.roles.cache.has(ctx.mutedRoleId);
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const restoredCoreMember = !memberRoleId || member.roles.cache.has(memberRoleId) || saved.length === 0;
  if (
    wasUnmuteFlow &&
    !isCommunicationTimeoutActive(member) &&
    !stillMuted &&
    pendingSnapshot.length === 0 &&
    restoredCoreMember
  ) {
    await markPostUnmuteReconciliationComplete(guild.id, member.id);
  }

  return {
    ok: true,
    restored: muteWorkDone,
    restoreOk,
    profileResync,
    reason: muteWorkDone ? undefined : profileResyncMadeChanges(profileResync) ? "profile_only" : "noop",
  };
}

/**
 * Timeout Discord (+mute, AutoMod, client): all'ingresso salva i ruoli, lascia solo Muted; alla fine ripristina e rimuove Muted.
 */
async function syncMutedMirrorRoleFromMemberUpdate(oldMember, newMember) {
  if (!newMember?.guild || newMember.user?.bot) return;
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(newMember.guild.id)) return;
  } catch (_) {}

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  if (!didCommunicationTimeoutChange(oldMember, newMember)) {
    // Ruoli aggiunti mentre timeout/Muted è attivo (es. tenure al rejoin).
    const nowActive = isCommunicationTimeoutActive(newMember);
    const hasMuted = newMember.roles.cache.has(mutedRoleId);
    if (!(nowActive || hasMuted)) return;
    const oldSize = oldMember?.roles?.cache?.size || 0;
    const newSize = newMember?.roles?.cache?.size || 0;
    if (newSize <= oldSize && hasMuted) {
      // Possibile swap: controlla comunque se ci sono ruoli extra oltre lo strip set.
    }
    await enforceMutedStripIfNeeded(newMember, {
      reason: "Timeout Discord / +mute (ruoli extra)",
    });
    return;
  }

  const guild = newMember.guild;
  const me = await resolveGuildBotMember(guild);
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
        "[mutedMirrorRole] snapshot vuoto al mute: applico solo Muted, nessuna strip ruoli",
        guild.id,
        newMember.id,
      );
      await newMember.roles.add(ctx.mutedRoleId, reasonIn).catch((err) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
      return;
    }
    await upsertSnapshot(guild.id, newMember.id, snapshotIds);
    if (!(await hasSnapshot(guild.id, newMember.id))) {
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
    await setMemberRolesSafe(newMember, stripTarget, reasonIn).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] strip+mirror failed:", guild.id, newMember.id, err?.message || err);
    });
    return;
  }

  if (nowActive && wasActive) {
    await enforceMutedStripIfNeeded(newMember, { me, reason: `${reasonIn} (sync)` });
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

  const docs = await ActivityUserProfile.find({ "profile.muteRoleSnapshot.roleIds.0": { $exists: true } })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of docs) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    const key = `${guildId}:${userId}`;
    if (!guildId || !userId || seen.has(key)) continue;
    try {
      const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
      if (!isViniliFullFeatureGuild(guildId)) continue;
    } catch (_) {}
    seen.add(key);
    scanned += 1;

    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      await clearSnapshot(guildId, userId);
      continue;
    }
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) {
      // Non cancellare lo snapshot mentre l'utente è offline (leave/rejoin mute).
      continue;
    }
    const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
    // Timeout ancora attivo, o non verificabile: non toccare (evita loop 1/min).
    if (untilMs == null || untilMs > Date.now()) continue;

    const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
      ...options,
      client,
      wasUnmuteFlow: true,
    });
    if (result?.restored && result?.reason !== "already_reconciled") {
      reconciled += 1;
      global.logger?.info?.(
        `[mutedMirrorRole] restored guild=${guildId} user=${userId} reason=${result?.reason || "ok"}`,
      );
    }
  }

  if (mutedRoleId) {
    for (const guildStub of client.guilds.cache.values()) {
      const guildId = String(guildStub?.id || "").trim();
      if (!guildId) continue;
      try {
        const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
        if (!isViniliFullFeatureGuild(guildId)) continue;
      } catch (_) {}

      let guild = guildStub;
      // bot-scheduler seeds partial stubs without members — hydrate before touch.
      if (guild?.partial === true || !guild?.members || typeof guild.members.fetch !== "function") {
        guild = await getClientGuildCached(client, guildId).catch(() => null);
        if (!guild?.members) continue;
      }

      const me = await resolveGuildBotMember(guild, options);
      if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) continue;
      let mutedRole = guild.roles?.cache?.get(mutedRoleId);
      if (!mutedRole) mutedRole = await guild.roles?.fetch?.(mutedRoleId).catch(() => null);
      if (!mutedRole?.members) continue;

      for (const [, cachedMember] of mutedRole.members) {
        if (cachedMember.user?.bot) continue;
        const key = `${guild.id}:${cachedMember.id}`;
        if (seen.has(key)) continue;

        // REST/worker: role.members può contenere stub senza roles.set — non usarli.
        const member = await getGuildMemberCached(guild, cachedMember.id, { preferFresh: true }).catch(() => null);
        if (!member?.roles?.cache) {
          await clearSnapshot(guild.id, cachedMember.id);
          mutedRole.members?.delete?.(cachedMember.id);
          continue;
        }
        const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
        if (untilMs == null || untilMs > Date.now()) continue;

        const saved = await loadSnapshot(guild.id, member.id);
        if (saved.length === 0 && !member.roles.cache.has(mutedRoleId)) {
          mutedRole.members?.delete?.(member.id);
          continue;
        }

        seen.add(key);
        scanned += 1;
        const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
          ...options,
          client,
          wasUnmuteFlow: true,
        });
        if (result?.restoreOk || (result?.restored && !member.roles.cache.has(mutedRoleId))) {
          mutedRole.members?.delete?.(member.id);
        }
        if (result?.restored && result?.reason !== "already_reconciled") {
          reconciled += 1;
          global.logger?.info?.(
            `[mutedMirrorRole] restored guild=${guild.id} user=${member.id} reason=${result?.reason || "ok"}`,
          );
        }
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
  // Non cancellare lo snapshot al leave: Discord a volte omette
  // communicationDisabledUntil e cancellavamo il backup pre-mute.
  // Lo snapshot resta fino all'unmute / restore riuscito.
  void member;
}

async function syncMutedMirrorOnMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return;

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  const guild = member.guild;
  const me = await resolveGuildBotMember(guild);
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return;

  const timeoutActive = isCommunicationTimeoutActive(member);
  let saved = await loadSnapshot(guild.id, member.id);
  if (!timeoutActive && !saved.length) return;

  // Timeout già scaduto ma snapshot ancora presente → ripristina, non restrippare.
  if (!timeoutActive && saved.length) {
    await restoreRolesAfterCommunicationTimeoutEnd(member, {
      me,
      mutedRoleId: ctx.mutedRoleId,
      mutedRole: ctx.mutedRole,
      reason: "Rejoin post-mute: ripristino snapshot",
      wasUnmuteFlow: true,
      client: member.client || guild.client,
    });
    return;
  }

  const reasonIn = "Timeout Discord / +mute (rejoin)";
  if (!saved.length && timeoutActive) {
    // Preferisci snapshot profilo (vero pre-mute) rispetto ai ruoli attuali
    // (spesso vuoti / solo @everyone al rejoin).
    const fromProfile = await loadProfileMuteSnapshotRoleIds(guild.id, member.id);
    const snapshotIds = fromProfile.length
      ? fromProfile
      : collectSnapshotRoleIds(member, ctx.mutedRoleId);
    if (snapshotIds.length) {
      await upsertSnapshot(guild.id, member.id, snapshotIds);
      saved = snapshotIds;
    }
  }
  if (!(await hasSnapshot(guild.id, member.id))) {
    global.logger?.error?.(
      "[mutedMirrorRole] abort rejoin strip: snapshot non disponibile",
      guild.id,
      member.id,
    );
    await member.roles.add(ctx.mutedRoleId, reasonIn).catch(() => null);
    return;
  }
  const stripTarget = me
    ? buildRolesWhileMuted(member, me, ctx.mutedRoleId)
    : [ctx.mutedRoleId];
  await setMemberRolesSafe(member, stripTarget, reasonIn).catch((err) => {
    global.logger?.warn?.("[mutedMirrorRole] rejoin strip+mirror failed:", guild.id, member.id, err?.message || err);
  });
}

/**
 * Se durante un mute attivo vengono riapplicati ruoli base (tenure/rejoin),
 * ritaglia di nuovo a Muted (+ unmanaged).
 */
async function enforceMutedStripIfNeeded(member, options = {}) {
  if (!member?.guild || member.user?.bot) return false;
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(member.guild.id)) return false;
  } catch (_) {}

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return false;

  const timeoutActive = isCommunicationTimeoutActive(member);
  const hasMuted = member.roles.cache.has(mutedRoleId);
  const hasPending = timeoutActive ? true : await hasPendingMuteMirrorSnapshot(member.guild.id, member.id);
  if (!timeoutActive && !hasMuted && !hasPending) return false;
  if (!timeoutActive && !hasMuted) return false;

  const guild = member.guild;
  const me = options.me || (await resolveGuildBotMember(guild));
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return false;

  // Timeout attivo senza snapshot: salva i ruoli attuali prima di strippare,
  // altrimenti all'unmute non c'è nulla da ripristinare.
  if (timeoutActive && !(await hasSnapshot(guild.id, member.id))) {
    const fromProfile = await loadProfileMuteSnapshotRoleIds(guild.id, member.id);
    const snapshotIds = fromProfile.length
      ? fromProfile
      : collectSnapshotRoleIds(member, ctx.mutedRoleId);
    if (snapshotIds.length) {
      await upsertSnapshot(guild.id, member.id, snapshotIds);
    }
  }

  // Mai strippare senza snapshot: altrimenti all'unmute restano solo Unverified.
  if (timeoutActive && !(await hasSnapshot(guild.id, member.id))) {
    global.logger?.warn?.(
      "[mutedMirrorRole] enforce strip abortito: snapshot vuoto",
      guild.id,
      member.id,
    );
    if (!member.roles.cache.has(ctx.mutedRoleId)) {
      await member.roles.add(ctx.mutedRoleId, String(options.reason || "Timeout Discord / +mute")).catch(() => null);
    }
    return false;
  }

  const stripTarget = me
    ? buildRolesWhileMuted(member, me, ctx.mutedRoleId)
    : [ctx.mutedRoleId];
  const allowed = new Set(stripTarget.map(String));
  let needsStrip = !member.roles.cache.has(ctx.mutedRoleId);
  if (!needsStrip) {
    for (const [id] of member.roles.cache) {
      const rid = String(id || "").trim();
      if (!rid || rid === String(guild.id)) continue;
      if (!allowed.has(rid)) {
        needsStrip = true;
        break;
      }
    }
  }
  if (!needsStrip) return false;

  const reason = String(options.reason || "Timeout Discord / +mute (enforce strip)").trim();
  await setMemberRolesSafe(member, stripTarget, reason).catch((err) => {
    global.logger?.warn?.("[mutedMirrorRole] enforce strip failed:", guild.id, member.id, err?.message || err);
  });
  return true;
}

/**
 * Salva i ruoli attuali PRIMA di applicare timeout/strip.
 * Chiamare da +mute prima di member.timeout().
 */
async function captureMuteRoleSnapshot(member, options = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "bad_member", roleIds: [] };
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(member.guild.id)) return { ok: false, reason: "out_of_scope", roleIds: [] };
  } catch (_) {}

  const mutedRoleId = String(options.mutedRoleId || IDs.roles?.Muted || "").trim();
  const existing = await loadSnapshot(member.guild.id, member.id);
  if (existing.length) return { ok: true, reason: "already_saved", roleIds: existing };

  const fromProfile = await loadProfileMuteSnapshotRoleIds(member.guild.id, member.id);
  const current = collectSnapshotRoleIds(member, mutedRoleId);
  const roleIds = fromProfile.length ? fromProfile : current;
  if (!roleIds.length) return { ok: false, reason: "empty_roles", roleIds: [] };

  await upsertSnapshot(member.guild.id, member.id, roleIds);
  if (!(await hasSnapshot(member.guild.id, member.id))) {
    return { ok: false, reason: "persist_failed", roleIds };
  }
  return { ok: true, reason: String(options.reason || "captured"), roleIds };
}

/**
 * Timeout Discord già attivo ma Muted/strip incompleti (es. mute durante restart).
 * Applica snapshot + strip come al rejoin.
 */
async function applyActiveMuteMirror(member, options = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "bad_member" };
  if (!isCommunicationTimeoutActive(member)) return { ok: false, reason: "no_timeout" };
  const reason = String(options.reason || "Timeout Discord / +mute (reconcile)").trim();
  const changed = await enforceMutedStripIfNeeded(member, {
    me: options.me,
    reason,
  });
  if (changed) return { ok: true, reason: "enforced" };
  // enforce può no-op se già strippati: ok.
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && !member.roles.cache.has(mutedRoleId)) {
    await syncMutedMirrorOnMemberJoin(member);
    return { ok: true, reason: "rejoin_apply" };
  }
  return { ok: true, reason: "already_ok" };
}

async function listActiveMuteCaseUserIds(guildId, limit = 50) {
  const gid = String(guildId || "").trim();
  if (!gid || !dbReady()) return [];
  const now = new Date();
  const rows = await ActivityUserProfile.find({
    guildId: gid,
    "moderation.modCases": {
      $elemMatch: {
        action: "MUTE",
        active: { $ne: false },
        expiresAt: { $gt: now },
      },
    },
  })
    .select("userId")
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)))
    .lean()
    .catch(() => []);
  return rows.map((r) => String(r.userId || "").trim()).filter(Boolean);
}

/**
 * Riconcilia mute incompleti: timeout Discord sì, ma senza Muted / senza strip ruoli.
 * Utile dopo restart (guildMemberUpdate perso) o race Mongo.
 */
async function reconcileIncompleteActiveMuteMirrors(client, options = {}) {
  if (activeMuteReconcileInFlight) return activeMuteReconcileInFlight;
  activeMuteReconcileInFlight = runReconcileIncompleteActiveMuteMirrors(client, options).finally(() => {
    activeMuteReconcileInFlight = null;
  });
  return activeMuteReconcileInFlight;
}

async function runReconcileIncompleteActiveMuteMirrors(client, options = {}) {
  if (!client?.guilds) return { scanned: 0, fixed: 0 };
  await ensureMongoReady({ maxWaitMs: 5000 }).catch(() => null);
  if (!dbReady()) return { scanned: 0, fixed: 0 };

  const limit = Math.max(1, Math.min(200, Number(options.limit) || ACTIVE_MUTE_RECONCILE_LIMIT));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const seen = new Set();
  let scanned = 0;
  let fixed = 0;
  let skippedNoTimeout = 0;

  const queueByIds = async (guildId, userId, reason) => {
    const uid = String(userId || "").trim();
    const gid = String(guildId || "").trim();
    if (!gid || !uid) return;
    const key = `${gid}:${uid}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
      if (!isViniliFullFeatureGuild(gid)) return;
    } catch (_) {}
    scanned += 1;

    const guild = await getClientGuildCached(client, gid).catch(() => null);
    if (!guild?.members) return;
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member || member.user?.bot) return;

    // REST/scheduler: conferma timeout via raw member se il campo manca in cache.
    const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
    const timeoutActive =
      untilMs == null
        ? isCommunicationTimeoutActive(member)
        : Number.isFinite(untilMs) && untilMs > Date.now();
    if (!timeoutActive) {
      skippedNoTimeout += 1;
      return;
    }
    // Allinea il member locale se abbiamo letto il timeout via REST.
    if (
      Number.isFinite(untilMs) &&
      untilMs > Date.now() &&
      !isCommunicationTimeoutActive(member)
    ) {
      try {
        member.communicationDisabledUntilTimestamp = untilMs;
        member.communicationDisabledUntil = new Date(untilMs);
      } catch (_) {}
    }

    const beforeMuted = mutedRoleId ? member.roles.cache.has(mutedRoleId) : true;
    const result = await applyActiveMuteMirror(member, { reason }).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] active reconcile failed:", gid, uid, err?.message || err);
      return null;
    });
    if (!result?.ok) return;
    const after =
      (await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null)) || member;
    const afterMuted = mutedRoleId ? after.roles.cache.has(mutedRoleId) : true;
    if (!beforeMuted || result.reason === "enforced" || result.reason === "rejoin_apply") {
      if (afterMuted || result.reason === "enforced") {
        fixed += 1;
        global.logger?.info?.(
          `[mutedMirrorRole] active mute reconciled guild=${gid} user=${uid} via=${result.reason}`,
        );
      }
    }
  };

  // Mongo-first (come sweep): funziona anche sul bot-scheduler REST senza guild.members pieni.
  const snapshotDocs = await ActivityUserProfile.find({ "profile.muteRoleSnapshot.roleIds.0": { $exists: true } })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of snapshotDocs) {
    if (scanned >= limit) break;
    await queueByIds(doc.guildId, doc.userId, "Timeout Discord / +mute (reconcile snapshot)");
  }

  const caseDocs = await ActivityUserProfile.find({
    "moderation.modCases": {
      $elemMatch: {
        action: "MUTE",
        active: { $ne: false },
        expiresAt: { $gt: new Date() },
      },
    },
  })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of caseDocs) {
    if (scanned >= limit) break;
    await queueByIds(doc.guildId, doc.userId, "Timeout Discord / +mute (reconcile case)");
  }

  // Gateway bots: eventuali timeout in cache senza caso/snapshot.
  if (options.scanTimedOutMembers !== false) {
    for (const guildStub of client.guilds.cache.values()) {
      if (scanned >= limit) break;
      const guildId = String(guildStub?.id || "").trim();
      if (!guildId) continue;
      try {
        const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
        if (!isViniliFullFeatureGuild(guildId)) continue;
      } catch (_) {}
      if (guildStub?.partial === true || !guildStub?.members?.cache?.size) continue;
      for (const [, cachedMember] of guildStub.members.cache) {
        if (scanned >= limit) break;
        if (!cachedMember || cachedMember.user?.bot) continue;
        if (!isCommunicationTimeoutActive(cachedMember)) continue;
        await queueByIds(guildId, cachedMember.id, "Timeout Discord / +mute (reconcile timed-out)");
      }
    }
  }

  if (fixed > 0) {
    global.logger?.info?.(
      `[mutedMirrorRole] active mute reconcile scanned=${scanned} fixed=${fixed} skippedNoTimeout=${skippedNoTimeout}`,
    );
  }
  return { scanned, fixed, skippedNoTimeout };
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
  const me = await resolveGuildBotMember(member.guild);
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
  const me = await resolveGuildBotMember(member.guild);
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
  enforceMutedStripIfNeeded,
  applyActiveMuteMirror,
  captureMuteRoleSnapshot,
  reconcileIncompleteActiveMuteMirrors,
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