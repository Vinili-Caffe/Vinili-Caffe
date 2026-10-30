const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");

const COUNTER_FILTER_QUESTION = "__counter__";

function isNonCounterPoll(p?) {
  return Boolean(p && String(p.domanda || "") !== COUNTER_FILTER_QUESTION);
}

function matchesSourceOrClause(p?, clause?) {
  if (!clause) return true;
  if (clause.source === "manual") return !p.source || p.source === "manual";
  if (clause.source?.$exists === false) return !p.source;
  if (clause.source === "auto") return p.source === "auto";
  if (Array.isArray(clause.source?.$in)) {
    return clause.source.$in.some((s?) => {
      if (s === "manual") return !p.source || p.source === "manual";
      return String(p.source || "") === String(s);
    });
  }
  return true;
}

function matchPollEntry(p?, filter?) {
  if (!isNonCounterPoll(p)) return false;
  if (filter.pollcount != null && Number(p.pollcount) !== Number(filter.pollcount)) return false;
  if (filter.domanda?.$ne != null && String(p.domanda || "") === String(filter.domanda.$ne)) return false;
  if (filter.domanda?.$regex) {
    const re = filter.domanda.$regex;
    if (!re.test(String(p.domanda || ""))) return false;
  }
  if (filter.source === "auto" && String(p.source || "") !== "auto") return false;
  if (filter.autoSlot != null && String(p.autoSlot || "") !== String(filter.autoSlot)) return false;
  if (Array.isArray(filter.$or)) {
    const ok = filter.$or.some((clause?) => matchesSourceOrClause(p, clause));
    if (!ok) return false;
  }
  return true;
}

function pickSortKey(a?, b?, spec?) {
  const keys = Object.keys(spec || {});
  for (const k of keys) {
    const dir = spec[k] >= 0 ? 1 : -1;
    const av = a[k];
    const bv = b[k];
    if (av === bv) continue;
    if (av == null) return dir;
    if (bv == null) return -dir;
    if (av > bv) return dir;
    if (av < bv) return -dir;
  }
  return 0;
}

function projectPollFields(p?, guildId?, projection?) {
  const o = p.toObject ? p.toObject() : { ...p };
  o.guildId = guildId;
  if (!projection) return o;
  const keys = Object.keys(projection);
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (projection[k]) out[k] = o[k];
  }
  if (projection._id) out._id = o._id;
  return out;
}

function wrapPollSubdoc(bucket?, subdoc?) {
  if (!subdoc) return null;
  const sub = subdoc;
  return {
    _id: sub._id,
    get pollcount() {
      return sub.pollcount;
    },
    set pollcount(v) {
      sub.pollcount = v;
    },
    get domanda() {
      return sub.domanda;
    },
    set domanda(v) {
      sub.domanda = v;
    },
    get messageId() {
      return sub.messageId;
    },
    set messageId(v) {
      sub.messageId = v;
    },
    get source() {
      return sub.source;
    },
    set source(v) {
      sub.source = v;
    },
    get createdAt() {
      return sub.createdAt;
    },
    get updatedAt() {
      return sub.updatedAt;
    },
    toObject() {
      return projectPollFields(sub, bucket.guildId, null);
    },
    deleteOne() {
      bucket.polls.pull(sub._id);
      return bucket.save();
    },
  };
}

class PollFindOneQuery {
  declare _lean: any;
  declare _select: any;
  declare _sort: any;
  declare filter: any;
  declare guildId: any;
  constructor(guildId?, filter?) {
    this.guildId = guildId;
    this.filter = filter;
    this._sort = null;
    this._select = null;
    this._lean = false;
  }

  sort(spec?) {
    this._sort = spec;
    return this;
  }

  select(spec?) {
    this._select = spec;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const bucket = await GuildFeatureBucket.findOne({ guildId: this.guildId }).catch(() => null);
    if (!bucket) return null;
    let list = bucket.polls.filter((p?) => matchPollEntry(p, this.filter));
    if (this._sort) {
      list = [...list].sort((a?, b?) => pickSortKey(a, b, this._sort));
    }
    const pick = list[0] || null;
    if (!pick) return null;
    if (this._lean) {
      return projectPollFields(pick, bucket.guildId, this._select || { _id: 1 });
    }
    return wrapPollSubdoc(bucket, pick);
  }

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

class PollFindQuery {
  declare _lean: any;
  declare _limit: any;
  declare _sort: any;
  declare filter: any;
  declare guildId: any;
  declare projection: any;
  constructor(guildId?, filter?, projection?) {
    this.guildId = guildId;
    this.filter = filter;
    this.projection = projection;
    this._sort = null;
    this._limit = null;
    this._lean = false;
  }

  sort(spec?) {
    this._sort = spec;
    return this;
  }

  limit(n?) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const bucket = await GuildFeatureBucket.findOne({ guildId: this.guildId }).catch(() => null);
    if (!bucket) return [];
    let list = bucket.polls.filter((p?) => matchPollEntry(p, this.filter));
    if (this._sort) {
      list = [...list].sort((a?, b?) => pickSortKey(a, b, this._sort));
    }
    if (this._limit != null) list = list.slice(0, this._limit);
    return list.map((p?) => {
      if (this._lean) return projectPollFields(p, bucket.guildId, this.projection);
      return projectPollFields(p, bucket.guildId, this.projection);
    });
  }

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

const Poll = {
  findOne(filter?) {
    const guildId = String(filter?.guildId || "");
    if (!guildId) return Promise.resolve(null);
    return new PollFindOneQuery(guildId, filter);
  },

  async findOneAndUpdate(filter?, update?, opts: Record<string, any> = {}) {
    const guildId = String(filter?.guildId || "");
    if (!guildId) return null;
    if (filter.domanda === COUNTER_FILTER_QUESTION) {
      const bucket = await ensureGuildFeatureBucket(guildId);
      const inc = Number(update?.$inc?.pollcount || 0);
      if (inc) bucket.pollCounter = Math.max(0, Number(bucket.pollCounter || 0) + inc);
      if (update?.$set?.pollcount != null) {
        bucket.pollCounter = Number(update.$set.pollcount);
      }
      await bucket.save();
      const out = {
        guildId,
        domanda: COUNTER_FILTER_QUESTION,
        pollcount: bucket.pollCounter,
      };
      if (opts.new === false) return null;
      return out;
    }
    return null;
  },

  async create(doc?) {
    const guildId = String(doc.guildId || "");
    if (!guildId) throw new Error("Poll.create: guildId required");
    const bucket = await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = doc;
    bucket.polls.push(rest);
    await bucket.save();
    const sub = bucket.polls[bucket.polls.length - 1];
    return wrapPollSubdoc(bucket, sub);
  },

  async countDocuments(filter?) {
    const guildId = String(filter?.guildId || "");
    if (!guildId) return 0;
    const bucket = await GuildFeatureBucket.findOne({ guildId }).lean().catch(() => null);
    if (!bucket || !Array.isArray(bucket.polls)) return 0;
    const start = filter.createdAt?.$gte;
    const end = filter.createdAt?.$lt;
    return bucket.polls.filter((p?) => {
      if (!matchPollEntry(p, filter)) return false;
      if (start && end) {
        const ca = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        if (ca < start.getTime() || ca >= end.getTime()) return false;
      }
      return true;
    }).length;
  },

  find(filter?, projection?) {
    const guildId = String(filter?.guildId || "");
    if (!guildId) return Promise.resolve([]);
    return new PollFindQuery(guildId, filter, projection);
  },

  async updateOne(filter?, update?) {
    const id = filter._id;
    if (!id) return { modifiedCount: 0 };
    const bucket = await GuildFeatureBucket.findOne({ "polls._id": id }).catch(() => null);
    if (!bucket) return { modifiedCount: 0 };
    const sub = bucket.polls.id(id);
    if (!sub) return { modifiedCount: 0 };
    const set = update.$set || {};
    Object.assign(sub, set);
    await bucket.save();
    return { modifiedCount: 1 };
  },
};

module.exports = Poll;
module.exports.COUNTER_FILTER_QUESTION = COUNTER_FILTER_QUESTION;