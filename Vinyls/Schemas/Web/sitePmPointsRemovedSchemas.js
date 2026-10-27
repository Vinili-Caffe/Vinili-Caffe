const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const PM_POINTS_REMOVED_STATUSES = Object.freeze(["pending", "confirmed", "denied", "logged"]);
const PM_POINTS_REMOVED_SOURCES = Object.freeze([
  "report",
  "removal",
  "partnership_delete",
  "hs_manual",
  "audit",
  "backfill",
]);

const sitePmPointsRemovedSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    pmUserId: { type: String, required: true, index: true },
    rule: { type: String, default: "", trim: true, maxlength: 500 },
    messageLink: { type: String, default: null, trim: true, maxlength: 400 },
    invite: { type: String, default: null, trim: true, maxlength: 300 },
    reporterUserId: { type: String, default: null, index: true },
    actorUserId: { type: String, default: null, index: true },
    status: {
      type: String,
      required: true,
      enum: PM_POINTS_REMOVED_STATUSES,
      default: "logged",
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: PM_POINTS_REMOVED_SOURCES,
      default: "logged",
    },
    discordMessageId: { type: String, default: null, index: true },
    discordChannelId: { type: String, default: null },
    reviewerUserId: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sitePmPointsRemovedSchema.index({ guildId: 1, createdAt: -1, _id: -1 });
sitePmPointsRemovedSchema.index({ guildId: 1, status: 1, createdAt: -1 });
sitePmPointsRemovedSchema.index(
  { guildId: 1, discordMessageId: 1 },
  {
    unique: true,
    name: "guildId_1_discordMessageId_1_partial",
    /* Mongo partial: niente $ne; usare $gt "" (come board listing) */
    partialFilterExpression: { discordMessageId: { $type: "string", $gt: "" } },
  },
);

const SitePmPointsRemovedEntry =
  models.SitePmPointsRemovedEntry ||
  model("SitePmPointsRemovedEntry", sitePmPointsRemovedSchema, "sitepmpointsremoved");

module.exports = {
  SitePmPointsRemovedEntry,
  PM_POINTS_REMOVED_STATUSES,
  PM_POINTS_REMOVED_SOURCES,
};
