const { resolveAiConfig } = require("./aiConfig");
const { isAiAssistantBotMessage } = require("./aiMessageRegistry");

function isChannelExcludedForAi(message, client) {
  if (!message?.guild || !message.channel) return true;
  const cfg = resolveAiConfig(client);
  const channelId = String(message.channel.id || "");
  const parentId = String(message.channel.parentId || "");
  if (cfg.excludedChannelIds.includes(channelId)) return true;
  if (parentId && cfg.excludedCategoryIds.includes(parentId)) return true;
  if (message.channel.isDMBased?.()) return true;
  return false;
}

function isAmbientAiChannel(message, client) {
  const cfg = resolveAiConfig(client);
  const channelId = String(message.channel?.id || "");
  return cfg.ambientChannelIds.includes(channelId);
}

function shouldIngestMessageForAi(message, client) {
  if (!message?.guild || message.author?.bot || message.system || message.webhookId) return false;
  const cfg = resolveAiConfig(client);
  if (!cfg.enabled || !cfg.messageIngestEnabled) return false;
  if (isChannelExcludedForAi(message, client)) return false;
  const content = String(message.content || "").trim();
  if (!content || content.length < 2) return false;
  if (content.length > 4000) return false;
  return true;
}

function messageMentionsBot(message, client) {
  const botId = String(client?.user?.id || "");
  if (!botId) return false;
  if (message.mentions?.users?.has(botId)) return true;
  if (message.mentions?.members?.has(botId)) return true;
  const content = String(message.content || "");
  return content.includes(`<@${botId}>`) || content.includes(`<@!${botId}>`);
}

async function fetchReferencedMessage(message) {
  const refId = String(message?.reference?.messageId || "");
  if (!refId || !message?.channel?.messages?.fetch) return null;
  return message.channel.messages.fetch(refId).catch(() => null);
}

function isReplyToBotMessage(message, client, referencedMessage = null) {
  const botId = String(client?.user?.id || "");
  if (!botId || !message?.reference?.messageId) return false;
  const ref = referencedMessage || message?.referencedMessage || null;
  if (!ref) return false;
  return String(ref?.author?.id || "") === botId;
}

async function resolveReplyToBotMessage(message, client) {
  if (!message?.reference?.messageId) return null;
  const ref = (await fetchReferencedMessage(message)) || message?.referencedMessage || null;
  if (!isReplyToBotMessage(message, client, ref)) return null;
  return ref;
}

async function resolveReplyToAiMessage(message, client) {
  if (!message?.reference?.messageId) return null;
  const ref = (await fetchReferencedMessage(message)) || message?.referencedMessage || null;
  if (!isReplyToBotMessage(message, client, ref)) return null;
  if (!isAiAssistantBotMessage(ref, client)) return null;
  return ref;
}

function stripBotMention(content, client) {
  const botId = String(client?.user?.id || "");
  let out = String(content || "");
  if (!botId) return out.trim();
  out = out.replace(new RegExp(`<@!?${botId}>`, "g"), " ").replace(/\s+/g, " ");
  return out.trim();
}

module.exports = {
  isChannelExcludedForAi,
  isAmbientAiChannel,
  shouldIngestMessageForAi,
  messageMentionsBot,
  stripBotMention,
  fetchReferencedMessage,
  isReplyToBotMessage,
  resolveReplyToBotMessage,
  resolveReplyToAiMessage,
};