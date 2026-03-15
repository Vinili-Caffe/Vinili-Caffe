const mongoose = require("mongoose");

const BotStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.BotState || mongoose.model("BotState", BotStateSchema);