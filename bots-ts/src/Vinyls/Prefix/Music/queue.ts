const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { buildMusicListPayload } = require("../../Utils/Music/musicListUiRuntime") as typeof import("../../Utils/Music/musicListUiRuntime");

export = {
  name: "queue",
  description: "Mostra la coda di riproduzione.",
  usage: "+queue",
  examples: ["+queue"],
  async execute(message?) {
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
