const { AiChatSession } = require("../../Schemas/AI/aiSchemas");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");

async function getChatHistory(guildId, channelId, userId, maxTurns = 8) {
  if (!isMongoReady()) return [];
  const doc = await AiChatSession.findOne({
    guildId: String(guildId),
    channelId: String(channelId),
    userId: String(userId),
  })
    .lean()
    .catch(() => null);
  const turns = Array.isArray(doc?.turns) ? doc.turns : [];
  return turns.slice(-Math.max(2, maxTurns));
}

async function appendChatTurn(guildId, channelId, userId, role, content) {
  if (!isMongoReady()) return;
  const text = String(content || "").slice(0, 3500);
  if (!text) return;
  await AiChatSession.findOneAndUpdate(
    { guildId: String(guildId), channelId: String(channelId), userId: String(userId) },
    {
      $push: {
        turns: {
          $each: [{ role, content: text, at: new Date() }],
          $slice: -16,
        },
      },
      $set: { updatedAt: new Date() },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function clearChatSession(guildId, channelId, userId) {
  if (!isMongoReady()) return;
  await AiChatSession.deleteOne({
    guildId: String(guildId),
    channelId: String(channelId),
    userId: String(userId),
  }).catch(() => null);
}

module.exports = { getChatHistory, appendChatTurn, clearChatSession };