const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");

const ONE_TIME_REMINDER_STORAGE_MODE = String(
  process.env.ONE_TIME_REMINDER_STORAGE_MODE || "compact",
)
  .trim()
  .toLowerCase();
const ONE_TIME_REMINDER_MAX_ENTRIES_PER_USER = Math.max(
  50,
  Number(process.env.ONE_TIME_REMINDER_MAX_ENTRIES_PER_USER) || 500,
);
let legacyOneTimeReminderModel = null;

function useCompactReminderStorage() {
  return (
    ONE_TIME_REMINDER_STORAGE_MODE === "compact" ||
    ONE_TIME_REMINDER_STORAGE_MODE === "dual"
  );
}

function useLegacyReminderStorage() {
  return (
    ONE_TIME_REMINDER_STORAGE_MODE === "legacy" ||
    ONE_TIME_REMINDER_STORAGE_MODE === "dual"
  );
}

function getLegacyOneTimeReminderModel() {
  if (!useLegacyReminderStorage()) return null;
  if (!legacyOneTimeReminderModel) {
    legacyOneTimeReminderModel = require("../../Schemas/Reminders/oneTimeReminderSchema");
  }
  return legacyOneTimeReminderModel;
}

async function ensureOneTimeReminderCompact({ key, userId, message, sendAt }) {
  const userIdStr = String(userId);
  const touchExisting = await ActivityUserProfile.updateOne(
    {
      guildId: ACTIVITY_MAIN_GUILD_ID,
      userId: userIdStr,
      "profile.globalOneTimeReminder.entries": { $elemMatch: { key: String(key), sentAt: null } },
    },
    {
      $set: {
        "profile.globalOneTimeReminder.entries.$.message": String(message),
        "profile.globalOneTimeReminder.entries.$.sendAt": new Date(sendAt),
      },
    },
  ).catch(() => ({ modifiedCount: 0 }));

  if ((touchExisting?.modifiedCount || 0) > 0) {
    return { ok: true, mode: "compact_existing" };
  }

  await ActivityUserProfile.findOneAndUpdate(
    { guildId: ACTIVITY_MAIN_GUILD_ID, userId: userIdStr },
    {
      $setOnInsert: { guildId: ACTIVITY_MAIN_GUILD_ID, userId: userIdStr },
      $push: {
        "profile.globalOneTimeReminder.entries": {
          $each: [
            {
              key: String(key),
              message: String(message),
              sendAt: new Date(sendAt),
              sentAt: null,
              createdAt: new Date(),
            },
          ],
          $slice: -ONE_TIME_REMINDER_MAX_ENTRIES_PER_USER,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { ok: true, mode: "compact_new" };
}

async function ensureOneTimeReminder({ key, userId, message, sendAt }) {
  if (!key || !userId || !message || !sendAt) return null;
  let pending = null;
  if (useLegacyReminderStorage()) {
    const OneTimeReminder = getLegacyOneTimeReminderModel();
    pending = await OneTimeReminder.findOneAndUpdate(
      { key, sentAt: null },
      { $set: { userId, message, sendAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    if (!pending) {
      pending = await OneTimeReminder.findOneAndUpdate(
        { key },
        { $setOnInsert: { key, userId, message, sendAt } },
        { upsert: true, new: true },
      ).catch(() => null);
    }
  }
  if (useCompactReminderStorage()) {
    await ensureOneTimeReminderCompact({ key, userId, message, sendAt });
  }
  return pending;
}

async function loadDueCompactReminders(now, limit = 100) {
  return ActivityUserProfile.aggregate([
    { $match: { guildId: ACTIVITY_MAIN_GUILD_ID } },
    { $unwind: "$profile.globalOneTimeReminder.entries" },
    {
      $match: {
        "profile.globalOneTimeReminder.entries.sentAt": null,
        "profile.globalOneTimeReminder.entries.sendAt": { $lte: now },
      },
    },
    { $sort: { "profile.globalOneTimeReminder.entries.sendAt": 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        userId: "$userId",
        key: "$profile.globalOneTimeReminder.entries.key",
        message: "$profile.globalOneTimeReminder.entries.message",
        sendAt: "$profile.globalOneTimeReminder.entries.sendAt",
      },
    },
  ]).catch(() => []);
}

async function claimCompactReminder(row, now) {
  if (!row?.userId || !row?.key || !row?.sendAt) return null;
  const claim = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: ACTIVITY_MAIN_GUILD_ID,
      userId: String(row.userId),
      "profile.globalOneTimeReminder.entries": {
        $elemMatch: {
          key: String(row.key),
          sentAt: null,
          sendAt: new Date(row.sendAt),
        },
      },
    },
    {
      $set: { "profile.globalOneTimeReminder.entries.$.sentAt": now },
    },
    { new: true },
  ).catch(() => null);
  return claim ? row : null;
}

async function revertCompactReminder(row) {
  if (!row?.userId || !row?.key) return;
  await ActivityUserProfile.updateOne(
    {
      guildId: ACTIVITY_MAIN_GUILD_ID,
      userId: String(row.userId),
      "profile.globalOneTimeReminder.entries": {
        $elemMatch: {
          key: String(row.key),
        },
      },
    },
    {
      $set: { "profile.globalOneTimeReminder.entries.$.sentAt": null },
    },
  ).catch(() => {});
}

async function runDueOneTimeReminders(client) {
  const now = new Date();
  let due = [];
  if (useCompactReminderStorage()) {
    due = await loadDueCompactReminders(now, 100);
  }
  if (!due.length && useLegacyReminderStorage()) {
    const OneTimeReminder = getLegacyOneTimeReminderModel();
    due = await OneTimeReminder.find({ sentAt: null, sendAt: { $lte: now } })
      .sort({ sendAt: 1 })
      .limit(100)
      .lean();
  }
  if (!due.length) return;
  for (const row of due) {
    let claimed = null;
    if (useCompactReminderStorage() && row?.userId && row?.key) {
      claimed = await claimCompactReminder(row, now);
    }
    if (!claimed && useLegacyReminderStorage() && row?._id) {
      const OneTimeReminder = getLegacyOneTimeReminderModel();
      claimed = await OneTimeReminder.findOneAndUpdate(
        { _id: row._id, sentAt: null },
        { $set: { sentAt: now } },
        { new: true },
      ).catch(() => null);
    }
    if (!claimed) continue;
    try {
      const user =
        client.users.cache.get(String(claimed.userId)) ||
        (await client.users.fetch(String(claimed.userId)).catch(() => null));
      if (!user) {
        if (useCompactReminderStorage()) await revertCompactReminder(claimed);
        if (useLegacyReminderStorage() && claimed?._id) {
          const OneTimeReminder = getLegacyOneTimeReminderModel();
          await OneTimeReminder.updateOne(
            { _id: claimed._id },
            { $set: { sentAt: null } },
          ).catch(() => {});
        }
        continue;
      }
      await user.send(claimed.message);
    } catch (error) {
      global.logger?.error?.("[REMINDER] Failed to send reminder", error);
      if (useCompactReminderStorage()) await revertCompactReminder(claimed);
      if (useLegacyReminderStorage() && claimed?._id) {
        const OneTimeReminder = getLegacyOneTimeReminderModel();
        await OneTimeReminder.updateOne(
          { _id: claimed._id },
          { $set: { sentAt: null } },
        ).catch(() => {});
      }
    }
  }
}

module.exports = { ensureOneTimeReminder, runDueOneTimeReminders };