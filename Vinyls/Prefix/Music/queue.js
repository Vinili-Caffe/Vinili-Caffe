const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { buildMusicListPayload } = require("../../Utils/Music/musicListUiRuntime");

module.exports = {
  name: "queue",
  description: "Mostra la coda di riproduzione.",
  usage: "+queue",
  examples: ["+queue"],
  async execute(message) {
    const payload = await buildMusicListPayload(
      "queue",
      message.client,
      message.guild,
      message.author.id,
      0,
    );
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { ...payload, allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};
