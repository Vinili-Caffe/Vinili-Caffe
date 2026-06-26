const assert = require("assert");
const { ChannelType } = require("discord.js");
const {
  getMarkovExcludedCategoryIds,
  isSpawnedPublicVoiceHubChannel,
  isMarkovEligibleChannel,
} = require("../Coffee/Services/Community/markovChannelAccess");

function voice(id, name, parentId, guild) {
  return {
    id,
    name,
    parentId,
    type: ChannelType.GuildVoice,
    guild,
    isVoiceBased: () => true,
    isThread: () => false,
    viewable: true,
    permissionsFor: () => ({
      has: () => true,
    }),
  };
}

function guildWithChannels(channels) {
  const cache = new Map(channels.map((ch) => [String(ch.id), ch]));
  return {
    client: { config: {} },
    roles: { everyone: { id: "1" }, cache: new Map() },
    members: { me: { permissions: { has: () => true } }, cache: new Map() },
    channels: { cache },
  };
}

const vinylsIds = require("../Vinyls/Utils/Config/ids");
const categoryStanze = String(vinylsIds.categories?.categoryStanze || "");
const categoryPrivate = String(vinylsIds.categories?.categoryPrivate || "");
const hubDuo = String(vinylsIds.channels?.vocaleDuo1 || "");
const hubTrio = String(vinylsIds.channels?.vocaleTrio1 || "");
const parentCat = "999";

assert(categoryStanze, "categoryStanze mancante in ids");
assert(categoryPrivate, "categoryPrivate mancante in ids");

const excluded = getMarkovExcludedCategoryIds({});
assert(excluded.has(categoryStanze), "categoryStanze deve essere esclusa da MARKOV");
assert(excluded.has(categoryPrivate), "categoryPrivate deve essere esclusa da MARKOV");

const guild = guildWithChannels([
  voice(hubDuo, "༄ 🍧 ‧ duo", parentCat, null),
  voice(hubTrio, "༄ 🍉 ‧ trio", parentCat, null),
  voice("spawn-1", "༄ 🍧 ‧ duo⁰¹", parentCat, null),
  voice("stanza-1", "Stanza test", categoryStanze, null),
  voice("priv-1", "Voc privata", categoryPrivate, null),
]);
for (const ch of guild.channels.cache.values()) {
  ch.guild = guild;
}

assert(
  isSpawnedPublicVoiceHubChannel(guild.channels.cache.get("spawn-1"), { config: {} }),
  "spawn duo temporanea deve essere esclusa",
);
assert(
  !isSpawnedPublicVoiceHubChannel(guild.channels.cache.get(hubDuo), { config: {} }),
  "hub duo statico non deve essere trattato come spawn temporaneo",
);
assert(
  !isMarkovEligibleChannel(guild.channels.cache.get("stanza-1"), guild, {}),
  "chat stanza in categoryStanze non deve essere eleggibile",
);
assert(
  !isMarkovEligibleChannel(guild.channels.cache.get("priv-1"), guild, {}),
  "voc privata in categoryPrivate non deve essere eleggibile",
);

console.log("MARKOV_CHANNEL_ACCESS_TEST_OK");