const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const weeklyContestSubmissionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    eventKey: { type: String, required: true, index: true },
    category: { type: String, required: true, enum: ["mobile", "pc"] },
    userId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
  },
  { timestamps: true },
);
weeklyContestSubmissionSchema.index(
  { guildId: 1, eventKey: 1, category: 1, userId: 1 },
  { unique: true },
);
weeklyContestSubmissionSchema.index({ guildId: 1, eventKey: 1, messageId: 1 }, { unique: true });

const weeklyContestVoterSchema = new Schema(
  {
    guildId: { type: String, required: true },
    eventKey: { type: String, required: true },
    voterId: { type: String, required: true },
    votesMobileCounts: { type: Schema.Types.Mixed, default: {} },
    votesPcCounts: { type: Schema.Types.Mixed, default: {} },
    votesMobile: { type: [String], default: [] },
    votesMobileSparkle: { type: [String], default: [] },
    votesPc: { type: [String], default: [] },
    votesPcSparkle: { type: [String], default: [] },
    bonusSlots: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
weeklyContestVoterSchema.index({ guildId: 1, eventKey: 1, voterId: 1 }, { unique: true });

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
  },
  { timestamps: true },
);
weeklyContestMetaSchema.index({ guildId: 1, eventKey: 1 }, { unique: true });

const WeeklyContestSubmission =
  models.WeeklyContestSubmission ||
  model("WeeklyContestSubmission", weeklyContestSubmissionSchema, "weeklycontestsubmissions");
const WeeklyContestVoter =
  models.WeeklyContestVoter || model("WeeklyContestVoter", weeklyContestVoterSchema, "weeklycontestvoters");
const WeeklyContestMeta =
  models.WeeklyContestMeta || model("WeeklyContestMeta", weeklyContestMetaSchema, "weeklycontestmetas");

module.exports = {
  WeeklyContestSubmission,
  WeeklyContestVoter,
  WeeklyContestMeta,
};