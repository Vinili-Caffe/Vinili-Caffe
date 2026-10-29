const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { buildMusicListPayload } = require("../../Utils/Music/musicListUiRuntime") as typeof import("../../Utils/Music/musicListUiRuntime");

export = {
  name: "requested",
  description: "Mostra chi ha richiesto i brani in coda / sessione.",
  usage: "+requested",
  examples: ["+requested"],
  async execute(message?) {
    const payload = await buildMusicListPayload(
      "requested",
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
