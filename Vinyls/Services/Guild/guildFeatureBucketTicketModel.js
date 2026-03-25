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
    this.projection = projection;
    this._lean = false;
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
    const buckets = await findBucketsForTicketFilter(filter);
    const $set = update?.$set || {};
    for (const bucket of buckets) {
      const t = findTicketSubdocInBucket(bucket, filter);
      if (!t) continue;
      Object.assign(t, $set);
      await bucket.save();
      return opts.new !== false ? t : null;
    }
    return null;
  },

  async updateOne(filter, update) {
    const buckets = await findBucketsForTicketFilter(filter);
    const $set = update?.$set || {};
    for (const bucket of buckets) {
      const t = findTicketSubdocInBucket(bucket, filter);
      if (!t) continue;
      Object.assign(t, $set);
      await bucket.save();
      return { modifiedCount: 1, matchedCount: 1 };
    }
    return { modifiedCount: 0, matchedCount: 0 };
  },

  async create(payload) {
    const guildId = String(payload.guildId || "");
    if (!guildId) throw new Error("Ticket.create: guildId required");
    const bucket = await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = payload;
    bucket.tickets.push(rest);
    await bucket.save();
    return bucket.tickets[bucket.tickets.length - 1];
  },
};

module.exports = Ticket;
module.exports.Ticket = Ticket;