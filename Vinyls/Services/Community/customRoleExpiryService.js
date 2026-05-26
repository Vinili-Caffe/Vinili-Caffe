const { ChannelType, PermissionsBitField } = require("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const CUSTOM_VOICE_CATEGORY_ID = IDs.categories.categoryPrivate;
const CHECK_INTERVAL_MS = 60 * 1000;
let expiryLoopHandle = null;
const CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS = 7;
const CUSTOM_VOC_GRACE_MS = CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS * 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_GRACE_MS = CUSTOM_PERK_ELIGIBILITY_GRACE_DAYS * 24 * 60 * 60 * 1000;

async function execLean(queryOrValue, fallback = null) {
  if (queryOrValue && typeof queryOrValue.lean === "function") {
    return queryOrValue.lean();
  }
  const value = await queryOrValue;
  return value ?? fallback;
}

function findVoiceByRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return (
    guild.channels.cache.find((ch) => {
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

async function resolveVoiceChannel(guild, doc) {
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

async function canManageRole(guild, role) {
  if (!guild || !role) return false;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles))
    return false;
  return role.position < me.roles.highest.position;
}

async function canManageChannels(guild) {
  if (!guild) return false;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  return Boolean(
    me?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

/**
 * Elimina su Discord ruoli custom e canale voc collegati (nessuna scrittura su `ActivityUserProfile`).
 * @returns {{ roleHandled: boolean, channelHandled: boolean }}
 */
async function deleteDiscordCustomPerkArtifacts(guild, doc) {
  if (!guild || !doc?.userId) return { roleHandled: true, channelHandled: true };
  const userId = String(doc.userId);
  let role = doc.roleId
    ? guild.roles.cache.get(doc.roleId) || (await getGuildRoleCached(guild, doc.roleId))
    : null;
  let secondaryRole = doc.secondaryRoleId
    ? guild.roles.cache.get(doc.secondaryRoleId) || (await getGuildRoleCached(guild, doc.secondaryRoleId))
    : null;
  let voiceChannel = await resolveVoiceChannel(guild, doc);

  if (role) {
    if (await canManageRole(guild, role)) {
      await role
        .delete(`Custom role expired for user ${userId}`)
        .catch(() => { });
      role =
        guild.roles.cache.get(doc.roleId) ||
        (await getGuildRoleCached(guild, doc.roleId));
    }
  }
  if (secondaryRole) {
    if (await canManageRole(guild, secondaryRole)) {
      await secondaryRole
        .delete(`Custom secondary role expired for user ${userId}`)
        .catch(() => { });
      secondaryRole =
        guild.roles.cache.get(doc.secondaryRoleId) ||
        (await getGuildRoleCached(guild, doc.secondaryRoleId));
    }
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

  return { roleHandled, channelHandled };
}

async function processExpiredCustomRole(client, doc) {
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

async function runExpiredCustomRolesSweep(client) {
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
    const mod = require("./customPerksDiscordCleanupQueueService");
    await mod.runCustomPerksDiscordCleanupQueueSweep(client);
  } catch {
  }
}

function startCustomRoleExpiryLoop(client) {
  if (!client) return null;
  if (expiryLoopHandle) return expiryLoopHandle;
  runExpiredCustomRolesSweep(client).catch((err) => global.logger?.warn?.("[CUSTOM ROLE EXPIRY] Recovery sweep on start failed:", err?.message || err));
  expiryLoopHandle = setInterval(() => {
    runExpiredCustomRolesSweep(client).catch(() => { });
  }, CHECK_INTERVAL_MS);
  expiryLoopHandle.unref?.();
  return expiryLoopHandle;
}

module.exports = {
  runExpiredCustomRolesSweep,
  startCustomRoleExpiryLoop,
  deleteDiscordCustomPerkArtifacts,
};
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };
module.exports = { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop };