const assert = require("assert");
const { ChannelType } = require("discord.js");
const { isVoiceBasedCommandChannel } = require("../shared/voice/voiceCommandChannelAccess");

assert(
  isVoiceBasedCommandChannel({ type: ChannelType.GuildVoice, isVoiceBased: () => true, isThread: () => false }),
  "GuildVoice deve essere canale comando vocale",
);
assert(
  isVoiceBasedCommandChannel({
    isThread: () => true,
    parent: { isVoiceBased: () => true },
  }),
  "thread figlia di vocale deve essere canale comando vocale",
);
assert(
  !isVoiceBasedCommandChannel({ type: ChannelType.GuildText, isVoiceBased: () => false, isThread: () => false }),
  "canale testo normale non deve passare il check vocale",
);

console.log("VOICE_COMMAND_CHANNEL_ACCESS_TEST_OK");