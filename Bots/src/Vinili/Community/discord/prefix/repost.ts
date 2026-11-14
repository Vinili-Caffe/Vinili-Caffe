const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  createRepostFromMessage,
  isRepostDisabledInGuild,
  REPOST_DISABLED_MESSAGE,
} = require("../../services/repostService") as typeof import("../../services/repostService");

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
              .setDescription(`${E.vegax} ${result.message || "Repost non riuscito."}`),
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }

    const { withBoardDraft } = require("../../utils/boardDrafts") as typeof import("../../utils/boardDrafts");
    await safeMessageReply(
      message,
      withBoardDraft({
        embeds: [result.ackEmbed],
        components: Array.isArray(result.ackComponents) ? result.ackComponents : [],
        allowedMentions: { users: [message.author.id], repliedUser: false },
      }),
    ).catch(() => null);
  } catch (err) {
    global.logger?.error?.("[repost] command failed:", err?.stack || err?.message || err);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(`${E.vegax} Repost non riuscito. Riprova tra qualche secondo.`),
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
            .setDescription(`${E.vegax} Questo comando funziona solo in un server.`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (isRepostDisabledInGuild(message.guild.id)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`${E.vegax} ${REPOST_DISABLED_MESSAGE}`),
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
              `${E.vegax} Rispondi a un messaggio con \`+repost\` per condividerlo sulla bacheca.`,
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
            .setDescription(`${E.vegax} Messaggio di riferimento non trovato.`),
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