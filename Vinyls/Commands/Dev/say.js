const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { SlashCommandBuilder } = require("discord.js");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const EPHEMERAL_FLAG = 1 << 6;
const DISCORD_CONTENT_MAX = 2000;
const MESSAGE_LINK_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;

function parseMessageLink(link) {
  if (!link) return null;
  const match = link.match(MESSAGE_LINK_REGEX);
  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

/** Spezza il testo in chunk ≤ 2000 (limite Discord), preferendo tagli su spazi. */
function splitDiscordContent(text, max = DISCORD_CONTENT_MAX) {
  const raw = String(text || "");
  if (!raw) return [];
  if (raw.length <= max) return [raw];
  const chunks = [];
  let rest = raw;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.6)) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function resolveReplyTarget(interaction, messageId, messageLink) {
  const linkData = parseMessageLink(messageLink);
  if (linkData) {
    if (interaction.guild?.id !== linkData.guildId) {
      return {
        error:
          "<:vegax:1443934876440068179> Il link non appartiene a questo server.",
      };
    }

    const targetChannel = await getGuildChannelCached(interaction.guild, linkData.channelId);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return {
        error: "<:vegax:1443934876440068179> Canale non valido per rispondere.",
      };
    }

    const targetMessage = await targetChannel.messages.fetch(linkData.messageId).catch(() => null);
    if (!targetMessage) {
      return { error: "<:vegax:1443934876440068179> Messaggio non trovato." };
    }

    return { channel: targetChannel, replyTo: targetMessage };
  }

  if (messageId) {
    const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!targetMessage) {
      return {
        error:
          "<:vegax:1443934876440068179> Messaggio non trovato in questo canale.",
      };
    }

    return { channel: interaction.channel, replyTo: targetMessage };
  }

  return { channel: interaction.channel, replyTo: null };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Quello che vorresti che il bot dicesse al posto tuo")
    .addStringOption((option) =>
      option
        .setName("messaggio")
        .setDescription("Testo del messaggio (opzionale se allegi un file)")
        .setRequired(false),
    )
    .addAttachmentOption((option) =>
      option
        .setName("allegato")
        .setDescription("File audio o altro allegato (opzionale se scrivi un messaggio)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("ID del messaggio a cui rispondere (stesso canale)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("message_link")
        .setDescription("Link del messaggio a cui rispondere")
        .setRequired(false),
    ),

  async execute(interaction) {
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
            "<:vegax:1443934876440068179> Indica almeno **messaggio** o **allegato**.",
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

      const textChunks = messageText ? splitDiscordContent(messageText) : [];
      if (!textChunks.length && !attachment) {
        return safeEditReply(interaction, {
          content: "<:vegax:1443934876440068179> Messaggio vuoto.",
          flags: EPHEMERAL_FLAG,
        });
      }

      let sent = 0;
      for (let i = 0; i < textChunks.length; i += 1) {
        const payload = { content: textChunks[i] };
        if (i === 0 && attachment) payload.files = [attachment];
        if (i === 0 && target.replyTo) {
          payload.reply = {
            messageReference: target.replyTo.id,
            failIfNotExists: false,
          };
          payload.allowedMentions = { repliedUser: true };
        }
        const msg = await target.channel.send(payload).catch((err) => {
          global.logger?.warn?.("[say] send failed:", err?.message || err);
          return null;
        });
        if (!msg) {
          return safeEditReply(interaction, {
            content:
              sent > 0
                ? `<:vegax:1443934876440068179> Inviata solo la parte ${sent}/${textChunks.length}.`
                : "<:vegax:1443934876440068179> Impossibile inviare il messaggio.",
            flags: EPHEMERAL_FLAG,
          });
        }
        sent += 1;
      }

      if (!textChunks.length && attachment) {
        const payload = { files: [attachment] };
        if (target.replyTo) {
          payload.reply = {
            messageReference: target.replyTo.id,
            failIfNotExists: false,
          };
          payload.allowedMentions = { repliedUser: true };
        }
        const msg = await target.channel.send(payload).catch((err) => {
          global.logger?.warn?.("[say] send failed:", err?.message || err);
          return null;
        });
        if (!msg) {
          return safeEditReply(interaction, {
            content: "<:vegax:1443934876440068179> Impossibile inviare l'allegato.",
            flags: EPHEMERAL_FLAG,
          });
        }
        sent = 1;
      }

      return safeEditReply(interaction, {
        content:
          sent > 1
            ? `<:success:1461731530333229226> Messaggio inviato (${sent} parti).`
            : "<:success:1461731530333229226> Messaggio inviato",
        flags: EPHEMERAL_FLAG,
      });
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};
