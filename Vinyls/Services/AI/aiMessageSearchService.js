const { AiMessageChunk } = require("../../Schemas/AI/aiSchemas");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { rankByEmbedding } = require("./aiEmbeddingUtils");
const { extractSearchTerms } = require("./aiKnowledgeService");

function messageJumpUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function searchServerMessages(guildId, queryEmbedding, aiCfg, opts = {}) {
  if (!isMongoReady() || !Array.isArray(queryEmbedding) || !queryEmbedding.length) return [];
  const limit = Math.max(1, Number(opts.limit || aiCfg.maxMessageChunks || 4));
  const filter = { guildId: String(guildId), embedding: { $exists: true, $ne: [] } };
  if (opts.channelId) filter.channelId = String(opts.channelId);
  if (opts.authorId) filter.authorId = String(opts.authorId);
  const docs = await AiMessageChunk.find(filter)
    .select("channelId messageId authorId content embedding createdAt")
    .sort({ createdAt: -1 })
    .limit(Math.max(limit * 10, 40))
    .lean()
    .catch(() => []);
  return rankByEmbedding(queryEmbedding, docs, limit).map((row) => row.doc);
}

async function searchServerMessagesByText(guildId, query, aiCfg, opts = {}) {
  if (!isMongoReady()) return [];
  const terms = extractSearchTerms(query);
  if (!terms.length) return [];
  const limit = Math.max(1, Number(opts.limit || aiCfg.maxMessageChunks || 4));
  const or = terms.map((t) => ({
    content: { $regex: t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
  }));
  const filter = { guildId: String(guildId), $or: or };
  if (opts.channelId) filter.channelId = String(opts.channelId);
  return AiMessageChunk.find(filter)
    .select("channelId messageId authorId content createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .catch(() => []);
}

function formatServerMessagesContext(guildId, chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  if (!list.length) return "";
  return list
    .map((row) => {
      const url = messageJumpUrl(guildId, row.channelId, row.messageId);
      const when = row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 16) : "";
      return `[Messaggio ${when}] <@${row.authorId}>: ${String(row.content || "").slice(0, 500)}\nLink: ${url}`;
    })
    .join("\n\n");
}

module.exports = {
  searchServerMessages,
  searchServerMessagesByText,
  formatServerMessagesContext,
  messageJumpUrl,
};