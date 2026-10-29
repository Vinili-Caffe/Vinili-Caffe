const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { buildMusicListPayload } = require("../../Utils/Music/musicListUiRuntime") as typeof import("../../Utils/Music/musicListUiRuntime");

export = {
  name: "upcoming",
  description: "Anteprima dei prossimi brani in coda.",
  usage: "+upcoming",
  examples: ["+upcoming"],
  async execute(message?) {
    const payload = await buildMusicListPayload(
      "upcoming",
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
