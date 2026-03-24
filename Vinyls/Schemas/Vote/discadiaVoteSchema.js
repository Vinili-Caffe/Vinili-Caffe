const mongoose = require("mongoose");

const discadiaVoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  attempts: { type: Number, default: 0 },
});

module.exports = mongoose.model("DiscadiaVote", discadiaVoteSchema);
