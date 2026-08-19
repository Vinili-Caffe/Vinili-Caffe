const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const WEB_TICKET_CATEGORIES = Object.freeze([
  "supporto",
  "partnership",
  "high",
  "perks",
]);

/** Categorie web legacy (pre-allineamento ai pannelli Discord). */
const WEB_TICKET_CATEGORY_LEGACY = Object.freeze(["segnalazione", "tecnico", "altro"]);

const WEB_TICKET_STATUS = Object.freeze({
  OPEN: "open",
  CLAIMED: "claimed",
  CLOSED: "closed",
});

const siteWebTicketSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    ticketNumber: { type: Number, required: true },
    userId: { type: String, required: true, index: true },
    authorName: { type: String, default: "", trim: true, maxlength: 80 },
    authorAvatarUrl: { type: String, default: "", trim: true, maxlength: 400 },
    category: {
      type: String,
      required: true,
      enum: [...WEB_TICKET_CATEGORIES, ...WEB_TICKET_CATEGORY_LEGACY],
      default: "supporto",
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      required: true,
      enum: Object.values(WEB_TICKET_STATUS),
      default: WEB_TICKET_STATUS.OPEN,
      index: true,
    },
    claimedBy: { type: String, default: null, index: true },
    claimedByName: { type: String, default: "", trim: true, maxlength: 80 },
    claimedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
    closedByName: { type: String, default: "", trim: true, maxlength: 80 },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: "", trim: true, maxlength: 500 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "", trim: true, maxlength: 180 },
    lastAuthorKind: { type: String, default: "user", trim: true, maxlength: 16 },
    messageCount: { type: Number, default: 0 },
    addedUsers: {
      type: [
        {
          id: { type: String, required: true, trim: true, maxlength: 32 },
          name: { type: String, default: "", trim: true, maxlength: 80 },
          avatarUrl: { type: String, default: "", trim: true, maxlength: 400 },
        },
      ],
      default: [],
    },
    closeRequestedBy: { type: String, default: null },
    closeRequestedByName: { type: String, default: "", trim: true, maxlength: 80 },
    closeRequestedAt: { type: Date, default: null },
    closeRequestReason: { type: String, default: "", trim: true, maxlength: 1800 },
    /** Valutazione post-chiusura (owner): esperienza ticket + staffer. */
    ratingTicketScore: { type: Number, default: null, min: 1, max: 5 },
    ratingStafferScore: { type: Number, default: null, min: 1, max: 5 },
    ratingBy: { type: String, default: null, index: true },
    ratingAt: { type: Date, default: null },
    ratedStafferId: { type: String, default: null, index: true },
    ratedStafferName: { type: String, default: "", trim: true, maxlength: 80 },
    /** Log Discord chiusura (canale ticket logs, come i ticket Discord). */
    closeLogChannelId: { type: String, default: "", trim: true, maxlength: 32 },
    closeLogMessageId: { type: String, default: "", trim: true, maxlength: 32 },
  },
  { timestamps: true },
);

siteWebTicketSchema.index({ guildId: 1, ticketNumber: 1 }, { unique: true });
siteWebTicketSchema.index({ guildId: 1, status: 1, lastMessageAt: -1 });
siteWebTicketSchema.index({ guildId: 1, userId: 1, status: 1, updatedAt: -1 });
siteWebTicketSchema.index({ guildId: 1, "addedUsers.id": 1, status: 1 });

const siteWebTicketMessageSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, required: true, index: true, ref: "SiteWebTicket" },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, default: "", trim: true, maxlength: 80 },
    authorAvatarUrl: { type: String, default: "", trim: true, maxlength: 400 },
    authorKind: {
      type: String,
      required: true,
      enum: ["user", "staff", "bot", "system"],
      default: "user",
    },
    authorRoleId: { type: String, default: null, trim: true, maxlength: 32 },
    authorRoleName: { type: String, default: "", trim: true, maxlength: 80 },
    authorRoleKey: { type: String, default: "", trim: true, maxlength: 40 },
    content: { type: String, default: "", trim: true, maxlength: 8000 },
    imageUrls: { type: [String], default: [] },
    replyToId: { type: Schema.Types.ObjectId, default: null, ref: "SiteWebTicketMessage", index: true },
    editedAt: { type: Date, default: null },
    reactions: {
      type: [
        {
          key: { type: String, required: true, trim: true, maxlength: 80 },
          emoji: { type: String, required: true, trim: true, maxlength: 80 },
          emojiId: { type: String, default: null, trim: true, maxlength: 32 },
          name: { type: String, default: "", trim: true, maxlength: 64 },
          animated: { type: Boolean, default: false },
          userIds: { type: [String], default: [] },
          users: {
            type: [
              {
                id: { type: String, required: true, trim: true, maxlength: 32 },
                name: { type: String, default: "Utente", trim: true, maxlength: 80 },
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

siteWebTicketMessageSchema.index({ ticketId: 1, createdAt: 1 });
siteWebTicketMessageSchema.index({ guildId: 1, createdAt: -1 });

const siteWebTicketCounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const SiteWebTicket = models.SiteWebTicket || model("SiteWebTicket", siteWebTicketSchema, "sitewebtickets");
const SiteWebTicketMessage =
  models.SiteWebTicketMessage ||
  model("SiteWebTicketMessage", siteWebTicketMessageSchema, "sitewebticketmessages");
const SiteWebTicketCounter =
  models.SiteWebTicketCounter ||
  model("SiteWebTicketCounter", siteWebTicketCounterSchema, "sitewebticketcounters");

async function nextWebTicketNumber(guildId) {
  const id = `web_ticket:${String(guildId || "").trim()}`;
  const doc = await SiteWebTicketCounter.findByIdAndUpdate(
    id,
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  ).lean();
  return Math.max(1, Number(doc?.seq) || 1);
}

module.exports = {
  WEB_TICKET_CATEGORIES,
  WEB_TICKET_CATEGORY_LEGACY,
  WEB_TICKET_STATUS,
  SiteWebTicket,
  SiteWebTicketMessage,
  SiteWebTicketCounter,
  nextWebTicketNumber,
};
