const mongoose = require("mongoose");
const { Schema } = mongoose;

const modCaseEditEntrySchema = new Schema(
  {
    field: { type: String, required: true },
    previous: { type: String, default: "" },
    next: { type: String, default: "" },
    editedBy: { type: String, default: null },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const modCaseEntrySchema = new Schema(
  {
    caseId: { type: Number, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

module.exports = { modCaseEditEntrySchema, modCaseEntrySchema };