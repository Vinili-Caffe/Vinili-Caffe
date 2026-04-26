const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

/** Un solo documento per (guildId + eventKey): submission + voti aggregati. */
const weeklyContestBundleSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    eventKey: { type: String, required: true, index: true },
    submissions: {
      mobile: { type: Schema.Types.Mixed, default: {} },
      pc: { type: Schema.Types.Mixed, default: {} },
    },
    /** messageId -> { category, userId } per lookup rapidi */
    submissionMessageIndex: { type: Schema.Types.Mixed, default: {} },
    /** voterId -> { votesMobileCounts, votesPcCounts, bonusSlots, ... } */
    voters: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
weeklyContestBundleSchema.index({ guildId: 1, eventKey: 1 }, { unique: true });

const finalePrizeRemovalEntrySchema = new Schema(
  {
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    removeAt: { type: Date, required: true },
    hadRoleBefore: { type: Boolean, default: false },
  },
  { _id: false },
);

const weeklyContestMetaSchema = new Schema(
  {
    guildId: { type: String, required: true },
    eventKey: { type: String, required: true },
    dailyBonusGrantLog: { type: Schema.Types.Mixed, default: {} },
    contestFinaleResolved: { type: Boolean, default: false },
    finalePrizesResolvedCategories: { type: Schema.Types.Mixed, default: {} },
    finalePrizeRoleRemovals: { type: [finalePrizeRemovalEntrySchema], default: [] },
    contestMemberSendOpenedDayKey: { type: String, default: null },
    /** Contest disegni: 2° classificato — sblocco Custom Role/Voc in +profile (senza ruolo Discord). */
    finaleDisegniSecondPlaceUserId: { type: String, default: null },
    /** Contest disegni/outfit: classifica finale pubblicata su Discord (un invio per eventKey). */
    finaleClassificaPostedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
weeklyContestMetaSchema.index({ guildId: 1, eventKey: 1 }, { unique: true });

const WeeklyContestBundle =
  models.WeeklyContestBundle ||
  model("WeeklyContestBundle", weeklyContestBundleSchema, "weeklycontestbundles");
const WeeklyContestMeta =
  models.WeeklyContestMeta || model("WeeklyContestMeta", weeklyContestMetaSchema, "weeklycontestmetas");

module.exports = {
  WeeklyContestBundle,
  WeeklyContestMeta,
};