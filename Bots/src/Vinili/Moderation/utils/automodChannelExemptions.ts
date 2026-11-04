const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  isChannelInCustomPrivateCategory,
  getCustomPrivateCategoryIdSet,
} = require("../../Community/utils/customPrivateCategoryUtils") as typeof import("../../Community/utils/customPrivateCategoryUtils");

function readStreamVoiceChannelIdsFromClient(client?) {
  const ids = new Set();
  const cfg = client?.config || {};
  for (const key of ["twitchLiveAlerts"]) {
    const raw = String(cfg?.[key]?.streamVoiceChannelId || "").trim();
    if (/^\d{16,22}$/.test(raw)) ids.add(raw);
  }
  return ids;
}

function getStaticAutomodExemptChannelIds(client = null) {
  const ids = new Set();
  const streamerChat = String(IDs.channels?.streamerChat || "").trim();
  if (/^\d{16,22}$/.test(streamerChat)) ids.add(streamerChat);
  const streamerStage = String(IDs.channels?.streamerStage || "").trim();
  if (/^\d{16,22}$/.test(streamerStage)) ids.add(streamerStage);
  const automodExemptExtra = String(IDs.channels?.automodExemptExtra || "").trim();
  if (/^\d{16,22}$/.test(automodExemptExtra)) ids.add(automodExemptExtra);
  for (const id of readStreamVoiceChannelIdsFromClient(client)) ids.add(id);
  return ids;
}

function getStanzaAutomodExemptCategoryIds() {
  const ids = new Set();
  const legacyStanze = String(IDs.categories?.categoryStanze || "").trim();
  const activeStanze = String(IDs.categories?.categoryPublics || "").trim();
  const limitate = String(IDs.categories?.categoryLimitate || "").trim();
  if (/^\d{16,22}$/.test(legacyStanze)) ids.add(legacyStanze);
  if (/^\d{16,22}$/.test(activeStanze)) ids.add(activeStanze);
  if (/^\d{16,22}$/.test(limitate)) ids.add(limitate);
  return ids;
}

function getAutomodExemptCategoryIds(guild?) {
  const ids = new Set(getStanzaAutomodExemptCategoryIds());
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

function isUnderAutomodExemptCategory(channel?, guild?) {
  if (!channel) return false;
  const cats = getAutomodExemptCategoryIds(guild);
  if (!cats.size) return false;
  const parentId = String(channel.parentId || "");
  if (parentId && cats.has(parentId)) return true;
  const chId = String(channel.id || "");
  if (cats.has(chId) && channel.type === ChannelType.GuildCategory) return true;
  return false;
}

function isStanzaAutomodExemptChannel(channel?, guild?) {
  if (!channel || !guild) return false;
  const lobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  const chId = String(channel.id || "");
  if (lobbyId && chId === lobbyId) return true;
  if (/Stanza di\s+/i.test(String(channel.name || ""))) return true;
  try {
    const vinili = require("../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../Voice/services/stanzaVoiceRoomsService");
    if (typeof vinili.isManagedStanzaRoomChannel === "function") {
      return Boolean(vinili.isManagedStanzaRoomChannel(channel, String(channel.parentId || "")));
    }
  } catch (_) {}
  return false;
}

function isLimitateAutomodExemptChannel(channel?, guild?, client = null) {
  if (!channel || !guild) return false;
  const limitate = String(IDs.categories?.categoryLimitate || "").trim();
  const chId = String(channel.id || "");
  const parentId = String(channel.parentId || "");
  if (limitate && (chId === limitate || parentId === limitate)) return true;
  try {
    const hubClient = client || guild.client || null;
    const {
      isPublicVoiceHubId,
      isSpawnedHubChannel,
    } = require("../../Community/services/publicVoiceHubService") as typeof import("../../Community/services/publicVoiceHubService");
    if (typeof isPublicVoiceHubId === "function" && isPublicVoiceHubId(chId, hubClient)) return true;
    if (typeof isSpawnedHubChannel === "function" && isSpawnedHubChannel(channel, hubClient)) return true;
  } catch (_) {}
  return false;
}

function isAutomodExemptChannel(channel?, guild?, client = null) {
  if (!channel) return false;
  const chId = String(channel.id || "");
  const parentId = String(channel.parentId || "");
  const staticIds = getStaticAutomodExemptChannelIds(client);
  if (staticIds.has(chId) || staticIds.has(parentId)) return true;
  if (isUnderAutomodExemptCategory(channel, guild)) return true;
  if (guild && isChannelInCustomPrivateCategory(channel, guild)) return true;
  if (isStanzaAutomodExemptChannel(channel, guild)) return true;
  if (isLimitateAutomodExemptChannel(channel, guild, client)) return true;
  return false;
}

function collectDiscordAutomodExemptChannelIds(guild?, client = null) {
  const ids = new Set();
  const cache = guild?.channels?.cache;
  const keep = (id?) => {
    const key = String(id || "").trim();
    if (!/^\d{16,22}$/.test(key)) return;
    if (cache && !cache.has(key)) return;
    ids.add(key);
  };
  for (const id of getStaticAutomodExemptChannelIds(client)) keep(id);
  for (const id of getAutomodExemptCategoryIds(guild)) keep(id);
  if (cache) {
    for (const ch of cache.values()) {
      if (typeof ch?.isThread === "function" && ch.isThread()) continue;
      if (isChannelInCustomPrivateCategory(ch, guild)) ids.add(String(ch.id));
      if (isStanzaAutomodExemptChannel(ch, guild)) ids.add(String(ch.id));
      if (isLimitateAutomodExemptChannel(ch, guild, client)) ids.add(String(ch.id));
    }
  }
  return [...ids].filter((id?) => /^\d{16,22}$/.test((id as any)));
}

export = {
  getAutomodExemptCategoryIds,
  isAutomodExemptChannel,
  collectDiscordAutomodExemptChannelIds,
};
