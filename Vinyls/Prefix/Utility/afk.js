const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder, escapeMarkdown } = require("discord.js");
const { setAfk } = require("../../Services/Community/profileStore");
const { scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const AFK_MISSING_REASON_TTL_MS = 3000;

module.exports = {
  name: "afk",
  allowEmptyArgs: true,
  async execute(message, args) {
    await message.channel.sendTyping();
    const afkMessage = args.join(" ");
    const userId = message.author.id;
    const guildId = message.guild?.id;

    if (!args || !args.length) {
      const prompt = await safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Per favore scrivi un messaggio per impostare il tuo stato AFK.",
      );
      if (prompt) scheduleMessageDeletion(prompt, AFK_MISSING_REASON_TTL_MS);
      scheduleMessageDeletion(message, AFK_MISSING_REASON_TTL_MS);
      return;
    }
    if (!guildId) return;

    if (afkMessage.includes("@everyone") || afkMessage.includes("@here"))
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non puoi usare @everyone o @here nel messaggio.",
      );

    try {
      const member=await message.guild.members.fetch(userId).catch(() => null);
      if (!member)
        return safeMessageReply(
          message,
          "<:vegax:1443934876440068179> Errore: non posso trovare il tuo profilo.",
        );
      const originalName = member.nickname ?? null;
      const preferredBaseName = member.nickname || member.displayName || message.author.username;
      const baseName = String(preferredBaseName || "").replace(/^\s*\[AFK\]\s*/i, "").trim() || message.author.username;
      const afkNickname = `[AFK] ${baseName}`.slice(0, 32);
      await setAfk({
        guildId,
        userId,
        message: afkMessage,
        timestamp: Date.now(),
        originalName,
      });
      await member.setNickname(afkNickname).catch(() => {});
      safeMessageReply(
        message,
        `Ho impostato il tuo AFK: ${escapeMarkdown(afkMessage)}`,
      );
    } catch (error) {
      global.logger.error(error);
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
            )
            .setColor("Red"),
        ],
      });
    }
  },
};