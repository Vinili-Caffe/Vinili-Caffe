const AI_MESSAGE_MARKER = "\u2060\u200B\u200D";
const AI_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const aiMessageIds = new Map();

function pruneAiMessageRegistry(now = Date.now()) {
  for (const [id, at] of aiMessageIds) {
    if (now - at > AI_MESSAGE_TTL_MS) aiMessageIds.delete(id);
  }
}

function stampAiMessageContent(text) {
  const raw = String(text || "");
  if (!raw) return raw;
  if (raw.endsWith(AI_MESSAGE_MARKER)) return raw;
  return `${raw}${AI_MESSAGE_MARKER}`;
}

function hasAiMessageMarker(content) {
  return String(content || "").endsWith(AI_MESSAGE_MARKER);
}

function registerAiMessageId(messageId) {
  const id = String(messageId || "");
  if (!id) return;
  aiMessageIds.set(id, Date.now());
  if (aiMessageIds.size > 5000) pruneAiMessageRegistry();
}

function isRegisteredAiMessage(messageId) {
  const id = String(messageId || "");
  if (!id) return false;
  const at = aiMessageIds.get(id);
  if (!at) return false;
  if (Date.now() - at > AI_MESSAGE_TTL_MS) {
    aiMessageIds.delete(id);
    return false;
  }
  return true;
}

function isAiAssistantBotMessage(message, client) {
  const botId = String(client?.user?.id || "");
  if (!botId || !message) return false;
  if (String(message?.author?.id || "") !== botId) return false;
  if (hasAiMessageMarker(message.content)) return true;
  if (isRegisteredAiMessage(message.id)) return true;
  return false;
}

module.exports = {
  AI_MESSAGE_MARKER,
  stampAiMessageContent,
  hasAiMessageMarker,
  registerAiMessageId,
  isRegisteredAiMessage,
  isAiAssistantBotMessage,
  pruneAiMessageRegistry,
};