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

const weeklyContestSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    eventKey: { type: String, required: true, index: true },
        submissions: {
      mobile: { type: Schema.Types.Mixed, default: {} },
      pc: { type: Schema.Types.Mixed, default: {} },
    },
        submissionMessageIndex: { type: Schema.Types.Mixed, default: {} },
        voters: { type: Schema.Types.Mixed, default: {} },
        dailyBonusGrantLog: { type: Schema.Types.Mixed, default: {} },
        dailyBonusAnnounceLog: { type: Schema.Types.Mixed, default: {} },
    contestFinaleResolved: { type: Boolean, default: false },
    finalePrizesResolvedCategories: { type: Schema.Types.Mixed, default: {} },
    finalePrizeRoleRemovals: { type: [finalePrizeRemovalEntrySchema], default: [] },
    contestMemberSendOpenedDayKey: { type: String, default: null },
        finaleDisegniSecondPlaceUserId: { type: String, default: null },
        finaleClassificaPostedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
weeklyContestSchema.index({ guildId: 1, eventKey: 1 }, { unique: true });

const WeeklyContest =
  models.WeeklyContest || model("WeeklyContest", weeklyContestSchema, COLLECTION);

const WeeklyContestBundle = WeeklyContest;
const WeeklyContestMeta = WeeklyContest;

module.exports = {
  COLLECTION,
  WeeklyContest,
  WeeklyContestBundle,
  WeeklyContestMeta,
};
