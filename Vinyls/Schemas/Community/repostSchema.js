const mongoose = require("mongoose");

const repostSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    reposterUserId: { type: String, required: true, index: true },
    sourceAuthorId: { type: String, required: true },
    sourceChannelId: { type: String, required: true },
    sourceMessageId: { type: String, required: true },
    content: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    authorUsername: { type: String, default: "" },
    authorAvatarUrl: { type: String, default: "" },
    boardChannelId: { type: String, default: "" },
    boardMessageId: { type: String, default: "" },
    totalPosts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

repostSchema.index({ guildId: 1, reposterUserId: 1, createdAt: -1 });
repostSchema.index({ guildId: 1, createdAt: -1 });

const GuildRepost =
  mongoose.models.GuildRepost || mongoose.model("GuildRepost", repostSchema, "guildreposts");

module.exports = { GuildRepost };