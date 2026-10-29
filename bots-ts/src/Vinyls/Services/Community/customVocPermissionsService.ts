const { ChannelType, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isChannelInCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils") as typeof import("../../Utils/Community/customPrivateCategoryUtils");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const MEMBER_ROLE_ID = String(IDs?.roles?.Member || "").trim();
const MUTED_ROLE_ID = String(IDs?.roles?.Muted || "").trim();

const CUSTOM_VOC_MUTED_ROLE_PERMS = {
  ViewChannel: false,
  Connect: false,
  Speak: false,
  Stream: false,
  SendMessages: false,
  CreateInstantInvite: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
};

const CUSTOM_VOC_MEMBER_PERMS = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  UseVAD: true,
  Stream: true,
  SendMessages: true,
};

const CUSTOM_VOC_OWNER_BASE_PERMS = {
  ...CUSTOM_VOC_MEMBER_PERMS,
  MoveMembers: true,
};

const CUSTOM_VOC_OWNER_PRIVILEGED_PERMS = {
  ...CUSTOM_VOC_OWNER_BASE_PERMS,
  MuteMembers: true,
  DeafenMembers: true,
  ManageChannels: true,
};

const CUSTOM_VOC_EVERYONE_DENY = {
  ViewChannel: false,
  Connect: false,
  Speak: false,
  UseVAD: false,
  Stream: false,
  SendMessages: false,
};

const CUSTOM_VOC_MEMBER_ROLE_PERMS = {
  ViewChannel: true,
  Connect: false,
  Speak: false,
  UseVAD: false,
  Stream: false,
  SendMessages: false,
};

const CUSTOM_VOC_BOT_PERMS = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  ManageChannels: true,
  MoveMembers: true,
  SendMessages: true,
};

function isCustomPrivateVoiceChannel(channel?, guild = null) {
  if (!channel?.isVoiceBased?.()) return false;
    if (channel.type === ChannelType.GuildStageVoice) return false;
  return isChannelInCustomPrivateCategory(channel, guild || channel.guild);
}

function resolveCustomVocOwnerId(channel?, ownerByChannelId = null) {
  const channelId = String(channel?.id || "").trim();
  const mapped = ownerByChannelId?.get?.(channelId);
  if (mapped) return String(mapped);

  if (!channel?.permissionOverwrites?.cache) return null;
  const MoveMembers = PermissionsBitField.Flags.MoveMembers;
  const Connect = PermissionsBitField.Flags.Connect;
  const ManageChannels = PermissionsBitField.Flags.ManageChannels;
  const botId = String(channel.client?.user?.id || "");
  for (const ow of channel.permissionOverwrites.cache.values()) {
    if (ow.type !== OverwriteType.Member) continue;
    const uid = String(ow.id || "");
    if (!uid || uid === botId || !/^\d{17,22}$/.test(uid)) continue;
    if (!ow.allow?.has(Connect)) continue;
    if (ow.allow?.has(MoveMembers) || ow.allow?.has(ManageChannels)) return uid;
  }
  return null;
}

async function loadCustomVocGuildContext(guildId?) {
  const docs = await CustomRole.find({ guildId: String(guildId || "") }).lean().catch(() => []);
  const ownerByChannelId = new Map();
  const customRoleIds = new Set();
  for (const doc of Array.isArray(docs) ? docs : []) {
    const primary = String(doc?.roleId || "").trim();
    const secondary = String(doc?.secondaryRoleId || "").trim();
    if (primary) customRoleIds.add(primary);
    if (secondary) customRoleIds.add(secondary);
    const chId = String(doc?.customVocChannelId || "").trim();
    const userId = String(doc?.userId || "").trim();
    if (chId && userId) ownerByChannelId.set(chId, userId);
  }
  return { ownerByChannelId, customRoleIds };
}

function resolveOverwriteFlag(value?) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function overwriteAlreadyMatches(channel?, targetId?, permsObject?) {
  const existing = channel?.permissionOverwrites?.cache?.get?.(String(targetId || ""));
  if (!existing) return false;
  for (const [permName, desired] of Object.entries(permsObject || {})) {
    const flag = PermissionsBitField.Flags[permName];
    if (flag == null) continue;
    const want = resolveOverwriteFlag(desired);
    const allowed = Boolean(existing.allow?.has?.(flag));
    const denied = Boolean(existing.deny?.has?.(flag));
    if (want === true && !allowed) return false;
    if (want === false && !denied) return false;
    if (want == null && (allowed || denied)) return false;
  }
  return true;
}

function resolveOverwriteType(channel?, targetId?, explicitType = null) {
  if (explicitType === OverwriteType.Role || explicitType === OverwriteType.Member) return explicitType;
  const id = String(targetId || "").trim();
  const guild = channel?.guild;
  if (!id || !guild) return OverwriteType.Member;
  if (id === String(guild.id) || id === String(guild.roles?.everyone?.id || "")) return OverwriteType.Role;
  if (guild.roles?.cache?.has?.(id)) return OverwriteType.Role;
  const cached = channel.permissionOverwrites?.cache?.get?.(id);
  if (cached?.type === OverwriteType.Role || cached?.type === OverwriteType.Member) return cached.type;
  return OverwriteType.Member;
}

function isUnknownOverwriteError(err?) {
  const code = err?.code ?? err?.rawError?.code;
  return Number(code) === 10009 || /unknown overwrite/i.test(String(err?.message || ""));
}

async function applyOverwrite(channel?, targetId?, permsObject?, reason?, overwriteType = null) {
  const id = String(targetId || "").trim();
  if (!channel?.permissionOverwrites || !id) return false;
  const type = resolveOverwriteType(channel, id, overwriteType);
  try {
    if (overwriteAlreadyMatches(channel, id, permsObject)) return false;
    const extras = { reason, type };
    if (channel.permissionOverwrites.cache.has(id)) {
      try {
        await channel.permissionOverwrites.edit(id, permsObject, extras);
      } catch (err) {
                if (!isUnknownOverwriteError(err)) throw err;
        channel.permissionOverwrites.cache.delete(id);
        await channel.permissionOverwrites.create(id, permsObject, extras);
      }
    } else {
      try {
        await channel.permissionOverwrites.create(id, permsObject, extras);
      } catch (err) {
                if (isUnknownOverwriteError(err)) throw err;
        await channel.permissionOverwrites.edit(id, permsObject, extras);
      }
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[custom voc perms] overwrite failed:", id, err?.message || err);
    return false;
  }
}

async function collectGuildCustomRoleIds(guildId?) {
  const ctx = await loadCustomVocGuildContext(guildId);
  return ctx.customRoleIds;
}

async function stripLinkedCustomRolesFromChannel(channel?, guildCustomRoleIds = null) {
  if (!channel?.permissionOverwrites?.cache || !channel.guild) return 0;
  const customRoleIds =
    guildCustomRoleIds instanceof Set
      ? guildCustomRoleIds
      : new Set([...(await collectGuildCustomRoleIds(channel.guild.id))]);
  if (!customRoleIds.size) return 0;
  let removed = 0;
  for (const ow of [...channel.permissionOverwrites.cache.values()]) {
    if (ow.type !== OverwriteType.Role) continue;
    const rid = String(ow.id || "");
    if (!rid || !customRoleIds.has(rid)) continue;
    const ok = await channel.permissionOverwrites
      .delete(ow.id, "Custom voc: rimuovi override ruolo custom perk")
      .then(() => true)
      .catch(() => false);
    if (ok) removed += 1;
  }
  return removed;
}

async function ensureCustomVocChannelBaseline(channel?, ownerId?, botUserId?) {
  const guild = channel?.guild;
  if (!guild || !isCustomPrivateVoiceChannel(channel, guild)) return false;
  const owner = String(ownerId || resolveCustomVocOwnerId(channel) || "").trim();
  const botId = String(botUserId || channel.client?.user?.id || "").trim();
  if (!owner) return false;

  await applyOverwrite(channel, guild.roles.everyone.id, CUSTOM_VOC_EVERYONE_DENY, "Custom voc baseline", OverwriteType.Role);
  if (MEMBER_ROLE_ID) {
    await applyOverwrite(channel, MEMBER_ROLE_ID, CUSTOM_VOC_MEMBER_ROLE_PERMS, "Custom voc baseline", OverwriteType.Role);
  }
  if (MUTED_ROLE_ID) {
    await applyOverwrite(channel, MUTED_ROLE_ID, CUSTOM_VOC_MUTED_ROLE_PERMS, "Custom voc baseline muted", OverwriteType.Role);
  }
  if (botId) {
    await applyOverwrite(channel, botId, CUSTOM_VOC_BOT_PERMS, "Custom voc baseline", OverwriteType.Member);
  }
  await applyOverwrite(channel, owner, CUSTOM_VOC_OWNER_BASE_PERMS, "Custom voc baseline owner", OverwriteType.Member);
  const { customRoleIds } = await loadCustomVocGuildContext(channel.guild.id).catch(() => ({ customRoleIds: new Set() }));
  await stripLinkedCustomRolesFromChannel(channel, customRoleIds);
  await refreshGrantedMemberOverwrites(channel, owner, botId);
  return true;
}

async function refreshGrantedMemberOverwrites(channel?, ownerId?, botUserId?) {
  if (!channel?.permissionOverwrites?.cache) return;
  const owner = String(ownerId || "").trim();
  const botId = String(botUserId || channel.client?.user?.id || "").trim();
  const ManageChannels = PermissionsBitField.Flags.ManageChannels;
  for (const ow of channel.permissionOverwrites.cache.values()) {
    if (ow.type !== OverwriteType.Member) continue;
    const uid = String(ow.id || "");
    if (!uid || uid === owner || uid === botId) continue;
    if (ow.allow?.has(ManageChannels)) continue;
    if (!ow.allow?.has(PermissionsBitField.Flags.Connect)) continue;
    await applyOverwrite(channel, uid, CUSTOM_VOC_MEMBER_PERMS, "Custom voc: permessi membro invitato");
  }
}

async function applyCustomVocOwnerPrivilegedOverwrite(channel?, ownerId?, reason = "Custom voc: creatore in vocale") {
  return applyOverwrite(channel, ownerId, CUSTOM_VOC_OWNER_PRIVILEGED_PERMS, reason);
}

async function stripCustomVocOwnerPrivilegedOverwrite(channel?, ownerId?, reason = "Custom voc: creatore uscito dalla vocale") {
  return applyOverwrite(channel, ownerId, CUSTOM_VOC_OWNER_BASE_PERMS, reason);
}

function buildCustomVocCreateOverwrites(guild?, ownerId?, botUserId?) {
  const rows = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.UseVAD,
        PermissionsBitField.Flags.Stream,
        PermissionsBitField.Flags.SendMessages,
      ],
    },
    {
      id: ownerId,
      type: OverwriteType.Member,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.UseVAD,
        PermissionsBitField.Flags.Stream,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.MoveMembers,
      ],
    },
    {
      id: botUserId,
      type: OverwriteType.Member,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.MoveMembers,
        PermissionsBitField.Flags.SendMessages,
      ],
    },
  ];
  if (MEMBER_ROLE_ID) {
    rows.splice(1, 0, {
      id: MEMBER_ROLE_ID,
      allow: [PermissionsBitField.Flags.ViewChannel],
      deny: [
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.UseVAD,
        PermissionsBitField.Flags.Stream,
        PermissionsBitField.Flags.SendMessages,
      ],
    });
  }
  if (MUTED_ROLE_ID) {
    rows.push({
      id: MUTED_ROLE_ID,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.Stream,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
        PermissionsBitField.Flags.SendMessagesInThreads,
      ],
    });
  }
  return rows;
}

async function syncCustomVocChannelForOwner(guild?, ownerId?) {
  const gid = String(guild?.id || "");
  const uid = String(ownerId || "").trim();
  if (!guild || !gid || !uid) return;
  const doc = await CustomRole.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const channelId = String(doc?.customVocChannelId || "").trim();
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isVoiceBased?.() || !isCustomPrivateVoiceChannel(channel, guild)) {
    await CustomRole.updateOne(
      { guildId: gid, userId: uid },
      { $set: { customVocChannelId: null } },
    ).catch(() => {});
    return;
  }
  await ensureCustomVocChannelBaseline(channel, uid, guild.client?.user?.id);
  const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  if (member?.voice?.channelId && String(member.voice.channelId) === String(channel.id)) {
    await applyCustomVocOwnerPrivilegedOverwrite(channel, uid, "Custom voc: creatore già in vocale");
  }
}

async function collectCustomPrivateVoiceChannels(guild?) {
  if (!guild?.id) return [];
  await guild.channels.fetch().catch(() => {});
  const { ownerByChannelId } = await loadCustomVocGuildContext(guild.id);
  const byId = new Map();
  for (const channel of guild.channels.cache.values()) {
    if (isCustomPrivateVoiceChannel(channel, guild)) byId.set(channel.id, channel);
  }
  for (const channelId of ownerByChannelId.keys()) {
    if (byId.has(channelId)) continue;
    const channel =
      guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    if (channel?.isVoiceBased?.()) byId.set(channel.id, channel);
  }
  return [...byId.values()];
}

async function repairGuildCustomVocPermissions(guild?) {
  if (!guild?.id) return { channels: 0, rolesStripped: 0 };
  const { ownerByChannelId, customRoleIds } = await loadCustomVocGuildContext(guild.id);
  const voiceChannels = await collectCustomPrivateVoiceChannels(guild);
  let channels = 0;
  let rolesStripped = 0;
  for (const channel of voiceChannels) {
    channels += 1;
    rolesStripped += await stripLinkedCustomRolesFromChannel(channel, customRoleIds);
    const ownerId = resolveCustomVocOwnerId(channel, ownerByChannelId);
    if (ownerId) {
      await ensureCustomVocChannelBaseline(channel, ownerId, guild.client?.user?.id);
      const member = guild.members.cache.get(ownerId) || (await guild.members.fetch(ownerId).catch(() => null));
      if (member?.voice?.channelId && String(member.voice.channelId) === String(channel.id)) {
        await applyCustomVocOwnerPrivilegedOverwrite(channel, ownerId, "Custom voc repair: creatore in vocale");
      }
    }
  }
  return { channels, rolesStripped };
}

async function repairCustomVocPermissionsOnStartup(client?) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return;
  try {
    const result = await repairGuildCustomVocPermissions(guild);
    if (result.rolesStripped > 0) {
      global.logger?.info?.(
        `[CUSTOM VOC PERMS] stripped ${result.rolesStripped} custom role overwrite(s) on ${result.channels} channel(s)`,
      );
    }
  } catch (err) {
    global.logger?.error?.("[CUSTOM VOC PERMS] repair failed:", err?.message || err);
    throw err;
  }
}

async function handleCustomVocVoiceStateUpdate(oldState?, newState?) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;
  const userId = String(newState.id || oldState.id || "");
  if (!userId || newState.member?.user?.bot || oldState.member?.user?.bot) return;

  const { ownerByChannelId, customRoleIds } = await loadCustomVocGuildContext(guild.id).catch(() => ({
    ownerByChannelId: new Map(),
    customRoleIds: new Set(),
  }));

  const oldChannelId = oldState.channelId ? String(oldState.channelId) : "";
  const newChannelId = newState.channelId ? String(newState.channelId) : "";
  if (oldChannelId === newChannelId) return;

  if (oldChannelId) {
    const oldChannel = guild.channels.cache.get(oldChannelId) || (await guild.channels.fetch(oldChannelId).catch(() => null));
    if (isCustomPrivateVoiceChannel(oldChannel, guild)) {
      const ownerId = resolveCustomVocOwnerId(oldChannel, ownerByChannelId);
      if (ownerId && ownerId === userId) {
        await stripCustomVocOwnerPrivilegedOverwrite(oldChannel, ownerId);
      }
    }
  }

  if (newChannelId) {
    const newChannel = guild.channels.cache.get(newChannelId) || (await guild.channels.fetch(newChannelId).catch(() => null));
    if (isCustomPrivateVoiceChannel(newChannel, guild)) {
      await stripLinkedCustomRolesFromChannel(newChannel, customRoleIds);
      const ownerId = resolveCustomVocOwnerId(newChannel, ownerByChannelId);
      if (ownerId && ownerId === userId) {
        await applyCustomVocOwnerPrivilegedOverwrite(newChannel, ownerId);
      }
    }
  }
}

export = {
  CUSTOM_VOC_MEMBER_PERMS,
  CUSTOM_VOC_OWNER_BASE_PERMS,
  CUSTOM_VOC_OWNER_PRIVILEGED_PERMS,
  isCustomPrivateVoiceChannel,
  resolveCustomVocOwnerId,
  buildCustomVocCreateOverwrites,
  ensureCustomVocChannelBaseline,
  applyOverwrite,
  applyCustomVocOwnerPrivilegedOverwrite,
  stripCustomVocOwnerPrivilegedOverwrite,
  stripLinkedCustomRolesFromChannel,
  syncCustomVocChannelForOwner,
  repairGuildCustomVocPermissions,
  repairCustomVocPermissionsOnStartup,
  handleCustomVocVoiceStateUpdate,
};
