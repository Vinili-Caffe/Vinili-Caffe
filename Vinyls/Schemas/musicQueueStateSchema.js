const mongoose = require("mongoose");
const { model, Schema } = mongoose;

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

const musicQueueStateSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
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

module.exports =
  mongoose.models.MusicQueueState || model("MusicQueueState", musicQueueStateSchema);