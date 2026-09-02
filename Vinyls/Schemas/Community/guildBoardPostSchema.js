const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const COLLECTION = "guildboardposts";
const DISCRIMINATOR_KEY = "type";

const BOARD_POST_TYPE = Object.freeze({
  QUOTE: "quote",
  REPOST: "repost",
});

const guildBoardPostBaseSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    boardChannelId: { type: String, default: "" },
    boardMessageId: { type: String, default: "" },
    totalPosts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: COLLECTION,
    discriminatorKey: DISCRIMINATOR_KEY,
  },
);

guildBoardPostBaseSchema.index({ guildId: 1, createdAt: -1 });
guildBoardPostBaseSchema.index({ guildId: 1, boardChannelId: 1, boardMessageId: 1 });

const GuildBoardPost =
  models.GuildBoardPost || model("GuildBoardPost", guildBoardPostBaseSchema, COLLECTION);

const quoteDiscriminatorSchema = new Schema(
  {
    creatorUserId: { type: String, required: true, index: true },
    quotedUserId: { type: String, required: true },
    originChannelId: { type: String, default: "" },
    originMessageId: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    quotedUsername: { type: String, default: "" },
  },
  { _id: false },
);

quoteDiscriminatorSchema.index({ guildId: 1, creatorUserId: 1, createdAt: -1 });
quoteDiscriminatorSchema.index(
  { guildId: 1, boardChannelId: 1, boardMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { [DISCRIMINATOR_KEY]: BOARD_POST_TYPE.QUOTE },
  },
);

const GuildQuoteBoard =
  models.GuildQuoteBoard ||
  GuildBoardPost.discriminator(BOARD_POST_TYPE.QUOTE, quoteDiscriminatorSchema);

const repostDiscriminatorSchema = new Schema(
  {
    reposterUserId: { type: String, required: true, index: true },
    sourceAuthorId: { type: String, required: true },
    sourceChannelId: { type: String, required: true },
    sourceMessageId: { type: String, required: true },
    content: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    mediaFiles: {
      type: [{ url: { type: String, default: "" }, name: { type: String, default: "" } }],
      default: undefined,
    },
    authorUsername: { type: String, default: "" },
    authorAvatarUrl: { type: String, default: "" },
  },
  { _id: false },
);

repostDiscriminatorSchema.index({ guildId: 1, reposterUserId: 1, createdAt: -1 });
repostDiscriminatorSchema.index({ guildId: 1, createdAt: -1 });

const GuildRepost =
  models.GuildRepost ||
  GuildBoardPost.discriminator(BOARD_POST_TYPE.REPOST, repostDiscriminatorSchema);

module.exports = {
  COLLECTION,
  DISCRIMINATOR_KEY,
  BOARD_POST_TYPE,
  GuildBoardPost,
  GuildQuoteBoard,
  GuildRepost,
};
