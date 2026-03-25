const mongoose = require("mongoose");

/** Documento `botstates` con `domains` popolato dallo script migrate-domain-states-to-botstate.js */
const DOMAIN_STATES_BOTSTATE_KEY = "__domain_states__";
/** Unico documento dopo scripts/compact-botstates.js (value = mappa chiave → payload) */
const COMPACT_BOTSTATE_KEY = "__bot_state_compact__";

const {
  joinRaidStateEmbedSchema,
  minigameStateEmbedSchema,
  minigameRotationEmbedSchema,
  voiceStateEmbedSchema,
  chatReminderRotationEmbedSchema,
  chatReminderScheduleEmbedSchema,
} = require("./domainSubSchemas");

const BotStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
    domains: {
      type: new mongoose.Schema(
        {
          joinRaidStates: { type: [joinRaidStateEmbedSchema], default: undefined },
          minigameStates: { type: [minigameStateEmbedSchema], default: undefined },
          minigameRotations: { type: [minigameRotationEmbedSchema], default: undefined },
          voiceStates: { type: [voiceStateEmbedSchema], default: undefined },
          chatReminderRotations: {
            type: [chatReminderRotationEmbedSchema],
            default: undefined,
          },
          chatReminderSchedules: {
            type: [chatReminderScheduleEmbedSchema],
            default: undefined,
          },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

const BotState =
  mongoose.models.BotState || mongoose.model("BotState", BotStateSchema);

module.exports = BotState;
module.exports.DOMAIN_STATES_BOTSTATE_KEY = DOMAIN_STATES_BOTSTATE_KEY;
module.exports.COMPACT_BOTSTATE_KEY = COMPACT_BOTSTATE_KEY;
module.exports.schema = BotStateSchema;
module.exports.embedSchemas = {
  joinRaidState: joinRaidStateEmbedSchema,
  minigameState: minigameStateEmbedSchema,
  minigameRotation: minigameRotationEmbedSchema,
  voiceState: voiceStateEmbedSchema,
  chatReminderRotation: chatReminderRotationEmbedSchema,
  chatReminderSchedule: chatReminderScheduleEmbedSchema,
};