const assert = require("assert");
const {
  VOICE_EXP_HALF_MULTIPLIER,
  computeVoiceExpFromSeconds,
  isHalfVoiceExpChannel,
} = require("../Vinyls/Utils/Community/voiceExpChannelUtils");
const { ChannelType } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");

function run() {
  assert.strictEqual(computeVoiceExpFromSeconds(60, 1, 5), 5, "full minute");
  assert.strictEqual(computeVoiceExpFromSeconds(60, VOICE_EXP_HALF_MULTIPLIER, 5), 2, "half minute");
  assert.strictEqual(computeVoiceExpFromSeconds(120, VOICE_EXP_HALF_MULTIPLIER, 5), 5, "two half minutes = one full");

  const privateParent = String(IDs.categories?.categoryPrivate || "");
  const privateChannel = {
    id: "999",
    type: ChannelType.GuildVoice,
    parentId: privateParent,
    name: "privata - test",
    guild: { client: null, channels: { cache: new Map() } },
  };
  assert.strictEqual(isHalfVoiceExpChannel(privateChannel), true, "private category is half");

  const loungeChannel = {
    id: "888",
    type: ChannelType.GuildVoice,
    parentId: String(IDs.categories?.categoryPublics || ""),
    name: "Lounge",
    guild: { client: { config: {} }, channels: { cache: new Map() } },
  };
  assert.strictEqual(isHalfVoiceExpChannel(loungeChannel, loungeChannel.guild.client), false, "lounge is full");
}

module.exports = run;
if (require.main === module) {
  run();
  console.log("VOICE_EXP_CHANNEL_UTILS_TEST_OK");
}