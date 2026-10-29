const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { previousGuildTrack } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

export = {
  name: "previous",
  description: "Torna al brano riprodotto prima di quello attuale.",
  usage: "+previous",
  examples: ["+previous"],
  async execute(message?) {
    const result: any = await previousGuildTrack(message);
    const spotifyEmoji = "<:VC_Spotify:1482527369477492797>";
    const embedDescRaw =
      typeof result.embedDescription === "string" && result.embedDescription.trim()
        ? result.embedDescription.trim()
        : typeof result.embedBody === "string" && result.embedBody.trim()
          ? result.embedBody.trim()
          : "";
    const okDesc = result.ok
      ? embedDescRaw
        ? `${spotifyEmoji} ${embedDescRaw}`
        : `${spotifyEmoji} ${result.message}`
      : null;
    const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xff0000);
    if (result.ok && (result.embedTitle || embedDescRaw)) {
      embed.setTitle(String(result.embedTitle || "Now playing").slice(0, 256));
      embed.setDescription(okDesc);
    } else {
      embed.setDescription(result.ok ? okDesc : `**${result.message}**`);
    }
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { embeds: [embed], allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};