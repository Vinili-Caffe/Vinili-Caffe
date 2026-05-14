const { PermissionsBitField } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { CommunicationTimeoutRoleSnapshot } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");

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

function filterRestorableRoleIds(guild, me, roleIds, mutedRoleId) {
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
    const role = guild.roles.cache.get(rid);
    if (!role || role.managed) continue;
    if (Number(role.position || 0) >= highest) continue;
    seen.add(rid);
    out.push(rid);
  }
  return out;
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
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  let mutedRole = guild.roles.cache.get(mutedRoleId);
  if (!mutedRole) mutedRole = await guild.roles.fetch(mutedRoleId).catch(() => null);
  if (!mutedRole || mutedRole.managed) return;
  if (mutedRole.position >= me.roles.highest.position) {
    global.logger?.warn?.("[mutedMirrorRole] Muted role above bot:", guild.id, mutedRoleId);
    return;
  }

  const wasActive = isCommunicationTimeoutActive(oldMember);
  const nowActive = isCommunicationTimeoutActive(newMember);
  const hasMuted = newMember.roles.cache.has(mutedRoleId);
  const reasonIn = "Timeout Discord / +mute";
  const reasonOut = "Fine timeout / +unmute";

  if (nowActive && !wasActive) {
    const snapshotIds = collectSnapshotRoleIds(oldMember, mutedRoleId);
    await upsertSnapshot(guild.id, newMember.id, snapshotIds);
    await newMember.roles.set([mutedRoleId], reasonIn).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] strip+mirror failed:", guild.id, newMember.id, err?.message || err);
      clearSnapshot(guild.id, newMember.id).catch(() => {});
    });
    return;
  }

  if (nowActive && wasActive) {
    if (!hasMuted) {
      await newMember.roles.add(mutedRoleId, `${reasonIn} (sync)`).catch((err) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
    }
    return;
  }

  if (!nowActive && wasActive) {
    const saved = await loadSnapshot(guild.id, newMember.id);
    const allowed = filterRestorableRoleIds(guild, me, saved, mutedRoleId);
    try {
      await newMember.roles.set(allowed, reasonOut);
    } catch (err) {
      global.logger?.warn?.("[mutedMirrorRole] restore failed:", guild.id, newMember.id, err?.message || err);
      await newMember.roles.remove(mutedRoleId, reasonOut).catch((err2) => {
        global.logger?.warn?.("[mutedMirrorRole] remove after restore fail:", guild.id, newMember.id, err2?.message || err2);
      });
    }
    await clearSnapshot(guild.id, newMember.id);
    return;
  }

  if (!nowActive && hasMuted) {
    await newMember.roles.remove(mutedRoleId, reasonOut).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] remove failed:", guild.id, newMember.id, err?.message || err);
    });
    await clearSnapshot(guild.id, newMember.id);
  }
}

module.exports = {
  syncMutedMirrorRoleFromMemberUpdate,
  isCommunicationTimeoutActive,
  didCommunicationTimeoutChange,
};