const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  createRepostFromMessage,
  isRepostDisabledInGuild,
  REPOST_DISABLED_MESSAGE,
} = require("../../Services/Community/repostService") as typeof import("../../Services/Community/repostService");

async function runRepostCommand(message?, targetMessage?) {
  try {
    if (message?.channel?.sendTyping) {
      await message.channel.sendTyping().catch(() => null);
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
      await safeMessageReply(message, {
        embeds: [
          result.privacyEmbed ||
            new EmbedBuilder()
              .setColor(color)
              .setDescription(`<:vegax:1443934876440068179> ${result.message || "Repost non riuscito."}`),
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }

    await safeMessageReply(message, {
      embeds: [result.ackEmbed],
      components: Array.isArray(result.ackComponents) ? result.ackComponents : [],
      allowedMentions: { users: [message.author.id], repliedUser: false },
    }).catch(() => null);
  } catch (err) {
    global.logger?.error?.("[repost] command failed:", err?.stack || err?.message || err);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription("<:vegax:1443934876440068179> Repost non riuscito. Riprova tra qualche secondo."),
      ],
      allowedMentions: { repliedUser: false },
    }).catch(() => null);
  }
}

export = {
  name: "repost",
  fireAndForget: true,
  allowEmptyArgs: true,
  async execute(message?) {
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

    setImmediate(() => {
      void runRepostCommand(message, targetMessage);
    });
    return null;
  },
};