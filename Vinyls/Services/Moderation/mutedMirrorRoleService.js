const { PermissionsBitField } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { CommunicationTimeoutRoleSnapshot } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const SWEEP_DEFAULT_LIMIT = 50;
const MUTE_RESTORE_ANNOUNCE_SUPPRESS_MS = 90_000;
const muteRestoreAnnounceSuppressByMember = new Map();

function memberSuppressKey(guildId, userId) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function cleanupMuteRestoreAnnounceSuppress(now = Date.now()) {
  for (const [key, entry] of muteRestoreAnnounceSuppressByMember.entries()) {
    if (!entry || now >= Number(entry.until || 0)) muteRestoreAnnounceSuppressByMember.delete(key);
  }
}

/** Ruoli reintrodotti da +unmute / fine timeout: non annunciare come nuovi acquisti. */
function registerMuteMirrorRestoreRoleSuppress(guildId, userId, roleIds) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const ids = (Array.isArray(roleIds) ? roleIds : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!ids.length) return;
  const now = Date.now();
  cleanupMuteRestoreAnnounceSuppress(now);
  const key = memberSuppressKey(gid, uid);
  const prev = muteRestoreAnnounceSuppressByMember.get(key);
  const merged = new Set(prev?.roleIds instanceof Set ? [...prev.roleIds] : []);
  for (const id of ids) merged.add(id);
  muteRestoreAnnounceSuppressByMember.set(key, {
    until: now + MUTE_RESTORE_ANNOUNCE_SUPPRESS_MS,
    roleIds: merged,
  });
}

function wasRoleRestoredByMuteMirror(guildId, userId, roleId) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const now = Date.now();
  cleanupMuteRestoreAnnounceSuppress(now);
  const entry = muteRestoreAnnounceSuppressByMember.get(memberSuppressKey(guildId, userId));
  if (!entry || now >= Number(entry.until || 0)) return false;
  return entry.roleIds instanceof Set && entry.roleIds.has(rid);
}

function dbReady() {
  return mongoose.connection?.readyState === 1;
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

async function upsertSnapshot(guildId, userId, roleIds) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await CommunicationTimeoutRoleSnapshot.updateOne(
    { guildId: gid, userId: uid },
    { $set: { guildId: gid, userId: uid, roleIds: Array.isArray(roleIds) ? roleIds.map((x) => String(x || "").trim()).filter(Boolean) : [] } },
    { upsert: true },
  ).catch(() => {});
}

async function loadSnapshot(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return [];
  const doc = await CommunicationTimeoutRoleSnapshot.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  return Array.isArray(doc?.roleIds) ? doc.roleIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

async function clearSnapshot(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await CommunicationTimeoutRoleSnapshot.deleteOne({ guildId: gid, userId: uid }).catch(() => {});
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
  if (!hasMuted && saved.length === 0) return { ok: true, restored: false, reason: "noop" };

  const allowed = await filterRestorableRoleIds(guild, me, saved, ctx.mutedRoleId);
  let restored = false;

  if (allowed.length > 0) {
    registerMuteMirrorRestoreRoleSuppress(guild.id, member.id, allowed);
  }

  try {
    if (saved.length > 0) {
      await member.roles.set(allowed, reasonOut);
      restored = true;
    } else if (hasMuted) {
      await member.roles.remove(ctx.mutedRoleId, reasonOut);
      restored = true;
    }
  } catch (err) {
    global.logger?.warn?.("[mutedMirrorRole] restore failed:", guild.id, member.id, err?.message || err);
    if (hasMuted) {
      await member.roles.remove(ctx.mutedRoleId, reasonOut).catch((err2) => {
        global.logger?.warn?.("[mutedMirrorRole] remove after restore fail:", guild.id, member.id, err2?.message || err2);
      });
      restored = true;
    }
  }

  if (member.roles.cache.has(ctx.mutedRoleId)) {
    await member.roles.remove(ctx.mutedRoleId, reasonOut).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] remove stale muted:", guild.id, member.id, err?.message || err);
    });
    restored = true;
  }

  await clearSnapshot(guild.id, member.id);
  return { ok: true, restored };
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
    const stripTarget = buildRolesWhileMuted(fresh, me, ctx.mutedRoleId);
    await newMember.roles.set(stripTarget, reasonIn).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] strip+mirror failed:", guild.id, newMember.id, err?.message || err);
      clearSnapshot(guild.id, newMember.id).catch(() => {});
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
      });
    }
  }
}

/**
 * Sweep snapshot e membri con ruolo Muted ma timeout scaduto (startup + tick periodico).
 */
async function sweepExpiredCommunicationTimeoutMirrors(client, options = {}) {
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

    const result = await restoreRolesAfterCommunicationTimeoutEnd(member, options);
    if (result?.restored) reconciled += 1;
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
        const result = await restoreRolesAfterCommunicationTimeoutEnd(member, options);
        if (result?.restored) reconciled += 1;
      }
    }
  }

  if (reconciled > 0) {
    global.logger?.info?.(`[mutedMirrorRole] sweep reconciled ${reconciled} member(s), scanned=${scanned}`);
  }
  return { reconciled, scanned };
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

module.exports = {
  syncMutedMirrorRoleFromMemberUpdate,
  syncMutedMirrorOnMemberJoin,
  handleMuteMirrorOnMemberLeave,
  hasPendingMuteMirrorSnapshot,
  shouldDeferRoleRestoreForMuteMirror,
  restoreRolesAfterCommunicationTimeoutEnd,
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