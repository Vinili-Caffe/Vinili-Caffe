const { stampAiMessageContent, registerAiMessageId } = require("./aiMessageRegistry");

function splitReplyParts(text, maxLen = 1900) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.length <= maxLen) return [raw];
  const parts = [];
  let rest = raw;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.45) cut = rest.lastIndexOf(" ", maxLen);
    if (cut < maxLen * 0.25) cut = maxLen;
    const piece = rest.slice(0, cut).trim();
    if (piece) parts.push(piece);
    rest = rest.slice(cut).trim();
    if (parts.length >= 3) break;
  }
  if (rest) parts.push(rest);
  return parts.slice(0, 3);
}

function randomDelayMs(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function sendAiReply(channel, text, opts = {}) {
  if (!channel?.isTextBased?.()) return null;
  const parts = splitReplyParts(text, opts.maxLen || 1900);
  if (!parts.length) return null;
  const typing = opts.typingIndicator !== false;
  const delayMin = Number(opts.replyDelayMinMs || 0);
  const delayMax = Number(opts.replyDelayMaxMs || 0);
  let last = null;
  for (let i = 0; i < parts.length; i += 1) {
    if (typing && typeof channel.sendTyping === "function") {
      await channel.sendTyping().catch(() => null);
    }
    if (i > 0 && delayMax > 0) {
      await new Promise((r) => setTimeout(r, randomDelayMs(delayMin, delayMax)));
    }
    const allowedMentions = opts.allowedMentions || { parse: [] };
    const stampAsAi = opts.stampAsAi !== false;
    const payload = stampAsAi ? stampAiMessageContent(parts[i]) : parts[i];
    last = await channel
      .send({ content: payload, allowedMentions })
      .catch(() => null);
    if (last?.id && stampAsAi) registerAiMessageId(last.id);
  }
  return last;
}

module.exports = { splitReplyParts, randomDelayMs, sendAiReply };