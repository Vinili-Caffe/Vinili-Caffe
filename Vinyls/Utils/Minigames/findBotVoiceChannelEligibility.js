const IDs = require("../Config/ids");
const {
  isPublicVoiceHubId,
  isSpawnedHubChannel,
} = require("../../Services/Voice/publicVoiceHubService");

const STANZA_LOBBY_VOICE_ID = String(IDs.channels?.stanzaLobbyVoice || "").trim();

function isCoffeeManagedStanzaChannel(channel) {
  if (!channel) return false;
  if (/Stanza di\s+/i.test(String(channel.name || ""))) return true;
  try {
    const coffee = require("../../../Coffee/Services/Voice/stanzaVoiceRoomsService");
    if (typeof coffee.isManagedStanzaRoomChannel === "function") {
      return Boolean(coffee.isManagedStanzaRoomChannel(channel, String(channel.parentId || "")));
    }
  } catch (_) {}
  return false;
}

function buildDefaultFindBotVoiceExcludedChannelIds(client) {
  const out = new Set();
  const push = (id) => {
    const value = String(id || "").trim();
    if (value) out.add(value);
  };
  for (const id of IDs.publicVoiceHubChannelIds || []) push(id);
  push(STANZA_LOBBY_VOICE_ID);
  const fromCfg = client?.config?.minigames?.findBotVoice?.excludedChannelIds;
  if (Array.isArray(fromCfg)) {
    for (const id of fromCfg) push(id);
  }
  return [...out];
}

function mergeFindBotVoiceExcludedChannelIds(client, extraIds = null) {
  const out = new Set(buildDefaultFindBotVoiceExcludedChannelIds(client));
  if (Array.isArray(extraIds)) {
    for (const id of extraIds) {
      const value = String(id || "").trim();
      if (value) out.add(value);
    }
  }
  return [...out];
}

function isVoiceChannelEligibleForFindBotMinigame(channel, client, excludedChannelIds = null) {
  if (!channel?.isVoiceBased?.()) return false;
  const id = String(channel.id || "").trim();
  if (!id) return false;

  const excluded = new Set(mergeFindBotVoiceExcludedChannelIds(client, excludedChannelIds));
  if (excluded.has(id)) return false;
  if (isPublicVoiceHubId(id, client)) return false;
  if (isSpawnedHubChannel(channel, client)) return false;
  if (id === STANZA_LOBBY_VOICE_ID) return false;
  if (isCoffeeManagedStanzaChannel(channel)) return false;

  return true;
}

module.exports = {
  STANZA_LOBBY_VOICE_ID,
  buildDefaultFindBotVoiceExcludedChannelIds,
  mergeFindBotVoiceExcludedChannelIds,
  isVoiceChannelEligibleForFindBotMinigame,
  __test: {
    STANZA_LOBBY_VOICE_ID,
    mergeFindBotVoiceExcludedChannelIds,
    isVoiceChannelEligibleForFindBotMinigame,
  },
};
