const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService");

module.exports = {
  name: "leave",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    const result = await leaveTtsGuild(message.guild.id, message.client);

    if (!result.ok && result.reason === "not_connected") {
      return safeMessageReply(
        message,
        "<a:VC_Cross:1482532424570376253> Il bot non è connesso a nessun canale vocale.",
      );
    }
    return safeMessageReply(
      message,
      "<a:VC_Verified:1482532479637127188> TTS disattivato.",
    );
  },
};