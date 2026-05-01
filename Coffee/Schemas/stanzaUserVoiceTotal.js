const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const stanzaUserVoiceTotalSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    totalSeconds: { type: Number, default: 0 },
  },
  { timestamps: true },
);
stanzaUserVoiceTotalSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const StanzaUserVoiceTotal =
  models.StanzaUserVoiceTotal || model("StanzaUserVoiceTotal", stanzaUserVoiceTotalSchema, "stanzauservoicetotals");

module.exports = { StanzaUserVoiceTotal };