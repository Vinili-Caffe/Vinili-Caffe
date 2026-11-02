const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  canSafelyDeleteCustomPerkRole,
  collectBlockedSystemRoleIds,
  isCustomRolePurgeDryRun,
} = require("../../Utils/Community/userCustomRoleFilter") as typeof import("../../Utils/Community/userCustomRoleFilter");
const { getClientGuildCached, getGuildChannelCached, getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const CUSTOM_VOICE_CATEGORY_ID = IDs.categories.categoryPrivate;
const CHECK_INTERVAL_MS = 60 * 1000;
let expiryLoopHandle = null;
const CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS = 7;
const CUSTOM_VOC_GRACE_MS = CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS * 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_GRACE_MS = CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS * 24 * 60 * 60 * 1000;

async function execLean(queryOrValue?, fallback = null) {
  if (queryOrValue && typeof queryOrValue.lean === "function") {
    return queryOrValue.lean();
  }
  const value = await queryOrValue;
  return value ?? fallback;
}

function findVoiceByRole(guild?, roleId?) {
  if (!guild || !roleId) return null;
  return (
    guild.channels.cache.find((ch?) => {
      if (ch.type !== ChannelType.GuildVoice) return false;
      if (CUSTOM_VOICE_CATEGORY_ID && ch.parentId !== CUSTOM_VOICE_CATEGORY_ID)
        return false;
      const overwrite = ch.permissionOverwrites.cache.get(roleId);
      if (!overwrite) return false;
      return (
        overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
        overwrite.allow.has(PermissionsBitField.Flags.Speak)
      );
    }) || null
  );
}

async function resolveVoiceChannel(guild?, doc?) {
  if (!guild || !doc) return null;
  let channel = null;

  if (doc.customVocChannelId) {
    channel =
      guild.channels.cache.get(doc.customVocChannelId) ||
      (await getGuildChannelCached(guild, doc.customVocChannelId));
  }
  if (!channel && doc.roleId) {
    channel = findVoiceByRole(guild, doc.roleId);
  }
  if (channel && channel.type !== ChannelType.GuildVoice) return null;
  return channel || null;
}

async function canManageRole(guild?, role?) {
  if (!guild || !role) return false;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles))
    return false;
  return role.position < me.roles.highest.position;
}

async function canManageChannels(guild?) {
  if (!guild) return false;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  return Boolean(
    me?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

async function deleteDiscordCustomPerkArtifacts(guild?, doc?, opts: Record<string, any> = {}) {
  if (!guild || !doc?.userId) return { roleHandled: true, channelHandled: true };
  const userId = String(doc.userId);
  const dryRun = opts.dryRun === true || isCustomRolePurgeDryRun();
  const blockedRoleIds = collectBlockedSystemRoleIds();
  let role = doc.roleId
    ? guild.roles.cache.get(doc.roleId) || (await getGuildRoleCached(guild, doc.roleId))
    : null;
  let secondaryRole = doc.secondaryRoleId
    ? guild.roles.cache.get(doc.secondaryRoleId) || (await getGuildRoleCached(guild, doc.secondaryRoleId))
    : null;
  let voiceChannel = await resolveVoiceChannel(guild, doc);
  const skippedRoles = [];

  async function tryDeleteCustomRole(roleObj?, label?) {
    if (!roleObj) return;
    const gate = canSafelyDeleteCustomPerkRole(roleObj, doc, { blockedRoleIds });
    if (!gate.ok) {
      skippedRoles.push({ roleId: String(roleObj.id), roleName: roleObj.name, reason: gate.reason, label });
      global.logger?.warn?.(
        `[CUSTOM ROLE PURGE] skip ${label} role=${roleObj.id} user=${userId} reason=${gate.reason}`,
      );
      return;
    }
    if (!(await canManageRole(guild, roleObj))) {
      skippedRoles.push({ roleId: String(roleObj.id), roleName: roleObj.name, reason: "not_manageable", label });
      return;
    }
    if (dryRun) {
      skippedRoles.push({ roleId: String(roleObj.id), roleName: roleObj.name, reason: "dry_run", label });
      global.logger?.info?.(
        `[CUSTOM ROLE PURGE] dry-run would delete ${label} role=${roleObj.id} user=${userId}`,
      );
      return;
    }
    await roleObj.delete(`Custom role expired for user ${userId}`).catch(() => { });
  }

  if (role) {
    await tryDeleteCustomRole(role, "primary");
    role =
      guild.roles.cache.get(doc.roleId) ||
      (await getGuildRoleCached(guild, doc.roleId));
  }
  if (secondaryRole) {
    await tryDeleteCustomRole(secondaryRole, "secondary");
    secondaryRole =
      guild.roles.cache.get(doc.secondaryRoleId) ||
      (await getGuildRoleCached(guild, doc.secondaryRoleId));
  }
  const roleHandled = !role && !secondaryRole;

  let channelHandled = !voiceChannel;
  if (voiceChannel) {
    if (await canManageChannels(guild)) {
      await voiceChannel
        .delete(`Custom private voice expired for user ${userId}`)
        .catch(() => { });
      const stillExists =
        guild.channels.cache.get(voiceChannel.id) ||
        (await getGuildChannelCached(guild, voiceChannel.id));
      channelHandled = !stillExists;
    }
  }

  return { roleHandled, channelHandled, dryRun, skippedRoles };
}

async function processExpiredCustomRole(client?, doc?) {
  if (!client || !doc?.guildId || !doc?.userId) return false;
  const identityFilter = { guildId: String(doc.guildId), userId: String(doc.userId) };

  const guild = client.guilds.cache.get(doc.guildId) || (await getClientGuildCached(client, doc.guildId));
  if (!guild) {
    await CustomRole.deleteOne(identityFilter).catch(() => { });
    return true;
  }

  const { roleHandled, channelHandled } = await deleteDiscordCustomPerkArtifacts(guild, doc);

  if (roleHandled && channelHandled) {
    await CustomRole.deleteOne(identityFilter).catch(() => { });
    return true;
  }

  if (channelHandled && doc.customVocChannelId) {
    await CustomRole.updateOne(
      identityFilter,
      { $set: { customVocChannelId: null, customVocViceUserId: null } },
    ).catch(() => { });
  }

  return false;
}

async function runExpiredCustomRolesSweep(client?) {
  if (!client) return;
  const now = new Date();
  const rows = await execLean(
    CustomRole.find({ expiresAt: { $ne: null, $lte: now } }),
    [],
  ).catch(() => []);

  for (const row of rows) {
    await processExpiredCustomRole(client, row).catch(() => { });
  }

  const cutoff = new Date(Date.now() - CUSTOM_VOC_GRACE_MS);
  const staleVoc = await execLean(
    CustomRole.find({
      customVocChannelId: { $ne: null },
      customVocEligibilityLostAt: { $ne: null, $lte: cutoff },
    }),
    [],
  ).catch(() => []);
  for (const doc of staleVoc) {
    try {
      const guild = client.guilds.cache.get(doc.guildId) || (await getClientGuildCached(client, doc.guildId));
      if (!guild) {
        await CustomRole.updateOne({ guildId: doc.guildId, userId: doc.userId }, { $set: { customVocChannelId: null, customVocEligibilityLostAt: null } }).catch(() => {});
        continue;
      }
      const voiceChannel = await resolveVoiceChannel(guild, doc);
      if (voiceChannel && (await canManageChannels(guild))) {
        await voiceChannel.delete(`Custom private voice removed after ${CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS}d without eligibility for user ${doc.userId}`).catch(() => {});
      }
      await CustomRole.updateOne(
        { guildId: doc.guildId, userId: doc.userId },
        { $set: { customVocChannelId: null, customVocViceUserId: null, customVocEligibilityLostAt: null } },
      ).catch(() => {});
    } catch {
    }
  }

  const roleCutoff = new Date(Date.now() - CUSTOM_ROLE_GRACE_MS);
  const staleRole = await execLean(
    CustomRole.find({
      $or: [{ roleId: { $ne: null } }, { secondaryRoleId: { $ne: null } }],
      customRoleEligibilityLostAt: { $ne: null, $lte: roleCutoff },
    }),
    [],
  ).catch(() => []);
  for (const doc of staleRole) {
    await processExpiredCustomRole(client, doc).catch(() => {});
  }

  try {
    const mod = require("./customPerksDiscordCleanupQueueService") as typeof import("./customPerksDiscordCleanupQueueService");
    await mod.runCustomPerksDiscordCleanupQueueSweep(client);
  } catch {
  }
  try {
    const { runOrphanCustomRolesDiscordSweep } = require("./customRoleLeftMemberDiscordCleanupService") as typeof import("./customRoleLeftMemberDiscordCleanupService");
    const orphanSweepEnabled = String(process.env.VC_CUSTOM_ROLE_ORPHAN_SWEEP || "").trim() === "1";
    if (orphanSweepEnabled) {
      await runOrphanCustomRolesDiscordSweep(client, {
        deleteMongoIfNoBackup: true,
        dryRun: isCustomRolePurgeDryRun(),
      });
    }
  } catch (err) {
    global.logger?.warn?.("[CUSTOM ROLE EXPIRY] orphan left-member sweep failed:", err?.message || err);
  }
}

function startCustomRoleExpiryLoop(client?) {
  const dedicated = String(process.env.BOT_SCHEDULER_WORKER || "").trim() === "1";
  const external = String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) {
    return null;
  }
  if (!client) return null;
  if (expiryLoopHandle) return expiryLoopHandle;
  runExpiredCustomRolesSweep(client).catch((err?) =>
    global.logger?.warn?.("[CUSTOM ROLE EXPIRY] Recovery sweep on start failed:", err?.message || err),
  );
  expiryLoopHandle = setInterval(() => {
    runExpiredCustomRolesSweep(client).catch(() => {});
  }, CHECK_INTERVAL_MS);
  expiryLoopHandle.unref?.();
  return expiryLoopHandle;
}

export = {
  runExpiredCustomRolesSweep,
  startCustomRoleExpiryLoop,
  deleteDiscordCustomPerkArtifacts,
};
