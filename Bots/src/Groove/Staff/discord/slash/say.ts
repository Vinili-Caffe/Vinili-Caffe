const { safeEditReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { SlashCommandBuilder } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const EPHEMERAL_FLAG = 1 << 6;
const MESSAGE_LINK_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;

function parseMessageLink(link?) {
  if (!link) return null;
  const match = link.match(MESSAGE_LINK_REGEX);
  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

async function resolveReplyTarget(interaction?, messageId?, messageLink?) {
  const linkData = parseMessageLink(messageLink);
  if (linkData) {
    if (interaction.guild?.id !== linkData.guildId) {
      return {
        error:
          `${E.VC_Cross} Il link non appartiene a questo server.`,
      };
    }

    const targetChannel = await getGuildChannelCached(interaction.guild, linkData.channelId);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return {
        error: `${E.VC_Cross} Canale non valido per rispondere.`,
      };
    }

    const targetMessage = await targetChannel.messages.fetch(linkData.messageId).catch(() => null);
    if (!targetMessage) {
      return { error: `${E.VC_Cross} Messaggio non trovato.` };
    }

    return { channel: targetChannel, replyTo: targetMessage };
  }

  if (messageId) {
    const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!targetMessage) {
      return {
        error:
          `${E.VC_Cross} Messaggio non trovato in questo canale.`,
      };
    }

    return { channel: interaction.channel, replyTo: targetMessage };
  }

  return { channel: interaction.channel, replyTo: null };
}

export = {
  category: "Dev",
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Quello che vorresti che il bot dicesse al posto tuo")
    .addStringOption((option?) =>
      option
        .setName("messaggio")
        .setDescription("Testo del messaggio")
        .setRequired(false),
    )
    .addAttachmentOption((option?) =>
      option
        .setName("allegato")
        .setDescription("File audio o altro allegato")
        .setRequired(false),
    )
    .addStringOption((option?) =>
      option
        .setName("message_id")
        .setDescription("ID del messaggio a cui rispondere")
        .setRequired(false),
    )
    .addStringOption((option?) =>
      option
        .setName("message_link")
        .setDescription("Link del messaggio a cui rispondere")
        .setRequired(false),
    ),

  async execute(interaction?) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    try {
      const rawText = interaction.options.getString("messaggio");
      const messageText = rawText != null ? String(rawText).trim() : "";
      const attachment = interaction.options.getAttachment("allegato");
      const messageId = interaction.options.getString("message_id")?.trim();
      const messageLink = interaction.options.getString("message_link")?.trim();

      if (!messageText && !attachment) {
        return safeEditReply(interaction, {
          content:
            `${E.VC_Cross} Indica almeno **messaggio** o **allegato**.`,
          flags: EPHEMERAL_FLAG,
        });
      }

      const target = await resolveReplyTarget(interaction, messageId, messageLink);
      if (target.error) {
        return safeEditReply(interaction, {
          content: target.error,
          flags: EPHEMERAL_FLAG,
        });
      }

      await safeEditReply(interaction, {
        content: `${E.VC_Verified} Messaggio inviato`,
        flags: EPHEMERAL_FLAG,
      });

      const payload: Record<string, any> = {};
      if (messageText) payload.content = messageText;
      if (attachment) payload.files = [attachment];
      if (target.replyTo) {
        payload.reply = {
          messageReference: target.replyTo.id,
          failIfNotExists: false,
        };
        payload.allowedMentions = { repliedUser: true };
      }

      await target.channel.send(payload).catch(() => null);
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        content:
          `${E.VC_Cross} Errore durante l'esecuzione del comando.`,
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};