const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const { syncMutedMirrorRoleFromMemberUpdate } = require("./mutedMirrorRoleService");
const { createModCase, getModConfig, logModCase } = require("../../Utils/Moderation/moderation");

const EXTRA_PROTECTED_ROLE_IDS = Object.freeze([
  "1442568888096391260",
  "1442568890075971724",
  "1472903558792740956",
]);

const STAFF_ACTOR_ROLE_KEYS = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "SeniorModerator",
  "HighStaff",
  "Mod",
  "Helper",
  "Staff",
  "PartnerManager",
  "CommunityManager",
]);

const PROTECTED_ROLE_KEYS = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "SeniorModerator",
  "HighStaff",
  "Mod",
  "Helper",
  "Staff",
  "Perms1",
  "Perms2",
]);

const GUARD_REASON =
  "<:VC_Lock:1482526739044368476> Assegnazione manuale ruoli staff vietata: quarantena automatica";
const DEDUPE_MS = 12_000;
const recentActions = new Map();

let protectedRoleIdSet = null;
let staffActorRoleIdSet = null;

function roleIdFromKey(key) {
  return String(IDs.roles?.[key] || "").trim();
}

function buildRoleIdSet(keys, extraIds = []) {
  const set = new Set();
  for (const key of keys) {
    const id = roleIdFromKey(key);
    if (id) set.add(id);
  }
  for (const id of extraIds) {
    const norm = String(id || "").trim();
    if (norm) set.add(norm);
  }
  return set;
}

function getProtectedRoleIdSet() {
  if (!protectedRoleIdSet) {
    protectedRoleIdSet = buildRoleIdSet(PROTECTED_ROLE_KEYS, EXTRA_PROTECTED_ROLE_IDS);
  }
  return protectedRoleIdSet;
}

function getStaffActorRoleIdSet() {
  if (!staffActorRoleIdSet) {
    staffActorRoleIdSet = buildRoleIdSet(STAFF_ACTOR_ROLE_KEYS);
  }
  return staffActorRoleIdSet;
}

function isRecentDuplicate(guildId, executorId, targetId) {
  const key = `${guildId}:${executorId}:${targetId}`;
  const now = Date.now();
  const prev = Number(recentActions.get(key) || 0);
  if (prev && now - prev < DEDUPE_MS) return true;
  recentActions.set(key, now);
  if (recentActions.size > 500) {
    for (const [k, ts] of recentActions.entries()) {
      if (now - Number(ts) > DEDUPE_MS) recentActions.delete(k);
    }
  }
  return false;
}

function memberIsFounder(member) {
  const founderId = roleIdFromKey("Founder");
  if (!founderId || !member?.roles?.cache) return false;
  return member.roles.cache.has(founderId);
}

function memberIsStaffActor(member) {
  if (!member?.roles?.cache) return false;
  const staffIds = getStaffActorRoleIdSet();
  for (const roleId of staffIds) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

function filterProtectedAddedRoles(addedRoles) {
  const protectedIds = getProtectedRoleIdSet();
  return (Array.isArray(addedRoles) ? addedRoles : []).filter((role) => {
    const id = String(role?.id || role || "").trim();
    return id && protectedIds.has(id);
  });
}

function isBotExecutor(guild, executorId) {
  const id = String(executorId || "").trim();
  if (!id) return true;
  const clientId = String(guild?.client?.user?.id || "").trim();
  if (clientId && id === clientId) return true;
  const botOfficial = roleIdFromKey("BotUfficiale");
  if (botOfficial && id === botOfficial) return true;
  return false;
}

async function removeProtectedRolesFromTarget(guild, targetMember, protectedRoles) {
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { removed: [], ok: false };
  }
  const removable = protectedRoles.filter((role) => {
    const pos = Number(role?.position ?? guild.roles.cache.get(String(role?.id || ""))?.position ?? 0);
    return pos < Number(me.roles.highest.position || 0);
  });
  if (!removable.length) return { removed: [], ok: false };
  const ok = await targetMember.roles
    .remove(removable, `${GUARD_REASON} (rollback ruoli)`)
    .then(() => true)
    .catch(() => false);
  return { removed: ok ? removable : [], ok };
}

async function applyStaffGuardMuteQuarantine(member, client, context = {}) {
  const guild = member?.guild;
  if (!guild || !member?.id) return { ok: false, reason: "invalid_member" };

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return { ok: false, reason: "missing_muted_role" };

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "missing_manage_roles" };
  }

  const mutedRole = await getGuildRoleCached(guild, mutedRoleId, { ttlMs: 30_000 });
  if (!mutedRole || mutedRole.position >= me.roles.highest.position) {
    return { ok: false, reason: "muted_role_too_high" };
  }

  if (member.roles.cache.has(mutedRoleId)) {
    return { ok: true, reason: "already_muted" };
  }

  const beforeMember = member;
  const added = await member.roles.add(mutedRoleId, GUARD_REASON).then(() => true).catch(() => false);
  if (!added) return { ok: false, reason: "add_muted_failed" };

  const afterMember =
    (await getGuildMemberCached(guild, member.id, { preferFresh: true, ttlMs: 1 }).catch(() => null)) ||
    beforeMember;
  await syncMutedMirrorRoleFromMemberUpdate(beforeMember, afterMember).catch((err) => {
    global.logger?.warn?.(
      "[staffRoleAssignmentGuard] muted mirror sync:",
      guild.id,
      member.id,
      err?.message || err,
    );
  });

  if (client) {
    try {
      const config = await getModConfig(guild.id);
      const { doc, created } = await createModCase({
        guildId: guild.id,
        action: "MUTE",
        userId: member.id,
        modId: client.user.id,
        reason: GUARD_REASON,
        durationMs: null,
        context: context || {},
        dedupe: { enabled: true, windowMs: 15_000, matchReason: true },
      });
      if (created) {
        await logModCase({ client, guild, modCase: doc, config });
      }
    } catch (err) {
      global.logger?.warn?.(
        "[staffRoleAssignmentGuard] mod case failed:",
        guild.id,
        member.id,
        err?.message || err,
      );
    }
  }

  return { ok: true, reason: "muted" };
}

async function sendStaffGuardLog(guild, lines) {
  const channelId = String(IDs.channels?.moderazioneStaff || "").trim();
  if (!guild || !channelId || !Array.isArray(lines) || !lines.length) return;
  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor("#E74C3C")
    .setTitle("<:VC_Lock:1482526739044368476> Blocco assegnazione ruoli staff")
    .setDescription(lines.join("\n"));
  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[staffRoleAssignmentGuard] log send failed:", guild.id, err?.message || err);
  });
}

async function handleStaffRoleAssignmentGuard({
  guild,
  targetMember,
  addedRoles,
  executorId,
  executor,
  client,
}) {
  if (!guild || !targetMember) return { handled: false };

  const protectedAdded = filterProtectedAddedRoles(addedRoles);
  if (!protectedAdded.length) return { handled: false };

  const actorId = String(executorId || executor?.id || "").trim();
  if (!actorId || isBotExecutor(guild, actorId)) return { handled: false };

  const executorMember =
    executor ||
    guild.members.cache.get(actorId) ||
    (await getGuildMemberCached(guild, actorId, { ttlMs: 5_000 }).catch(() => null));

  if (memberIsFounder(executorMember)) {
    return { handled: false, allowed: true };
  }

  if (isRecentDuplicate(guild.id, actorId, targetMember.id)) {
    return { handled: true, deduped: true };
  }

  const rollback = await removeProtectedRolesFromTarget(guild, targetMember, protectedAdded);

  let muteResult = { ok: false, reason: "missing_executor" };
  if (executorMember) {
    muteResult = await applyStaffGuardMuteQuarantine(executorMember, client, {
      targetUserId: targetMember.id,
      protectedRoleIds: protectedAdded.map((r) => String(r?.id || "")).filter(Boolean),
    });
  }

  const roleLines = protectedAdded
    .slice(0, 12)
    .map((role) => `<a:VC_Arrow:1482706699365257397> ${role}`)
    .join("\n");

  await sendStaffGuardLog(guild, [
    `<:VC_Staff:1494286904089247754> **Responsabile:** <@${actorId}> \`${actorId}\``,
    `<:VC_User:1482527453586002103> **Target:** ${targetMember.user || targetMember} \`${targetMember.id}\``,
    `<:VC_tools:1478862265305272364> **Ruoli bloccati:**`,
    roleLines,
    rollback.ok
      ? "<:success:1461731530333229226> Ruoli rimossi dal target."
      : "<:cancel:1461730653677551691> Rollback ruoli non riuscito (permessi/gerarchia).",
    muteResult.ok
      ? "<:VC_Lock:1482526739044368476> Responsabile in quarantena (mute: ruoli rimossi + ruolo Muted)."
      : `<:cancel:1461730653677551691> Quarantena non applicata: \`${muteResult.reason}\`.`,
  ]);

  return {
    handled: true,
    rollback: rollback.ok,
    quarantined: Boolean(muteResult.ok),
  };
}

module.exports = {
  handleStaffRoleAssignmentGuard,
  getProtectedStaffAssignmentRoleIds: () => [...getProtectedRoleIdSet()],
  getStaffActorRoleIds: () => [...getStaffActorRoleIdSet()],
};
