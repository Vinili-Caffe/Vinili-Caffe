const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { resolveAiConfig } = require("../../Services/AI/aiConfig");
const { handleAiChatRequest, handleAiResetRequest } = require("../../Services/AI/aiChatOrchestrator");

async function runAiPrefixChat(message, question, replyMessage) {
  try {
    if (message?.channel?.sendTyping) {
      await message.channel.sendTyping().catch(() => null);
    }
    const result = await handleAiChatRequest({
      client: message.client,
      guild: message.guild,
      channel: message.channel,
      userId: message.author.id,
      question,
      replyMessage,
      skipRateLimit: true,
    });
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${result.message || "Richiesta IA non riuscita."}`),
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
    }
  } catch (err) {
    global.logger?.error?.("[AI] +ai prefix failed:", err?.stack || err?.message || err);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription("<:vegax:1443934876440068179> Errore interno dell'assistente IA. Riprova tra poco."),
      ],
      allowedMentions: { repliedUser: false },
    }).catch(() => null);
  }
}

module.exports = {
  name: "ai",
  fireAndForget: true,
  skipCommandCooldown: true,
  description: "Chiedi all'assistente IA del server (usa +ai reset per azzerare la memoria).",
  allowEmptyArgs: true,
  async execute(message, args) {
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

    const aiCfg = resolveAiConfig(message.client);
    if (!aiCfg.enabled) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> L'assistente IA non è attivo su questo server."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
    if (!aiCfg.prefixEnabled) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Usa una menzione al bot per parlare con l'IA."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const argText = Array.isArray(args) ? args.join(" ").trim() : "";
    if (/^reset$/i.test(argText)) {
      const reset = await handleAiResetRequest({
        guild: message.guild,
        channel: message.channel,
        userId: message.author.id,
      });
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder().setColor("#6f4e37").setDescription(`<:success:1461731530333229226> ${reset.message}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    let question = argText;
    let replyMessage = null;
    if (message.reference?.messageId) {
      replyMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (!question) question = String(replyMessage?.content || "").trim();
    }
    if (!question) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Scrivi una domanda: `+ai come funzionano i livelli?` oppure rispondi a un messaggio con `+ai`.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    setImmediate(() => {
      void runAiPrefixChat(message, question, replyMessage);
    });
    return null;
  },
};