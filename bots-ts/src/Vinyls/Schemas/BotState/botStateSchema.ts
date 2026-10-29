const mongoose = require("mongoose") as typeof import("mongoose");

const DOMAIN_STATES_BOTSTATE_KEY = "__domain_states__";
const COMPACT_BOTSTATE_KEY = "__bot_state_compact__";

const {
  joinRaidStateEmbedSchema,
  minigameStateEmbedSchema,
  minigameRotationEmbedSchema,
  voiceStateEmbedSchema,
  chatReminderRotationEmbedSchema,
  chatReminderScheduleEmbedSchema,
  ttsUserLangEmbedSchema,
} = require("./domainSubSchemas") as typeof import("./domainSubSchemas");

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
          ttsUserLangs: { type: [ttsUserLangEmbedSchema], default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

const BotState: import("mongoose").Model<import("mongoose").InferSchemaType<typeof BotStateSchema>> =
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
  ttsUserLang: ttsUserLangEmbedSchema,
};