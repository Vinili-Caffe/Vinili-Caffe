const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const { modCaseEditEntrySchema } = require("./modCaseEmbeddedSchemas");

const MOD_CASE_COLLECTION = process.env.MOD_CASE_COLLECTION ? String(process.env.MOD_CASE_COLLECTION).trim() : "";

const RESOLVED_MOD_CASE_COLLECTION = MOD_CASE_COLLECTION || "mod_case";

const modCaseSchema = new Schema(
  {
    guildId: { type: String, required: true },
    caseId: { type: Number, required: true, index: true },
    action: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    modId: { type: String, required: true },
    reason: { type: String, default: "Nessun motivo fornito" },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    context: {
      channelId: { type: String, default: null },
      messageId: { type: String, default: null },
    },
    edits: { type: [modCaseEditEntrySchema], default: [] },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
  },
  { timestamps: true, autoCreate: false },
);
modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
modCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, modId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, action: 1, active: 1, expiresAt: 1 });

if (models.mod_case && models.mod_case.collection?.name !== RESOLVED_MOD_CASE_COLLECTION) {
  mongoose.deleteModel("mod_case");
}

const ModCase = models.mod_case ? models.mod_case : model("mod_case", modCaseSchema, RESOLVED_MOD_CASE_COLLECTION);

module.exports = { ModCase };