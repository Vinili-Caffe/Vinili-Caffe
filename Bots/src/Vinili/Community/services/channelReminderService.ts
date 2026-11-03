const crypto = require("crypto") as typeof import("crypto");
const { ChannelReminder } = require("../schemas/channelReminderSchema") as typeof import("../schemas/channelReminderSchema");

const MAX_PENDING_PER_USER = 10;
const MAX_REASON_LENGTH = 500;
const SHORT_ID_BYTES = 3;
const DUE_BATCH_LIMIT = 100;

function makeShortId() {
  return crypto.randomBytes(SHORT_ID_BYTES).toString("hex");
}

async function countPendingForUser(userId?) {
  return ChannelReminder.countDocuments({
    userId: String(userId),
    sentAt: null,
  }).catch(() => 0);
}

async function createChannelReminder({
  guildId,
  channelId,
  userId,
  reason,
  sendAt,
}: {
  guildId?;
  channelId?;
  userId?;
  reason?;
  sendAt?;
} = {}) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const uid = String(userId || "").trim();
  const text = String(reason || "").trim();
  const when = sendAt instanceof Date ? sendAt : new Date(sendAt);

  if (!gid || !cid || !uid || !text || !Number.isFinite(when.getTime())) {
    return { ok: false, error: "invalid_input" };
  }
  if (text.length > MAX_REASON_LENGTH) {
    return { ok: false, error: "reason_too_long", max: MAX_REASON_LENGTH };
  }
  if (when.getTime() <= Date.now()) {
    return { ok: false, error: "not_future" };
  }

  const pending = await countPendingForUser(uid);
  if (pending >= MAX_PENDING_PER_USER) {
    return { ok: false, error: "limit", max: MAX_PENDING_PER_USER, pending };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const shortId = makeShortId();
    try {
      const doc = await ChannelReminder.create({
        guildId: gid,
        channelId: cid,
        userId: uid,
        reason: text,
        sendAt: when,
        sentAt: null,
        shortId,
        createdAt: new Date(),
      });
      return { ok: true, reminder: doc };
    } catch (err: any) {
      if (err?.code === 11000) continue;
      global.logger?.error?.("[CHANNEL-REMINDER] create failed", err);
      return { ok: false, error: "db" };
    }
  }
  return { ok: false, error: "short_id" };
}

async function listPendingForUser(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  return ChannelReminder.find({ userId: uid, sentAt: null })
    .sort({ sendAt: 1 })
    .lean()
    .catch(() => []);
}

async function cancelByShortId({ userId, shortId }: { userId?; shortId? } = {}) {
  const uid = String(userId || "").trim();
  const sid = String(shortId || "").trim().toLowerCase();
  if (!uid || !sid) return { ok: false, error: "invalid_input" };

  const deleted = await ChannelReminder.findOneAndDelete({
    userId: uid,
    shortId: sid,
    sentAt: null,
  })
    .lean()
    .catch(() => null);

  if (!deleted) return { ok: false, error: "not_found" };
  return { ok: true, reminder: deleted };
}

async function loadDueChannelReminders(now?, limit = DUE_BATCH_LIMIT) {
  return ChannelReminder.find({
    sentAt: null,
    sendAt: { $lte: now },
  })
    .sort({ sendAt: 1 })
    .limit(limit)
    .lean()
    .catch(() => []);
}

async function claimChannelReminder(row?, now?) {
  if (!row?._id) return null;
  const claimed = await ChannelReminder.findOneAndUpdate(
    { _id: row._id, sentAt: null },
    { $set: { sentAt: now } },
    { new: true },
  )
    .lean()
    .catch(() => null);
  return claimed || null;
}

function channelLooksUnwritable(channel?) {
  if (!channel || typeof channel.send !== "function") return true;
  try {
    if (typeof channel.permissionsFor === "function" && channel.guild?.members?.me) {
      const perms = channel.permissionsFor(channel.guild.members.me);
      if (perms && !perms.has?.("SendMessages")) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function runDueChannelReminders(client?) {
  if (!client) return;
  const now = new Date();
  const due = await loadDueChannelReminders(now, DUE_BATCH_LIMIT);
  if (!due || !due.length) return;

  for (const row of due) {
    const claimed = await claimChannelReminder(row, now);
    if (!claimed) continue;

    try {
      const channel =
        client.channels?.cache?.get?.(String(claimed.channelId)) ||
        (await client.channels?.fetch?.(String(claimed.channelId)).catch(() => null));

      if (channelLooksUnwritable(channel)) {
        global.logger?.warn?.(
          `[CHANNEL-REMINDER] Channel unwritable, marked sent shortId=${claimed.shortId} channelId=${claimed.channelId}`,
        );
        continue;
      }

      const reason = String(claimed.reason || "").trim() || "(nessun motivo)";
      await channel.send({
        content: `<@${claimed.userId}> Reminder: ${reason}`,
        allowedMentions: { users: [String(claimed.userId)] },
      });
    } catch (error) {
      global.logger?.error?.(
        `[CHANNEL-REMINDER] Failed to send shortId=${claimed.shortId}`,
        error,
      );
      /* already claimed — no infinite retry */
    }
  }
}

export = {
  MAX_PENDING_PER_USER,
  MAX_REASON_LENGTH,
  createChannelReminder,
  listPendingForUser,
  cancelByShortId,
  runDueChannelReminders,
};
