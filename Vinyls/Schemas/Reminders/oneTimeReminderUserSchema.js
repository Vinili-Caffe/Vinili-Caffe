const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const oneTimeReminderEntrySchema = new Schema(
  {
    key: { type: String, required: true },
    message: { type: String, required: true },
    sendAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const oneTimeReminderUserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    entries: { type: [oneTimeReminderEntrySchema], default: [] },
  },
  { timestamps: true },
);

oneTimeReminderUserSchema.index({ userId: 1, "entries.key": 1 });
oneTimeReminderUserSchema.index({ "entries.sendAt": 1, "entries.sentAt": 1 });

module.exports =
  mongoose.models.OneTimeReminderUser ||
  (process.env.ONE_TIME_REMINDER_USER_COLLECTION
    ? model(
      "OneTimeReminderUser",
      oneTimeReminderUserSchema,
      String(process.env.ONE_TIME_REMINDER_USER_COLLECTION).trim(),
    )
    : model("OneTimeReminderUser", oneTimeReminderUserSchema));