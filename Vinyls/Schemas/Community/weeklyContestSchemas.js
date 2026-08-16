const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const COLLECTION = "weeklycontests";

const finalePrizeRemovalEntrySchema = new Schema(
  {
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    removeAt: { type: Date, required: true },
    hadRoleBefore: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Bundle + meta contest per (guildId + eventKey) — una sola collection. */
const weeklyContestSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    eventKey: { type: String, required: true, index: true },
    // bundle
    submissions: {
      mobile: { type: Schema.Types.Mixed, default: {} },
      pc: { type: Schema.Types.Mixed, default: {} },
    },
    /** messageId -> { category, userId } per lookup rapidi */
    submissionMessageIndex: { type: Schema.Types.Mixed, default: {} },
    /** voterId -> { votesMobileCounts, votesPcCounts, bonusSlots, ... } */
    voters: { type: Schema.Types.Mixed, default: {} },
    // meta
    dailyBonusGrantLog: { type: Schema.Types.Mixed, default: {} },
    /** Per giorno (YYYY-MM-DD Roma): annuncio Top 3 bonus già inviato su Discord. */
    dailyBonusAnnounceLog: { type: Schema.Types.Mixed, default: {} },
    contestFinaleResolved: { type: Boolean, default: false },
    finalePrizesResolvedCategories: { type: Schema.Types.Mixed, default: {} },
    finalePrizeRoleRemovals: { type: [finalePrizeRemovalEntrySchema], default: [] },
    contestMemberSendOpenedDayKey: { type: String, default: null },
    /** Contest disegni: 2° classificato — sblocco Custom Role/Voc in +profile. */
    finaleDisegniSecondPlaceUserId: { type: String, default: null },
    /** Contest disegni/outfit: classifica finale pubblicata su Discord. */
    finaleClassificaPostedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
weeklyContestSchema.index({ guildId: 1, eventKey: 1 }, { unique: true });

const WeeklyContest =
  models.WeeklyContest || model("WeeklyContest", weeklyContestSchema, COLLECTION);

/** Alias stabili: stesso modello / stessa collection. */
const WeeklyContestBundle = WeeklyContest;
const WeeklyContestMeta = WeeklyContest;

module.exports = {
  COLLECTION,
  WeeklyContest,
  WeeklyContestBundle,
  WeeklyContestMeta,
};
