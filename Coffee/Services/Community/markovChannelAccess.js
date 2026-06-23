const { ChannelType, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const COLLECTIBLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

function getMarkovExcludedCategoryIds(config = {}) {
  const markov = config?.markov || {};
  const fromConfig = Array.isArray(markov.excludedCategoryIds) ? markov.excludedCategoryIds : [];
  const stanza = Array.isArray(IDs.stanzaDiscoveryExcludeParentIds) ? IDs.stanzaDiscoveryExcludeParentIds : [];
  return new Set([...fromConfig, ...stanza].map(String).filter(Boolean));
}

function getMarkovExcludedChannelIds(config = {}) {
  const markov = config?.markov || {};
  const fromConfig = Array.isArray(markov.excludedChannelIds) ? markov.excludedChannelIds : [];
  return new Set(fromConfig.map(String).filter(Boolean));
}

function resolveMemberRole(guild) {
  if (!guild) return null;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && /^\d{5,30}$/.test(memberRoleId)) {
    return guild.roles.cache.get(memberRoleId) || null;
  }
  return guild.roles.everyone;
}

function hasMemberReadWrite(channel, guild) {
  if (!channel || !guild) return false;
  const memberRole = resolveMemberRole(guild);
  if (!memberRole) return false;
  const perms = channel.permissionsFor(memberRole);
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ViewChannel)
    && perms.has(PermissionsBitField.Flags.SendMessages);
}

function hasBotReadWrite(channel, guild) {
  if (!channel || !guild) return false;
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  if (!me) return false;
  if (me.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ViewChannel)
    && perms.has(PermissionsBitField.Flags.SendMessages);
}

function isMarkovCollectibleChannelType(channel) {
  if (!channel) return false;
  return COLLECTIBLE_CHANNEL_TYPES.has(channel.type);
}

function isChannelCategoryExcluded(channel, config = {}) {
  if (!channel) return true;
  const excludedCategories = getMarkovExcludedCategoryIds(config);
  const excludedChannels = getMarkovExcludedChannelIds(config);
  if (excludedChannels.has(String(channel.id))) return true;
  const parentId = String(channel.parentId || channel.parent?.id || "");
  if (parentId && excludedCategories.has(parentId)) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const threadParentId = String(channel.parentId || "");
    if (threadParentId && excludedChannels.has(threadParentId)) return true;
    const parent = channel.parent;
    const parentCategoryId = String(parent?.parentId || parent?.parent?.id || "");
    if (parentCategoryId && excludedCategories.has(parentCategoryId)) return true;
  }
  return false;
}

function isMarkovEligibleChannel(channel, guild, config = {}) {
  if (!channel || !guild) return false;
  if (!isMarkovCollectibleChannelType(channel)) return false;
  if (isChannelCategoryExcluded(channel, config)) return false;
  if (!channel.viewable) return false;
  if (!hasBotReadWrite(channel, guild)) return false;
  return hasMemberReadWrite(channel, guild);
}

async function listMarkovEligibleChannels(guild, config = {}) {
  if (!guild) return [];
  await guild.channels.fetch().catch(() => null);
  const out = [];
  for (const channel of guild.channels.cache.values()) {
    if (!isMarkovEligibleChannel(channel, guild, config)) continue;
    out.push(channel);
  }
  return out;
}

async function listMarkovEligibleThreads(guild, config = {}) {
  if (!guild) return [];
  const threads = [];
  const parents = await listMarkovEligibleChannels(guild, config);
  for (const parent of parents) {
    if (typeof parent.threads?.fetchActive !== "function") continue;
    const active = await parent.threads.fetchActive().catch(() => null);
    const list = active?.threads ? [...active.threads.values()] : [];
    for (const thread of list) {
      if (!isMarkovEligibleChannel(thread, guild, config)) continue;
      threads.push(thread);
    }
  }
  return threads;
}

function resolveMarkovOutputChannelId(client) {
  const markov = client?.config?.markov || {};
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const candidates = [
    auto.outputChannelId,
    client?.config?.channels?.chat,
    client?.config?.chatReminder?.channelId,
    IDs.channels?.chat,
  ];
  for (const raw of candidates) {
    const id = String(raw || "").trim();
    if (/^\d{5,30}$/.test(id)) return id;
  }
  return null;
}

async function resolveMarkovOutputChannel(guild, client) {
  if (!guild || !client) return null;
  const channelId = resolveMarkovOutputChannelId(client);
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;
  if (!hasBotReadWrite(channel, guild)) return null;
  return channel;
}

module.exports = {
  COLLECTIBLE_CHANNEL_TYPES,
  getMarkovExcludedCategoryIds,
  getMarkovExcludedChannelIds,
  hasMemberReadWrite,
  hasBotReadWrite,
  isMarkovCollectibleChannelType,
  isChannelCategoryExcluded,
  isMarkovEligibleChannel,
  listMarkovEligibleChannels,
  listMarkovEligibleThreads,
  resolveMarkovOutputChannelId,
  resolveMarkovOutputChannel,
};