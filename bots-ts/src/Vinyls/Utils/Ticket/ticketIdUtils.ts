const mongoose = require("mongoose") as typeof import("mongoose");

function isDuplicateKeyError(err?) {
  return Boolean(
    err?.code === 11000 ||
      (err?.message && String(err.message).includes("E11000")),
  );
}

function isTicketNumberDuplicate(err?) {
  if (!isDuplicateKeyError(err)) return false;
  const msg = String(err?.message || "");
  return msg.includes("ticketNumber");
}

function normalizeTicketGuildId(guildId?) {
  const gid = String(guildId || "").trim();
  return /^\d{16,20}$/.test(gid) ? gid : "";
}

async function maxTicketNumberForGuild(guildId?) {
  const gid = normalizeTicketGuildId(guildId);
  if (!gid) return 0;
  const db = mongoose.connection?.db;
  let maxTicketNumber = 0;

  try {
    const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
    const agg = await GuildFeatureBucket.aggregate([
      { $match: { guildId: gid } },
      { $unwind: "$tickets" },
      { $match: { "tickets.ticketNumber": { $type: "number" } } },
      { $group: { _id: null, maxTicketNumber: { $max: "$tickets.ticketNumber" } } },
    ]).catch(() => []);
    maxTicketNumber = Math.max(maxTicketNumber, Number(agg?.[0]?.maxTicketNumber || 0) || 0);
  } catch {
      }

  if (db) {
    const legacy = await db
      .collection("tickets")
      .find({ guildId: gid, ticketNumber: { $type: "number" } })
      .project({ ticketNumber: 1 })
      .sort({ ticketNumber: -1 })
      .limit(1)
      .next()
      .catch(() => null);
    maxTicketNumber = Math.max(maxTicketNumber, Number(legacy?.ticketNumber || 0) || 0);
  }

  return Number.isFinite(maxTicketNumber) && maxTicketNumber > 0 ? maxTicketNumber : 0;
}

async function getNextTicketId(guildId?) {
  const gid = normalizeTicketGuildId(guildId);
  if (!gid) throw new Error("guildId required for per-guild ticket counter");
  if (mongoose.connection?.readyState !== 1) {
    throw new Error("MongoDB connection not ready for ticket counter");
  }

  const {
    GuildFeatureBucket,
    ensureGuildFeatureBucket,
  } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
  await ensureGuildFeatureBucket(gid);

    let updated = await GuildFeatureBucket.findOneAndUpdate(
    { guildId: gid, ticketCounter: { $gte: 1 } },
    { $inc: { ticketCounter: 1 } },
    { new: true },
  ).catch(() => null);
  if (updated) {
    const n = Number(updated.ticketCounter);
    if (Number.isFinite(n) && n > 0) return n;
  }

    const baseline = await maxTicketNumberForGuild(gid);
  const next = baseline + 1;
  updated = await GuildFeatureBucket.findOneAndUpdate(
    {
      guildId: gid,
      $or: [
        { ticketCounter: { $exists: false } },
        { ticketCounter: null },
        { ticketCounter: { $lt: 1 } },
      ],
    },
    { $set: { ticketCounter: next } },
    { new: true },
  ).catch(() => null);
  if (updated) {
    const n = Number(updated.ticketCounter);
    if (Number.isFinite(n) && n > 0) return n;
  }

    updated = await GuildFeatureBucket.findOneAndUpdate(
    { guildId: gid },
    { $inc: { ticketCounter: 1 } },
    { new: true },
  ).catch(() => null);
  const parsed = Number(updated?.ticketCounter);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error("Ticket counter returned an invalid value");
}

async function reseedCounterFromTickets(_TicketModel?, guildId?) {
  const gid = normalizeTicketGuildId(guildId);
  if (!gid) throw new Error("guildId required for ticket counter reseed");
  const {
    GuildFeatureBucket,
    ensureGuildFeatureBucket,
  } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
  await ensureGuildFeatureBucket(gid);
  const baseline = await maxTicketNumberForGuild(gid);
  await GuildFeatureBucket.updateOne(
    { guildId: gid },
    { $set: { ticketCounter: baseline } },
  );
  return baseline;
}

function isCounterUnavailableError(err?) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("mongodb connection not ready for ticket counter") ||
    msg.includes("guildid required for") ||
    msg.includes("topology is closed") ||
    msg.includes("client must be connected")
  );
}

async function createTicketDocWithGlobalId(TicketModel?, payload: Record<string, any> = {}, maxRetries = 12) {
  let lastError = null;
  let reseedAttempted = false;
  const guildId = normalizeTicketGuildId(payload?.guildId);
  const presetNumber = Number(payload?.ticketNumber);
  const hasPreset = Number.isFinite(presetNumber) && presetNumber > 0;
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      const ticketNumber = hasPreset
        ? Math.floor(presetNumber)
        : await getNextTicketId(guildId);
      const doc = await TicketModel.create({ ...payload, ticketNumber, guildId: guildId || payload?.guildId });
      return doc;
    } catch (err) {
      lastError = err;
      if (!isTicketNumberDuplicate(err)) throw err;
            if (hasPreset) throw err;
      if (!reseedAttempted) {
        reseedAttempted = true;
        await reseedCounterFromTickets(TicketModel, guildId).catch(() => null);
      }
    }
  }
  if (isCounterUnavailableError(lastError)) {
        const { ticketNumber: _ignored, ...rest } = payload || {};
    return TicketModel.create({ ...rest });
  }
  throw lastError || new Error("Unable to allocate unique ticketNumber");
}

export = {
  getNextTicketId,
  createTicketDocWithGlobalId,
  isCounterUnavailableError,
  isTicketNumberDuplicate,
  maxTicketNumberForGuild,
};
