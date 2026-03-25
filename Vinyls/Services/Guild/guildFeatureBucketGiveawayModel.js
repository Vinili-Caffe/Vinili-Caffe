const mongoose = require("mongoose");
const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../Schemas/Guild/guildFeatureBucketSchema");

function giveawayMatchesFilter(g, filter) {
  if (!g || !filter || typeof filter !== "object") return false;
  if (filter._id !== undefined && String(g._id) !== String(filter._id)) return false;
  if (filter.messageId !== undefined && String(g.messageId || "") !== String(filter.messageId || "")) return false;
  if (filter.ended !== undefined && Boolean(g.ended) !== Boolean(filter.ended)) return false;
  if (filter.guildId !== undefined && String(g.guildId || "") !== String(filter.guildId || "")) return false;
  if (filter.channelId !== undefined && String(g.channelId || "") !== String(filter.channelId || "")) return false;
  if (filter.endAt?.$lte) {
    const t = g.endAt ? new Date(g.endAt).getTime() : 0;
    if (t > filter.endAt.$lte.getTime()) return false;
  }
  return true;
}

function projectGiveawayFields(row, projection) {
  if (!projection) return row;
  const out = {};
  for (const k of Object.keys(projection)) {
    if (projection[k]) out[k] = row[k];
  }
  return out;
}

function toPlainGiveaway(g) {
  if (!g) return null;
  return g.toObject ? g.toObject() : { ...g };
}

async function findBucketsForGiveawayFilter(filter) {
  if (!filter || typeof filter !== "object") return [];
  if (filter._id) {
    const b = await GuildFeatureBucket.findOne({ "giveaways._id": filter._id }).catch(() => null);
    return b ? [b] : [];
  }
  if (filter.messageId !== undefined) {
    const b = await GuildFeatureBucket.findOne({ "giveaways.messageId": String(filter.messageId) }).catch(() => null);
    return b ? [b] : [];
  }
  if (filter.guildId !== undefined) {
    const b = await GuildFeatureBucket.findOne({ guildId: String(filter.guildId) }).catch(() => null);
    return b ? [b] : [];
  }
  return GuildFeatureBucket.find({}).catch(() => []);
}

function findGiveawaySubdocInBucket(bucket, filter) {
  if (!bucket?.giveaways) return null;
  return bucket.giveaways.find((g) => giveawayMatchesFilter(g, filter)) || null;
}

function isScheduledDueFilter(filter) {
  if (!filter || typeof filter !== "object") return false;
  const keys = Object.keys(filter);
  return (
    keys.length === 2 &&
    filter.ended === false &&
    filter.endAt &&
    typeof filter.endAt === "object" &&
    filter.endAt.$lte instanceof Date
  );
}

class GiveawayFindQuery {
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
    if (isScheduledDueFilter(this.filter)) {
      const cutoff = this.filter.endAt.$lte;
      const buckets = await GuildFeatureBucket.find({
        giveaways: { $elemMatch: { ended: false, endAt: { $lte: cutoff } } },
      }).catch(() => []);
      const rows = [];
      for (const bucket of buckets) {
        for (const g of bucket.giveaways || []) {
          if (!giveawayMatchesFilter(g, this.filter)) continue;
          const plain = toPlainGiveaway(g);
          rows.push(this._lean ? projectGiveawayFields(plain, this.projection) : g);
          if (this._limit != null && rows.length >= this._limit) return rows;
        }
      }
      return rows;
    }

    const all = await GuildFeatureBucket.find({}).catch(() => []);
    const rows = [];
    for (const bucket of all) {
      for (const g of bucket.giveaways || []) {
        if (!giveawayMatchesFilter(g, this.filter)) continue;
        if (this._lean) {
          const plain = toPlainGiveaway(g);
          rows.push(projectGiveawayFields(plain, this.projection));
        } else {
          rows.push(g);
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

class GiveawayFindOneQuery {
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
    const buckets = await findBucketsForGiveawayFilter(this.filter);
    for (const bucket of buckets) {
      const g = findGiveawaySubdocInBucket(bucket, this.filter);
      if (!g) continue;
      if (this._lean) {
        const plain = toPlainGiveaway(g);
        return projectGiveawayFields(plain, this.projection);
      }
      return g;
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

class GiveawayFindByIdQuery {
  constructor(id) {
    this.id = id;
    this._lean = false;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    if (!mongoose.Types.ObjectId.isValid(this.id)) return null;
    const bucket = await GuildFeatureBucket.findOne({ "giveaways._id": this.id }).catch(() => null);
    if (!bucket) return null;
    const g = bucket.giveaways.id(this.id);
    if (!g) return null;
    return this._lean ? toPlainGiveaway(g) : g;
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

const Giveaway = {
  findById(id) {
    return new GiveawayFindByIdQuery(id);
  },

  findOne(filter, projection) {
    if (!filter || typeof filter !== "object") return Promise.resolve(null);
    return new GiveawayFindOneQuery(filter, projection);
  },

  find(filter, projection) {
    return new GiveawayFindQuery(filter, projection);
  },

  async findOneAndUpdate(filter, update, opts = {}) {
    const buckets = await findBucketsForGiveawayFilter(filter);
    const $set = update?.$set && typeof update.$set === "object" ? update.$set : {};
    const $addToSet = update?.$addToSet;
    for (const bucket of buckets) {
      const g = findGiveawaySubdocInBucket(bucket, filter);
      if (!g) continue;
      if ($addToSet?.participants != null) {
        const uid = String($addToSet.participants);
        if (!Array.isArray(g.participants)) g.participants = [];
        if (!g.participants.includes(uid)) g.participants.push(uid);
      }
      Object.assign(g, $set);
      await bucket.save();
      return opts.new !== false ? g : null;
    }
    return null;
  },

  async updateOne(filter, update) {
    const buckets = await findBucketsForGiveawayFilter(filter);
    const $set = update?.$set && typeof update.$set === "object" ? update.$set : {};
    for (const bucket of buckets) {
      const g = findGiveawaySubdocInBucket(bucket, filter);
      if (!g) continue;
      Object.assign(g, $set);
      await bucket.save();
      return { modifiedCount: 1, matchedCount: 1 };
    }
    return { modifiedCount: 0, matchedCount: 0 };
  },

  async create(payload) {
    const guildId = String(payload.guildId || "");
    if (!guildId) throw new Error("Giveaway.create: guildId required");
    const bucket = await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = payload;
    bucket.giveaways.push(rest);
    await bucket.save();
    return bucket.giveaways[bucket.giveaways.length - 1];
  },
};

module.exports = Giveaway;
module.exports.Giveaway = Giveaway;