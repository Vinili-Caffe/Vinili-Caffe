const { ChannelType } = require("discord.js");
const IDs = require("../Config/ids");
const {
  isChannelInCustomPrivateCategory,
  getCustomPrivateCategoryIdSet,
} = require("../Community/customPrivateCategoryUtils");

function readStreamVoiceChannelIdsFromClient(client) {
  const ids = new Set();
  const cfg = client?.config || {};
  for (const key of ["kickLiveAlerts", "twitchLiveAlerts"]) {
    const raw = String(cfg?.[key]?.streamVoiceChannelId || "").trim();
    if (/^\d{16,22}$/.test(raw)) ids.add(raw);
  }
  return ids;
}

function getStaticAutomodExemptChannelIds(client = null) {
  const ids = new Set();
  const streamerChat = String(IDs.channels?.streamerChat || "").trim();
  if (/^\d{16,22}$/.test(streamerChat)) ids.add(streamerChat);
  for (const id of readStreamVoiceChannelIdsFromClient(client)) ids.add(id);
  return ids;
}

function getAutomodExemptCategoryIds(guild) {
  const ids = new Set();
  const stanze = String(IDs.categories?.categoryStanze || "").trim();
  if (/^\d{16,22}$/.test(stanze)) ids.add(stanze);
  if (guild) {
    for (const id of getCustomPrivateCategoryIdSet(guild)) {
      if (/^\d{16,22}$/.test(String(id))) ids.add(String(id));
    }
  } else {
    const priv = String(IDs.categories?.categoryPrivate || "").trim();
    if (/^\d{16,22}$/.test(priv)) ids.add(priv);
  }
  return ids;
}

function isUnderAutomodExemptCategory(channel, guild) {
  if (!channel) return false;
  const cats = getAutomodExemptCategoryIds(guild);
  if (!cats.size) return false;
  const parentId = String(channel.parentId || "");
  if (parentId && cats.has(parentId)) return true;
  const chId = String(channel.id || "");
  if (cats.has(chId) && channel.type === ChannelType.GuildCategory) return true;
  return false;
}

function isStanzaAutomodExemptChannel(channel, guild) {
  if (!channel || !guild) return false;
  try {
    const { isAutomodExemptStanzaChannel } = require("../../Services/Voice/stanzaVoiceRoomsService");
    if (typeof isAutomodExemptStanzaChannel === "function") {
      return isAutomodExemptStanzaChannel(channel, guild);
    }
  } catch (_) {}
  return false;
}

function isAutomodExemptChannel(channel, guild, client = null) {
  if (!channel) return false;
  const chId = String(channel.id || "");
  const parentId = String(channel.parentId || "");
  const staticIds = getStaticAutomodExemptChannelIds(client);
  if (staticIds.has(chId) || staticIds.has(parentId)) return true;
  if (isUnderAutomodExemptCategory(channel, guild)) return true;
  if (guild && isChannelInCustomPrivateCategory(channel, guild)) return true;
  if (isStanzaAutomodExemptChannel(channel, guild)) return true;
  return false;
}

function collectDiscordAutomodExemptChannelIds(guild, client = null) {
  const ids = new Set();
  for (const id of getStaticAutomodExemptChannelIds(client)) ids.add(id);
  for (const id of getAutomodExemptCategoryIds(guild)) ids.add(id);
  if (guild?.channels?.cache) {
    for (const ch of guild.channels.cache.values()) {
      if (isChannelInCustomPrivateCategory(ch, guild)) ids.add(String(ch.id));
    }
  }
  return [...ids].filter((id) => /^\d{16,22}$/.test(id));
}

module.exports = {
  getStaticAutomodExemptChannelIds,
  getAutomodExemptCategoryIds,
  isAutomodExemptChannel,
  collectDiscordAutomodExemptChannelIds,
};
