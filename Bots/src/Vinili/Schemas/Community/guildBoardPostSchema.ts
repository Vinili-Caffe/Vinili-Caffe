const mongoose = require("mongoose") as typeof import("mongoose");

const { Schema, model, models } = mongoose;

const COLLECTION = "guildboardposts";
const DISCRIMINATOR_KEY = "type";

const BOARD_POST_TYPE = Object.freeze({
  QUOTE: "quote",
  REPOST: "repost",
  SKULL: "skull",
});

const guildBoardPostBaseSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    /* bachecaSite1: sul server principale la bacheca è la pagina del sito: boardChannelId = "site" */
    boardChannelId: { type: String, default: "" },
    boardMessageId: { type: String, default: "" },
    totalPosts: { type: Number, default: 0 },
    /* media non più recuperabili (messaggio o file spariti da Discord): senza testo non si mostra sul muro */
    mediaLost: { type: Boolean, default: undefined },
  },
  {
    timestamps: true,
    collection: COLLECTION,
    discriminatorKey: DISCRIMINATOR_KEY,
  },
);

guildBoardPostBaseSchema.index({ guildId: 1, createdAt: -1 });
guildBoardPostBaseSchema.index({ guildId: 1, boardChannelId: 1, boardMessageId: 1 });

const GuildBoardPost: import("mongoose").Model<import("mongoose").InferSchemaType<typeof guildBoardPostBaseSchema>> =
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
/* unique board msg: stesso key del base index → nome dedicato (niente auto-name clash) */
quoteDiscriminatorSchema.index(
  { guildId: 1, boardChannelId: 1, boardMessageId: 1 },
  {
    unique: true,
    name: "quote_guild_channel_message_unique",
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
/* guildId+createdAt già sul base schema — niente secondo index omonimo */

const GuildRepost =
  models.GuildRepost ||
  GuildBoardPost.discriminator(BOARD_POST_TYPE.REPOST, repostDiscriminatorSchema);

/* bachecaSite1: messaggio finito in bacheca con una 💀 (prima si salvavano solo gli id) */
const skullDiscriminatorSchema = new Schema(
  {
    sourceAuthorId: { type: String, required: true, index: true },
    sourceChannelId: { type: String, required: true },
    sourceMessageId: { type: String, required: true },
    firstReactorId: { type: String, default: "" },
    content: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    mediaFiles: {
      type: [{ url: { type: String, default: "" }, name: { type: String, default: "" } }],
      default: undefined,
    },
    authorUsername: { type: String, default: "" },
    authorAvatarUrl: { type: String, default: "" },
    skullCount: { type: Number, default: 1 },
  },
  { _id: false },
);

skullDiscriminatorSchema.index(
  { guildId: 1, sourceMessageId: 1 },
  { unique: true, name: "skull_guild_source_unique", partialFilterExpression: { [DISCRIMINATOR_KEY]: BOARD_POST_TYPE.SKULL } },
);

const GuildSkullPost =
  models.GuildSkullPost ||
  GuildBoardPost.discriminator(BOARD_POST_TYPE.SKULL, skullDiscriminatorSchema);

export = {
  COLLECTION,
  BOARD_POST_TYPE,
  GuildBoardPost,
  GuildQuoteBoard,
  GuildRepost,
  GuildSkullPost,
};
