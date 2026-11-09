const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;

const pollEntrySchema = new Schema(
  {
    pollcount: { type: Number },
    domanda: { type: String, default: null },
    risposta1: String,
    risposta2: String,
    risposta3: String,
    risposta4: String,
    risposta5: String,
    risposta6: String,
    risposta7: String,
    risposta8: String,
    risposta9: String,
    risposta10: String,
    messageId: { type: String, default: null },
    source: { type: String, default: "manual" },
    autoSlot: { type: String, default: null },
    channelId: { type: String, default: null },
    nativePoll: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const suggestionEntrySchema = new Schema(
  {
    ChannelID: { type: String, required: true },
    Msg: { type: String, required: true },
    AuthorID: { type: String, required: true },
    Upmembers: { type: [String], default: [] },
    Downmembers: { type: [String], default: [] },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    sID: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const ticketEntrySchema = new Schema(
  {
    ticketNumber: { type: Number },
    guildId: { type: String, default: null },
    userId: { type: String, required: true },
    channelId: { type: String, required: true },
    ticketType: { type: String, default: "supporto" },
    panelId: { type: String, default: null },
    userTag: { type: String, default: null },
    open: { type: Boolean, required: true, default: true },
    claimedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    transcript: { type: String, default: "" },
    transcriptHtmlPath: { type: String, default: null },
    transcriptViewToken: { type: String, default: null },
    transcriptHtmlInline: { type: String, default: null },
    transcriptViewExpiresAt: { type: Date, default: null },
    hasTranscript: { type: Boolean, default: null },
    messageId: { type: String, default: null },
    descriptionPromptMessageId: { type: String, default: null },
    descriptionSubmitted: { type: Boolean, default: false },
    descriptionText: { type: String, default: "" },
    descriptionSubmittedAt: { type: Date, default: null },
    autoClosePromptSentAt: { type: Date, default: null },
    /* avviso "ticket fermo": id dell'ultimo messaggio dell'utente già segnalato (uno per messaggio) */
    staleAlertMessageId: { type: String, default: null },
    closeReason: { type: String, default: null },
    closeRequestedBy: { type: String, default: null },
    closeRequestedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closeLogChannelId: { type: String, default: null },
    closeLogMessageId: { type: String, default: null },
    ratingScore: { type: Number, default: null },
    ratingBy: { type: String, default: null },
    ratingAt: { type: Date, default: null },
    partnerManagerShopRedeemTier: { type: Number, default: null },
    partnerManagerShopRedeemAckResult: { type: String, default: null },
    partnerManagerShopRedeemAckAt: { type: Date, default: null },
  },
);

const giveawayEntrySchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    prize: { type: String, required: true },
    endAt: { type: Date, required: true },
    winnerCount: { type: Number, required: true, default: 1 },
    hostId: { type: String, required: true },
    hostTag: { type: String, default: "" },
    participants: { type: [String], default: [] },
    ended: { type: Boolean, default: false },
    cancelled: { type: Boolean, default: false },
    winnerIds: { type: [String], default: [] },
    /* morgamesGw1: obbligatorio account Morgames collegato a Discord */
    requireMorgames: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const guildFeatureBucketSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    pollCounter: { type: Number, default: 0 },
    polls: { type: [pollEntrySchema], default: [] },
    suggestionCounter: { type: Number, default: 0 },
    suggestions: { type: [suggestionEntrySchema], default: [] },
    ticketCounter: { type: Number, default: 0 },
    tickets: { type: [ticketEntrySchema], default: [] },
    giveaways: { type: [giveawayEntrySchema], default: [] },
  },
  { timestamps: true },
);

guildFeatureBucketSchema.index({ "tickets.transcriptViewToken": 1 }, { unique: true, sparse: true });
guildFeatureBucketSchema.index({ "tickets.channelId": 1 }, { unique: true, sparse: true });
guildFeatureBucketSchema.index({ guildId: 1, "tickets.ticketNumber": 1 }, { unique: true, sparse: true });
guildFeatureBucketSchema.index({ "tickets.open": 1, "tickets.createdAt": 1 });
guildFeatureBucketSchema.index({ "giveaways.messageId": 1 }, { unique: true, sparse: true });
guildFeatureBucketSchema.index({ "giveaways.ended": 1, "giveaways.endAt": 1 });

const GuildFeatureBucket: any =
  models.GuildFeatureBucket || model("GuildFeatureBucket", guildFeatureBucketSchema);

async function ensureGuildFeatureBucket(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) throw new Error("ensureGuildFeatureBucket: guildId required");
  return GuildFeatureBucket.findOneAndUpdate(
    { guildId: gid },
    {
      $setOnInsert: {
        guildId: gid,
        pollCounter: 0,
        polls: [],
        suggestionCounter: 0,
        suggestions: [],
        ticketCounter: 0,
        tickets: [],
        giveaways: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export = {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
};