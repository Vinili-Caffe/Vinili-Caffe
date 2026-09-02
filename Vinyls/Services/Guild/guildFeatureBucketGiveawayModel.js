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
  if (filter.cancelled !== undefined) {
    if (filter.cancelled && typeof filter.cancelled === "object" && filter.cancelled.$ne !== undefined) {
      if (Boolean(g.cancelled) === Boolean(filter.cancelled.$ne)) return false;
    } else if (Boolean(g.cancelled) !== Boolean(filter.cancelled)) {
      return false;
    }
  }
  if (filter.guildId !== undefined && String(g.guildId || "") !== String(filter.guildId || "")) return false;
  if (filter.channelId !== undefined && String(g.channelId || "") !== String(filter.channelId || "")) return false;
  if (filter.endAt?.$lte) {
    const t = g.endAt ? new Date(g.endAt).getTime() : 0;
    if (t > filter.endAt.$lte.getTime()) return false;
  }
  if (filter.endAt?.$gt) {
    const t = g.endAt ? new Date(g.endAt).getTime() : 0;
    if (t <= filter.endAt.$gt.getTime()) return false;
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

function toObjectId(id) {
  const raw = String(id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
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

function isUpcomingActiveFilter(filter) {
  if (!filter || typeof filter !== "object") return false;
  return (
    filter.ended === false &&
    filter.endAt &&
    typeof filter.endAt === "object" &&
    filter.endAt.$gt instanceof Date
  );
}

function buildAtomicGiveawayUpdate(filter, update) {
  const oid = toObjectId(filter?._id);
  if (!oid) return null;

  const arrayFilter = { "g._id": oid };
  if (filter.ended !== undefined) arrayFilter["g.ended"] = Boolean(filter.ended);
  if (filter.cancelled !== undefined) arrayFilter["g.cancelled"] = Boolean(filter.cancelled);
  if (filter.messageId !== undefined) arrayFilter["g.messageId"] = String(filter.messageId);

  const mongoUpdate = {};
  const $set = update?.$set && typeof update.$set === "object" ? update.$set : null;
  const $addToSet = update?.$addToSet && typeof update.$addToSet === "object" ? update.$addToSet : null;
  const $pull = update?.$pull && typeof update.$pull === "object" ? update.$pull : null;

  if ($set && Object.keys($set).length) {
    mongoUpdate.$set = {};
    for (const [key, value] of Object.entries($set)) {
      mongoUpdate.$set[`giveaways.$[g].${key}`] = value;
    }
  }
  if ($addToSet?.participants != null) {
    mongoUpdate.$addToSet = {
      ...(mongoUpdate.$addToSet || {}),
      "giveaways.$[g].participants": String($addToSet.participants),
    };
  }
  if ($pull?.participants != null) {
    mongoUpdate.$pull = {
      ...(mongoUpdate.$pull || {}),
      "giveaways.$[g].participants": String($pull.participants),
    };
  }

  if (!Object.keys(mongoUpdate).length) return null;

  return {
    query: { "giveaways._id": oid },
    update: mongoUpdate,
    arrayFilters: [arrayFilter],
    oid,
  };
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
    if (isScheduledDueFilter(this.filter) || isUpcomingActiveFilter(this.filter)) {
      const elem = { ended: false };
      if (this.filter.endAt?.$lte) elem.endAt = { $lte: this.filter.endAt.$lte };
      if (this.filter.endAt?.$gt) elem.endAt = { ...(elem.endAt || {}), $gt: this.filter.endAt.$gt };
      if (this.filter.cancelled?.$ne != null) elem.cancelled = { $ne: this.filter.cancelled.$ne };
      else if (this.filter.cancelled !== undefined) elem.cancelled = Boolean(this.filter.cancelled);

      const buckets = await GuildFeatureBucket.find({
        giveaways: { $elemMatch: elem },
      }).catch(() => []);
      const rows = [];
      for (const bucket of buckets) {
        for (const g of bucket.giveaways || []) {
          if (!giveawayMatchesFilter(g, this.filter)) continue;
          if (this.filter.cancelled?.$ne === true && g.cancelled) continue;
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
    const built = buildAtomicGiveawayUpdate(filter, update);
    if (!built) return null;

    const bucket = await GuildFeatureBucket.findOneAndUpdate(built.query, built.update, {
      arrayFilters: built.arrayFilters,
      new: true,
    }).catch((err) => {
      global.logger?.warn?.("[giveawayModel] findOneAndUpdate:", err?.message || err);
      return null;
    });
    if (!bucket) return null;

    const g = bucket.giveaways?.id?.(built.oid) || bucket.giveaways?.find((row) => String(row._id) === String(built.oid));
    if (!g) return null;
    if (opts.new === false) return null;
    return toPlainGiveaway(g);
  },

  async updateOne(filter, update) {
    const built = buildAtomicGiveawayUpdate(filter, update);
    if (!built) return { modifiedCount: 0, matchedCount: 0 };

    const result = await GuildFeatureBucket.updateOne(built.query, built.update, {
      arrayFilters: built.arrayFilters,
    }).catch((err) => {
      global.logger?.warn?.("[giveawayModel] updateOne:", err?.message || err);
      return null;
    });

    const modifiedCount = Number(result?.modifiedCount || 0);
    const matchedCount = Number(result?.matchedCount || 0);
    return { modifiedCount, matchedCount };
  },

  async create(payload) {
    const guildId = String(payload.guildId || "");
    if (!guildId) throw new Error("Giveaway.create: guildId required");
    await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = payload;
    const entry = { ...rest, guildId, _id: new mongoose.Types.ObjectId() };

    const bucket = await GuildFeatureBucket.findOneAndUpdate(
      { guildId },
      { $push: { giveaways: entry } },
      { new: true },
    );
    if (!bucket) throw new Error("Giveaway.create: bucket update failed");
    const created =
      bucket.giveaways?.id?.(entry._id) ||
      bucket.giveaways?.find((row) => String(row._id) === String(entry._id)) ||
      entry;
    return toPlainGiveaway(created);
  },
};

module.exports = Giveaway;
module.exports.Giveaway = Giveaway;
