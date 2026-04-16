const mongoose = require("mongoose");
const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../Schemas/Guild/guildFeatureBucketSchema");

function matchesClaimedByOr(t, filter) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyClaim = filter.$or.every((c) => Object.prototype.hasOwnProperty.call(c, "claimedBy"));
  if (!onlyClaim) return true;
  return filter.$or.some((clause) => {
    if (clause.claimedBy === null || clause.claimedBy === "") {
      return t.claimedBy == null || String(t.claimedBy).trim() === "";
    }
    if (clause.claimedBy?.$exists === false) return t.claimedBy == null;
    return false;
  });
}

function matchesAutoCloseOr(t, filter) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyAuto = filter.$or.every((c) => Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"));
  if (!onlyAuto) return true;
  return filter.$or.some((clause) => {
    if (clause.autoClosePromptSentAt?.$exists === false) return t.autoClosePromptSentAt == null;
    if (clause.autoClosePromptSentAt === null) return t.autoClosePromptSentAt == null;
    return false;
  });
}

function ticketMatchesFilter(t, filter) {
  if (!t || !filter) return false;
  if (filter._id && String(t._id) !== String(filter._id)) return false;
  if (filter.channelId !== undefined && String(t.channelId) !== String(filter.channelId)) return false;
  if (filter.open !== undefined && Boolean(t.open) !== Boolean(filter.open)) return false;
  if (filter.guildId !== undefined && String(t.guildId || "") !== String(filter.guildId)) return false;
  if (filter.userId !== undefined && String(t.userId) !== String(filter.userId)) return false;
  if (filter.ticketNumber !== undefined && Number(t.ticketNumber) !== Number(filter.ticketNumber)) return false;
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy") && !Array.isArray(filter.$or)) {
    if (String(t.claimedBy || "") !== String(filter.claimedBy || "")) return false;
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ratingScore")) {
    if (filter.ratingScore === null && t.ratingScore != null) return false;
  }
  if (filter.createdAt?.$lte) {
    const ca = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (ca > filter.createdAt.$lte.getTime()) return false;
  }
  if (!matchesClaimedByOr(t, filter)) return false;
  if (!matchesAutoCloseOr(t, filter)) return false;
  return true;
}

function projectTicketFields(row, projection) {
  if (!projection) return row;
  const out = {};
  for (const k of Object.keys(projection)) {
    if (projection[k]) out[k] = row[k];
  }
  return out;
}

async function findBucketsForTicketFilter(filter) {
  if (filter._id) {
    const b = await GuildFeatureBucket.findOne({ "tickets._id": filter._id }).catch(() => null);
    return b ? [b] : [];
  }
  if (filter.channelId) {
    const b = await GuildFeatureBucket.findOne({ "tickets.channelId": String(filter.channelId) }).catch(() => null);
    return b ? [b] : [];
  }
  if (filter.guildId) {
    const b = await GuildFeatureBucket.findOne({ guildId: String(filter.guildId) }).catch(() => null);
    return b ? [b] : [];
  }
  return GuildFeatureBucket.find({}).catch(() => []);
}

function findTicketSubdocInBucket(bucket, filter) {
  if (!bucket?.tickets) return null;
  return bucket.tickets.find((t) => ticketMatchesFilter(t, filter)) || null;
}

async function resolveTicketRef(filter) {
  const buckets = await findBucketsForTicketFilter(filter);
  for (const bucket of buckets) {
    const t = findTicketSubdocInBucket(bucket, filter);
    if (!t?._id) continue;
    return { bucketId: bucket._id, ticketId: t._id };
  }
  return null;
}

function toTicketSet(update) {
  const $set = update?.$set || {};
  const out = {};
  for (const [key, value] of Object.entries($set)) {
    if (!key) continue;
    out[`tickets.$[t].${key}`] = value;
  }
  return out;
}

function buildTicketArrayFilter(filter, ticketId) {
  const arrayFilter = { "t._id": ticketId };
  if (Object.prototype.hasOwnProperty.call(filter, "channelId")) {
    arrayFilter["t.channelId"] = String(filter.channelId);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "open")) {
    arrayFilter["t.open"] = Boolean(filter.open);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "guildId")) {
    arrayFilter["t.guildId"] = String(filter.guildId);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "userId")) {
    arrayFilter["t.userId"] = String(filter.userId);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ticketNumber")) {
    arrayFilter["t.ticketNumber"] = Number(filter.ticketNumber);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy")) {
    arrayFilter["t.claimedBy"] = filter.claimedBy;
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ratingScore")) {
    arrayFilter["t.ratingScore"] = filter.ratingScore;
  }
  if (Object.prototype.hasOwnProperty.call(filter, "autoClosePromptSentAt")) {
    arrayFilter["t.autoClosePromptSentAt"] = filter.autoClosePromptSentAt;
  }
  if (Array.isArray(filter.$or) && filter.$or.length > 0) {
    const claimOnly = filter.$or.every((c) =>
      Object.prototype.hasOwnProperty.call(c, "claimedBy"),
    );
    const autoCloseOnly = filter.$or.every((c) =>
      Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"),
    );
    if (claimOnly) {
      arrayFilter.$or = filter.$or.map((clause) => {
        if (clause.claimedBy?.$exists === false) {
          return { "t.claimedBy": { $exists: false } };
        }
        return { "t.claimedBy": clause.claimedBy };
      });
    } else if (autoCloseOnly) {
      arrayFilter.$or = filter.$or.map((clause) => {
        if (clause.autoClosePromptSentAt?.$exists === false) {
          return { "t.autoClosePromptSentAt": { $exists: false } };
        }
        return { "t.autoClosePromptSentAt": clause.autoClosePromptSentAt };
      });
    }
  }
  return arrayFilter;
}

async function readTicketByRef(bucketId, ticketId) {
  const fresh = await GuildFeatureBucket.findById(bucketId).catch(() => null);
  if (!fresh?.tickets) return null;
  return fresh.tickets.id(ticketId) || null;
}

class TicketFindQuery {
  constructor(filter, projection) {
    this.filter = filter;
    this.projection = projection;
    this._limit = null;
    this._lean = false;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const all = await GuildFeatureBucket.find({}).catch(() => []);
    const rows = [];
    for (const bucket of all) {
      for (const t of bucket.tickets || []) {
        if (!ticketMatchesFilter(t, this.filter)) continue;
        if (this._lean) {
          const o = t.toObject ? t.toObject() : { ...t };
          rows.push(projectTicketFields(o, this.projection));
        } else {
          rows.push(t);
        }
        if (this._limit != null && rows.length >= this._limit) return rows;
      }
    }
    return rows;
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

class TicketFindOneQuery {
  constructor(filter, projection) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._lean = false;
  }

  select(fields) {
    if (fields == null) return this;
    const proj = {};
    if (typeof fields === "string") {
      for (const k of String(fields).split(/\s+/)) {
        const key = k.trim();
        if (key) proj[key] = 1;
      }
    } else if (typeof fields === "object" && !Array.isArray(fields)) {
      Object.assign(proj, fields);
    }
    this.projection = { ...(this.projection || {}), ...proj };
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const buckets = await findBucketsForTicketFilter(this.filter);
    for (const bucket of buckets) {
      const t = findTicketSubdocInBucket(bucket, this.filter);
      if (!t) continue;
      if (this._lean) {
        const o = t.toObject ? t.toObject() : { ...t };
        return projectTicketFields(o, this.projection);
      }
      return t;
    }
    return null;
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

const Ticket = {
  findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return GuildFeatureBucket.findOne({ "tickets._id": id }).then((bucket) => {
      if (!bucket) return null;
      return bucket.tickets.id(id) || null;
    });
  },

  findOne(filter, projection) {
    if (!filter || typeof filter !== "object") return Promise.resolve(null);
    return new TicketFindOneQuery(filter, projection);
  },

  find(filter, projection) {
    return new TicketFindQuery(filter, projection);
  },

  async findOneAndUpdate(filter, update, opts = {}) {
    const ref = await resolveTicketRef(filter);
    if (!ref) return null;
    const $set = toTicketSet(update);
    if (!Object.keys($set).length) {
      return opts.new !== false ? readTicketByRef(ref.bucketId, ref.ticketId) : null;
    }
    const arrayFilter = buildTicketArrayFilter(filter, ref.ticketId);
    const result = await GuildFeatureBucket.updateOne(
      { _id: ref.bucketId },
      { $set },
      { arrayFilters: [arrayFilter] },
    ).catch(() => null);
    if (!result || Number(result.matchedCount || 0) < 1) return null;
    return opts.new !== false ? readTicketByRef(ref.bucketId, ref.ticketId) : null;
  },

  async updateOne(filter, update) {
    const ref = await resolveTicketRef(filter);
    if (!ref) return { modifiedCount: 0, matchedCount: 0 };
    const $set = toTicketSet(update);
    if (!Object.keys($set).length) return { modifiedCount: 0, matchedCount: 1 };
    const arrayFilter = buildTicketArrayFilter(filter, ref.ticketId);
    const result = await GuildFeatureBucket.updateOne(
      { _id: ref.bucketId },
      { $set },
      { arrayFilters: [arrayFilter] },
    ).catch(() => null);
    if (!result) return { modifiedCount: 0, matchedCount: 0 };
    return {
      modifiedCount: Number(result.modifiedCount || 0),
      matchedCount: Number(result.matchedCount || 0),
    };
  },

  async create(payload) {
    const guildId = String(payload.guildId || "");
    if (!guildId) throw new Error("Ticket.create: guildId required");
    await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = payload;
    const ticketId = new mongoose.Types.ObjectId();
    await GuildFeatureBucket.updateOne(
      { guildId },
      { $push: { tickets: { ...rest, _id: ticketId } } },
    );
    return Ticket.findById(ticketId);
  },
};

module.exports = Ticket;
module.exports.Ticket = Ticket;