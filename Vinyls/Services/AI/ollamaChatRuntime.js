const { resolveAiConfig } = require("./aiConfig");
const { isChannelExcludedForAi, isAmbientAiChannel, resolveReplyToAiMessage } = require("./aiChannelPolicy");
const { handleAiChatRequest } = require("./aiChatOrchestrator");
const { sendAiReply } = require("./aiReplyUtils");
const { recordAmbientChannelActivity } = require("./aiAmbientProactiveService");

async function runAmbientAiChat(message, client, question, replyMessage) {
  try {
    const result = await handleAiChatRequest({
      client,
      guild: message.guild,
      channel: message.channel,
      userId: message.author.id,
      question,
      replyMessage,
      skipRateLimit: true,
    });
    if (!result.ok && result.message) {
      await sendAiReply(message.channel, result.message, {
        typingIndicator: false,
        replyDelayMinMs: 0,
        replyDelayMaxMs: 0,
        stampAsAi: false,
      }).catch(() => null);
    }
  } catch (err) {
    global.logger?.error?.("[AI] ambient chat failed:", err?.stack || err?.message || err);
    await sendAiReply(message.channel, "Errore interno dell'assistente IA. Riprova tra poco.", {
      typingIndicator: false,
      replyDelayMinMs: 0,
      replyDelayMaxMs: 0,
      stampAsAi: false,
    }).catch(() => null);
  }
}

async function handleAmbientOllamaMessage(message, client) {
  const aiCfg = resolveAiConfig(client);
  if (!aiCfg.enabled) return false;
  if (!message?.guild || message.author?.bot) return false;
  if (isChannelExcludedForAi(message, client)) return false;

  const prefix = String(client?.config?.prefix || "+").trim() || "+";
  const content = String(message.content || "").trim();
  if (content.startsWith(prefix)) return false;

  if (isAmbientAiChannel(message, client)) {
    void recordAmbientChannelActivity(message, client).catch(() => null);
  }

  if (!aiCfg.replyToAiEnabled) return false;

  const replyToAi = await resolveReplyToAiMessage(message, client).catch(() => null);
  if (!replyToAi) return false;

  const question = content || "Rispondi in modo naturale al messaggio a cui ho risposto.";
  void runAmbientAiChat(message, client, question, replyToAi);
  return true;
}

module.exports = { handleAmbientOllamaMessage };