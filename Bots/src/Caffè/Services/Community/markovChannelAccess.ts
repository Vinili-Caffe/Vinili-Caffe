const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

let VinylsIDs = null;
function getVinylsIds() {
  if (VinylsIDs) return VinylsIDs;
  try {
    VinylsIDs = require("../../../Vinili/Utils/Config/ids");
  } catch {
    VinylsIDs = {};
  }
  return VinylsIDs;
}

const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;

function stripVoiceSuffix(name?) {
  return String(name || "").replace(INDEX_SUFFIX_RE, "").trimEnd();
}

function getPublicVoiceHubChannelIds(client?) {
  const fromConfig = client?.config?.publicVoiceHubs?.channelIds;
  if (Array.isArray(fromConfig) && fromConfig.length) {
    return fromConfig.map((id?) => String(id || "").trim()).filter(Boolean);
  }
  const vinyls = getVinylsIds();
  const fromIds = Array.isArray(vinyls.publicVoiceHubChannelIds) ? vinyls.publicVoiceHubChannelIds : [];
  return fromIds.map((id?) => String(id || "").trim()).filter(Boolean);
}

function resolveMarkovVoiceParentChannel(channel?) {
  if (!channel) return null;
  if (typeof channel.isThread === "function" && channel.isThread() && channel.parent?.isVoiceBased?.()) {
    return channel.parent;
  }
  if (channel.type === ChannelType.GuildVoice || channel.isVoiceBased?.()) return channel;
  return null;
}

function isSpawnedPublicVoiceHubChannel(channel?, client = null) {
  const target = resolveMarkovVoiceParentChannel(channel);
  const id = String(target?.id || "");
  if (!id) return false;
  const hubIds = getPublicVoiceHubChannelIds(client || target?.guild?.client || channel?.guild?.client);
  if (hubIds.includes(id)) return false;
  if (!target || target.type !== ChannelType.GuildVoice) return false;
  if (!INDEX_SUFFIX_RE.test(String(target.name || ""))) return false;
  const parentId = String(target.parentId || "");
  const base = stripVoiceSuffix(target.name);
  const guild = target.guild || channel?.guild;
  if (!guild) return false;
  for (const hubId of hubIds) {
    const hub = guild.channels?.cache?.get(hubId);
    if (!hub || String(hub.parentId || "") !== parentId) continue;
    if (stripVoiceSuffix(hub.name) === base) return true;
  }
  return false;
}

const COLLECTIBLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

function getMarkovExcludedCategoryIds(config: Record<string, any> = {}) {
  const markov = config?.markov || {};
  const fromConfig = Array.isArray(markov.excludedCategoryIds) ? markov.excludedCategoryIds : [];
  const stanza = Array.isArray(IDs.stanzaDiscoveryExcludeParentIds) ? IDs.stanzaDiscoveryExcludeParentIds : [];
  const categoryStanze = String(getVinylsIds()?.categories?.categoryStanze || "").trim();
  const extraCategories = categoryStanze ? [categoryStanze] : [];
  return new Set([...fromConfig, ...stanza, ...extraCategories].map(String).filter(Boolean));
}

function getMarkovExcludedChannelIds(config: Record<string, any> = {}) {
  const markov = config?.markov || {};
  const fromConfig = Array.isArray(markov.excludedChannelIds) ? markov.excludedChannelIds : [];
  const vinyls = getVinylsIds();
  const poketwo = String(vinyls?.channels?.poketwo || (IDs.channels as any)?.poketwo || "").trim();
  const extras = poketwo ? [poketwo] : [];
  return new Set([...fromConfig, ...extras].map(String).filter(Boolean));
}

function resolveMemberRole(guild?) {
  if (!guild) return null;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && /^\d{5,30}$/.test(memberRoleId)) {
    return guild.roles.cache.get(memberRoleId) || null;
  }
  return guild.roles.everyone;
}

function hasMemberReadWrite(channel?, guild?) {
  if (!channel || !guild) return false;
  const memberRole = resolveMemberRole(guild);
  if (!memberRole) return false;
  const perms = channel.permissionsFor(memberRole);
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ViewChannel)
    && perms.has(PermissionsBitField.Flags.SendMessages);
}

function hasBotReadWrite(channel?, guild?) {
  if (!channel || !guild) return false;
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  if (!me) return false;
  if (me.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ViewChannel)
    && perms.has(PermissionsBitField.Flags.SendMessages);
}

function isMarkovCollectibleChannelType(channel?) {
  if (!channel) return false;
  return COLLECTIBLE_CHANNEL_TYPES.has(channel.type);
}

function isChannelCategoryExcluded(channel?, config: Record<string, any> = {}) {
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

function isMarkovEligibleChannel(channel?, guild?, config: Record<string, any> = {}, client = null) {
  if (!channel || !guild) return false;
  if (!isMarkovCollectibleChannelType(channel)) return false;
  if (isChannelCategoryExcluded(channel, config)) return false;
  if (isSpawnedPublicVoiceHubChannel(channel, client || guild.client || channel.client)) return false;
  if (!channel.viewable) return false;
  if (!hasBotReadWrite(channel, guild)) return false;
  return hasMemberReadWrite(channel, guild);
}

async function listMarkovEligibleChannels(guild?, config: Record<string, any> = {}, client = null) {
  if (!guild) return [];
  const resolvedClient = client || guild.client;
  await guild.channels.fetch().catch(() => null);
  const out = [];
  for (const channel of guild.channels.cache.values()) {
    if (!isMarkovEligibleChannel(channel, guild, config, resolvedClient)) continue;
    out.push(channel);
  }
  return out;
}

async function listMarkovEligibleThreads(guild?, config: Record<string, any> = {}, client = null) {
  if (!guild) return [];
  const resolvedClient = client || guild.client;
  const threads = [];
  const parents = await listMarkovEligibleChannels(guild, config, resolvedClient);
  for (const parent of parents) {
    if (typeof parent.threads?.fetchActive !== "function") continue;
    const active = await parent.threads.fetchActive().catch(() => null);
    const list = active?.threads ? [...active.threads.values()] : [];
    for (const thread of list) {
      if (!isMarkovEligibleChannel(thread, guild, config, resolvedClient)) continue;
      threads.push(thread);
    }
  }
  return threads;
}

function resolveMarkovOutputChannelId(client?) {
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

async function resolveMarkovOutputChannel(guild?, client?) {
  if (!guild || !client) return null;
  const channelId = resolveMarkovOutputChannelId(client);
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;
  if (!hasBotReadWrite(channel, guild)) return null;
  return channel;
}

export = {
  COLLECTIBLE_CHANNEL_TYPES,
  getMarkovExcludedCategoryIds,
  getMarkovExcludedChannelIds,
  hasMemberReadWrite,
  hasBotReadWrite,
  isMarkovCollectibleChannelType,
  isChannelCategoryExcluded,
  isSpawnedPublicVoiceHubChannel,
  isMarkovEligibleChannel,
  listMarkovEligibleChannels,
  listMarkovEligibleThreads,
  resolveMarkovOutputChannelId,
  resolveMarkovOutputChannel,
};