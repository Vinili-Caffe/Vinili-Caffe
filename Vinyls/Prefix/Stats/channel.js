const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const channelButton = require("../../Buttons").channel;

module.exports = {
  name: channelButton.name,
  allowEmptyArgs: true,
  
  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { channel, lookbackDays } = await channelButton.resolveChannelAndLookback(message, args);
    if (!channel || !message.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa: `+channel [ <#canale> | id | nome ] [1d | 7d | 14d | 21d | 30d]` — senza canale: statistiche del canale corrente.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const payload = await channelButton.buildChannelOverviewPayload(
      message.guild,
      channel,
      lookbackDays,
      "main",
      message.author?.id
    );
    await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
  },
};