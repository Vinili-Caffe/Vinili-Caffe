const mongoose = require("mongoose") as typeof import("mongoose");

const { Schema, model, models } = mongoose;

const COLLECTION = "channelreminders";

const channelReminderSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    reason: { type: String, required: true, maxlength: 500 },
    sendAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    shortId: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: COLLECTION,
  },
);

channelReminderSchema.index({ sentAt: 1, sendAt: 1 });
channelReminderSchema.index({ userId: 1, sentAt: 1 });

const ChannelReminder: import("mongoose").Model<
  import("mongoose").InferSchemaType<typeof channelReminderSchema>
> = models.ChannelReminder || model("ChannelReminder", channelReminderSchema, COLLECTION);

export = {
  COLLECTION,
  ChannelReminder,
  channelReminderSchema,
};
