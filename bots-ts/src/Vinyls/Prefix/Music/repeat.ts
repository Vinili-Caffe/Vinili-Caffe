const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { toggleRepeatOneGuild } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

export = {
  name: "repeat",
  allowEmptyArgs: true,
  subcommands: ["disable", "enable", "queue"],
  subcommandAliases: { off: "disable", on: "enable" },
  description:
    "Ripetizione traccia, ripetizione della coda, disattiva tutto.",
  usage: "+repeat [disable | enable | queue]",
  examples: ["+repeat", "+repeat disable", "+repeat enable", "+repeat queue"],
  async execute(message?, args?) {
    const kw = Array.isArray(args) && args.length ? String(args[0] || "").trim() : "";
    const result = await toggleRepeatOneGuild(message, kw);
    if (result.ok && result.mode === "queue") {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**Ripeterò tutta la coda** 🔄");
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }
    if (result.ok && result.mode === "on") {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**Ripeterò la traccia in corso** 🔂");
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }
    if (result.ok && result.mode === "off") {
      const offText = result.explicit
        ? "**Ripetizione disattivata**"
        : result.queueOff
          ? "**La ripetizione della coda è stata disattivata**"
          : "**La ripetizione singola è stata disattivata**";
      const embed = new EmbedBuilder().setColor(0x2ecc71).setDescription(offText);
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`**${result.message}**`);
    await safeMessageReply(message, {
      embeds: [err],
      allowedMentions: { repliedUser: false },
    }).catch(() => null);
  },
};