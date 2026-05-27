const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const {
  createRepostFromMessage,
  isRepostDisabledInGuild,
  REPOST_DISABLED_MESSAGE,
} = require("../../Services/Community/repostService");

module.exports = {
  name: "repost",
  allowEmptyArgs: true,
  async execute(message) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando funziona solo in un server."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (isRepostDisabledInGuild(message.guild.id)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${REPOST_DISABLED_MESSAGE}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const refId = message.reference?.messageId;
    if (!refId) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Rispondi a un messaggio con `+repost` per condividerlo sulla bacheca.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const targetMessage = await message.channel.messages.fetch(refId).catch(() => null);
    if (!targetMessage) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Messaggio di riferimento non trovato."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const result = await createRepostFromMessage({
      guild: message.guild,
      reposter: message.member || message.author,
      targetMessage,
      client: message.client,
      replyChannel: message.channel,
    });

    if (!result.ok) {
      const color = result.privacyBlocked ? "#ed4245" : "Red";
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setDescription(`<:vegax:1443934876440068179> ${result.message || "Repost non riuscito."}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    return safeMessageReply(message, {
      embeds: [result.ackEmbed],
      components: result.components || [],
      allowedMentions: { users: [message.author.id], repliedUser: false },
    });
  },
};