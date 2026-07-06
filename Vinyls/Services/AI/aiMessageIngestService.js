const { AiMessageChunk } = require("../../Schemas/AI/aiSchemas");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { shouldIngestMessageForAi } = require("./aiChannelPolicy");
const { resolveAiConfig } = require("./aiConfig");
const { ollamaEmbedText } = require("./ollamaClient");
async function ingestMessageForAi(message, client) {
  if (!shouldIngestMessageForAi(message, client)) return;
  if (!isMongoReady()) return;
  const cfg = resolveAiConfig(client);
  const content = String(message.content || "").trim().slice(0, 3500);
  const guildId = String(message.guild.id);
  const channelId = String(message.channel.id);
  const messageId = String(message.id);
  const authorId = String(message.author?.id || "");
  let embedding = null;
  try {
    embedding = await ollamaEmbedText(content, {
      baseUrl: cfg.ollamaBaseUrl,
      model: cfg.ollamaEmbedModel,
    });
  } catch {
    embedding = null;
  }
  const payload = {
    guildId,
    channelId,
    messageId,
    authorId,
    content,
    createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
  };
  if (embedding) payload.embedding = embedding;
  await AiMessageChunk.updateOne({ guildId, messageId }, { $set: payload }, { upsert: true }).catch(() => null);
}

function scheduleMessageIngest(message, client) {
  if (!shouldIngestMessageForAi(message, client)) return;
  setImmediate(() => {
    ingestMessageForAi(message, client).catch((err) => {
      global.logger?.warn?.("[AI] ingest message failed:", err?.message || err);
    });
  });
}

module.exports = { ingestMessageForAi, scheduleMessageIngest };