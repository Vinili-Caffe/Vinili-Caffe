/** Ticket nel database: lettura dei ticket salvati col modello vecchio (collezione legacy). */
const mongoose = require("mongoose") as typeof import("mongoose");

let LegacyTicketModel = null;
function getLegacyTicketModel() {
  if (LegacyTicketModel) return LegacyTicketModel;
  if (mongoose.models.LegacyTicketDoc) {
    LegacyTicketModel = mongoose.models.LegacyTicketDoc;
    return LegacyTicketModel;
  }
    const schema = new mongoose.Schema(
    {
      ticketNumber: Number,
      guildId: String,
      userId: String,
      channelId: String,
      ticketType: String,
      panelId: String,
      userTag: String,
      open: Boolean,
      claimedBy: String,
      createdAt: Date,
      closedAt: Date,
      closeReason: String,
      closedBy: String,
      descriptionSubmitted: Boolean,
      transcriptViewToken: String,
      transcriptViewExpiresAt: Date,
      transcriptHtmlPath: String,
      hasTranscript: Boolean,
      ratingScore: Number,
    },
    { collection: "tickets", strict: false },
  );
  LegacyTicketModel = mongoose.model("LegacyTicketDoc", schema);
  return LegacyTicketModel;
}

function coerceTicketOpen(value?) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
}

function legacyMongoFilter(filter?) {
  if (!filter || typeof filter !== "object") return null;
  const q: Record<string, any> = {};
  if (filter._id) q._id = filter._id;
  if (filter.channelId != null) q.channelId = String(filter.channelId);
  if (filter.guildId != null) q.guildId = String(filter.guildId);
  if (filter.userId != null) q.userId = String(filter.userId);
  if (filter.ticketType != null) q.ticketType = String(filter.ticketType);
  if (filter.ticketNumber != null) q.ticketNumber = Number(filter.ticketNumber);
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy") && !Array.isArray(filter.$or)) {
    q.claimedBy = filter.claimedBy;
  }
  if (filter.open !== undefined) {
        if (coerceTicketOpen(filter.open)) {
      q.open = { $in: [true, 1, "1", "true"] };
    } else {
      q.open = { $in: [false, 0, "0", "false", null] };
    }
  }
  if (filter.transcriptViewToken) {
    q.transcriptViewToken = String(filter.transcriptViewToken);
  }
  return q;
}

async function findLegacyTickets(filter?, projection?) {
  try {
    const Legacy = getLegacyTicketModel();
    const q = legacyMongoFilter(filter);
    if (!q || !Object.keys(q).length) return [];
    let query = Legacy.find(q);
    if (projection && typeof projection === "object") query = query.select(projection);
    const rows = await query.lean().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

async function findLegacyTicketOne(filter?, projection?) {
  try {
    const Legacy = getLegacyTicketModel();
    const q = legacyMongoFilter(filter);
    if (!q || !Object.keys(q).length) return null;
    let query = Legacy.findOne(q);
    if (projection && typeof projection === "object") query = query.select(projection);
    return await query.lean().catch(() => null);
  } catch (_) {
    return null;
  }
}

export = { getLegacyTicketModel, coerceTicketOpen, findLegacyTickets, findLegacyTicketOne };
