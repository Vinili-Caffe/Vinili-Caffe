const mongoose = require("mongoose");

const knowledgeChunkSchema = new mongoose.Schema(
  {
    source: { type: String, default: "" },
    path: { type: String, default: "" },
    title: { type: String, default: "" },
    text: { type: String, default: "" },
    embedding: { type: [Number], default: undefined },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
knowledgeChunkSchema.index({ source: 1, path: 1, title: 1 });

const messageChunkSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    authorId: { type: String, default: "" },
    content: { type: String, default: "" },
    embedding: { type: [Number], default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
messageChunkSchema.index({ guildId: 1, messageId: 1 }, { unique: true });
messageChunkSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const chatSessionSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    userId: { type: String, required: true },
    turns: {
      type: [
        {
          role: { type: String, enum: ["user", "assistant"], required: true },
          content: { type: String, default: "" },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
chatSessionSchema.index({ guildId: 1, channelId: 1, userId: 1 }, { unique: true });
chatSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

const AiKnowledgeChunk =
  mongoose.models.AiKnowledgeChunk ||
  mongoose.model("AiKnowledgeChunk", knowledgeChunkSchema, "aiknowledgechunks");
const AiMessageChunk =
  mongoose.models.AiMessageChunk ||
  mongoose.model("AiMessageChunk", messageChunkSchema, "aimessagechunks");
const AiChatSession =
  mongoose.models.AiChatSession ||
  mongoose.model("AiChatSession", chatSessionSchema, "aichatsessions");

module.exports = { AiKnowledgeChunk, AiMessageChunk, AiChatSession };