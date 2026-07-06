const MAX_CONCURRENT_AI_CHATS = Math.max(1, Math.min(4, Number(process.env.AI_MAX_CONCURRENT_CHATS || 2)));

let chatInFlight = 0;

function tryBeginAiChat() {
  if (chatInFlight >= MAX_CONCURRENT_AI_CHATS) return false;
  chatInFlight += 1;
  return true;
}

function endAiChat() {
  chatInFlight = Math.max(0, chatInFlight - 1);
}

function getAiChatInFlight() {
  return chatInFlight;
}

function isAiChatBusy() {
  return chatInFlight > 0;
}

module.exports = { tryBeginAiChat, endAiChat, getAiChatInFlight, isAiChatBusy, MAX_CONCURRENT_AI_CHATS };