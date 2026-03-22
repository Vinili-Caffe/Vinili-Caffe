const mongoose = require("mongoose");
const { Schema } = mongoose;

const joinRaidSampleSchema = new Schema(
  {
    ts: { type: Number, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Number, default: 0 },
    skeleton: { type: String, default: "" },
  },
  { _id: false },
);

const joinRaidFlaggedSchema = new Schema(
  {
    ts: { type: Number, required: true },
    userId: { type: String, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false },
);

const joinRaidTempBanSchema = new Schema(
  {
    userId: { type: String, required: true },
    unbanAt: { type: Number, required: true },
  },
  { _id: false },
);

const joinRaidStateEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    raidUntil: { type: Number, default: 0 },
    samples: { type: [joinRaidSampleSchema], default: [] },
    flagged: { type: [joinRaidFlaggedSchema], default: [] },
    tempBans: { type: [joinRaidTempBanSchema], default: [] },
    raidCaseCode: { type: String, default: "" },
    raidStartedAt: { type: Number, default: 0 },
    raidInitialFlaggedUserIds: { type: [String], default: [] },
    raidCaughtUserIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

const minigameStateEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    type: { type: String, required: true },
    target: { type: String, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    rewardExp: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    gameMessageId: { type: String, default: null },
    targetChannelId: { type: String, default: null },
    customId: { type: String, default: null },
    mainMessageId: { type: String, default: null },
  },
  { timestamps: true },
);

const minigameRotationEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    dateKey: { type: String, required: true },
    queue: { type: [String], default: [] },
  },
  { timestamps: true },
);

const trackStateSchema = new Schema(
  {
    encoded: { type: String, required: true },
    title: { type: String, default: "Sconosciuto" },
    author: { type: String, default: "Unknown" },
    url: { type: String, default: "" },
    source: { type: String, default: "youtube" },
    durationMS: { type: Number, default: 0 },
  },
  { _id: false },
);

const musicQueueStateEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    voiceChannelId: { type: String, required: true },
    textChannelId: { type: String, default: null },
    currentTrack: { type: trackStateSchema, default: null },
    tracks: { type: [trackStateSchema], default: [] },
    positionMs: { type: Number, default: 0 },
    paused: { type: Boolean, default: false },
    volume: { type: Number, default: 5 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const voiceStateEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    lastTtsMessageId: { type: String, default: null },
    lastTtsProcessedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

const chatReminderRotationEmbedSchema = new Schema(
  {
    guildId: { type: String, required: true },
    dateKey: { type: String, required: true },
    queue: { type: [Number], default: [] },
    lastSentAt: { type: Date, default: null },
    normalRemindersSinceEvent: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const chatReminderScheduleEmbedSchema = new Schema(
  {
    scheduleId: { type: String, required: true },
    guildId: { type: String, required: true },
    fireAt: { type: Date, required: true },
    kind: { type: String, default: "first" },
  },
  { timestamps: true },
);

module.exports = {
  joinRaidStateEmbedSchema,
  minigameStateEmbedSchema,
  minigameRotationEmbedSchema,
  musicQueueStateEmbedSchema,
  voiceStateEmbedSchema,
  chatReminderRotationEmbedSchema,
  chatReminderScheduleEmbedSchema,
};