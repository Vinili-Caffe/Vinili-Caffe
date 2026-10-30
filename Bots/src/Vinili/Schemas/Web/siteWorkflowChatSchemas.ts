const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;

const siteWorkflowChatMessageSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    dedupeKey: { type: String, required: true, index: true, maxlength: 120 },
    queue: {
      type: String,
      required: true,
      enum: ["pause", "candidature", "appelli", "resoconti"],
      index: true,
    },
    subjectUserId: { type: String, default: "", trim: true, maxlength: 32, index: true },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, default: "", trim: true, maxlength: 80 },
    authorAvatarUrl: { type: String, default: "", trim: true, maxlength: 400 },
    authorRoleLabel: { type: String, default: "", trim: true, maxlength: 48 },
    authorKind: {
      type: String,
      required: true,
      enum: ["user", "staff", "system"],
      default: "staff",
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    imageUrls: { type: [String], default: [] },
    replyToId: { type: Schema.Types.ObjectId, ref: "SiteWorkflowChatMessage", default: null },
    editedAt: { type: Date, default: null },
    /* msgReadReceipts1: WhatsApp-style ✓ / ✓✓ */
    readBy: {
      type: [
        {
          userId: { type: String, required: true, trim: true, maxlength: 32 },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    reactions: {
      type: [
        {
          key: { type: String, default: "" },
          emoji: { type: String, default: "" },
          emojiId: { type: String, default: null },
          name: { type: String, default: "" },
          animated: { type: Boolean, default: false },
          userIds: { type: [String], default: [] },
          users: {
            type: [
              {
                id: { type: String, default: "" },
                name: { type: String, default: "" },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

siteWorkflowChatMessageSchema.index({ guildId: 1, dedupeKey: 1, createdAt: 1 });
siteWorkflowChatMessageSchema.index({ guildId: 1, dedupeKey: 1, createdAt: -1 });

const SiteWorkflowChatMessage: import("mongoose").Model<import("mongoose").InferSchemaType<typeof siteWorkflowChatMessageSchema>> =
  models.SiteWorkflowChatMessage ||
  model("SiteWorkflowChatMessage", siteWorkflowChatMessageSchema, "siteworkflowchatmessages");

async function purgeWorkflowChatByDedupe(guildId?, dedupeKey?) {
  const gid = String(guildId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!gid || !key) return 0;
  const result = await SiteWorkflowChatMessage.deleteMany({ guildId: gid, dedupeKey: key }).catch(() => null);
  return Number(result?.deletedCount || 0);
}

async function purgeWorkflowChatByDedupeKeys(guildId?, dedupeKeys?) {
  const gid = String(guildId || "").trim();
  const keys = Array.isArray(dedupeKeys)
    ? [...new Set(dedupeKeys.map((k?) => String(k || "").trim()).filter(Boolean))]
    : [];
  if (!gid || !keys.length) return 0;
  const result = await SiteWorkflowChatMessage.deleteMany({
    guildId: gid,
    dedupeKey: { $in: keys },
  }).catch(() => null);
  return Number(result?.deletedCount || 0);
}

export = {
  SiteWorkflowChatMessage,
  purgeWorkflowChatByDedupe,
  purgeWorkflowChatByDedupeKeys,
};
