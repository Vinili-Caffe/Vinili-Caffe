const mongoose = require("mongoose") as typeof import("mongoose");
const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../schemas/guildFeatureBucketSchema") as typeof import("../../schemas/guildFeatureBucketSchema");
const { getLegacyTicketModel, coerceTicketOpen, findLegacyTickets, findLegacyTicketOne } = require("./ticketLegacyStore") as typeof import("./ticketLegacyStore");
const { mergeTicketRows, ticketMatchesFilter, projectTicketFields, guildFeatureBucketListProjection, ticketIdMongoQuery, findBucketsForTicketFilter, findTicketSubdocInBucket, resolveTicketRef, toTicketSet, ticketIdArrayFilterClause, buildTicketArrayFilter, ticketUpdateSatisfied, readTicketByRef, updateBucketTicketSet, execTicketFindAllBuckets } = require("./ticketBucketStore") as typeof import("./ticketBucketStore");


class TicketFindQuery {
  declare _lean: any;
  declare _limit: any;
  declare filter: any;
  declare projection: any;
  constructor(filter?, projection?) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._limit = null;
    this._lean = false;
  }

  select(fields?) {
    if (fields == null) return this;
    const proj: Record<string, any> = {};
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

  limit(n?) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const f = this.filter || {};
    if (f && typeof f === "object" && Array.isArray(f.$or) && f.$or.length) {
      const bucketRows = await execTicketFindAllBuckets(this);
      const legacyRows = await findLegacyTickets(f, this.projection);
      const merged = mergeTicketRows(
        Array.isArray(bucketRows) ? bucketRows : [],
        (legacyRows || []).map((o?) => projectTicketFields(o, this.projection)),
      );
      if (this._limit != null && merged.length > this._limit) return merged.slice(0, this._limit);
      return merged;
    }
    const gid = f.guildId != null ? String(f.guildId) : "";
    if (gid) {
      const bucket = await GuildFeatureBucket.findOne({ guildId: gid })
        .select(guildFeatureBucketListProjection())
        .catch(() => null);
      const rows = [];
      for (const t of bucket?.tickets || []) {
        if (!ticketMatchesFilter(t, f)) continue;
        if (this._lean) {
          const o = t.toObject ? t.toObject() : { ...t };
          rows.push(projectTicketFields(o, this.projection));
        } else {
          rows.push(t);
        }
      }
      const legacyRows = await findLegacyTickets(f, this.projection);
      const projectedLegacy = (legacyRows || []).map((o?) =>
        this._lean || this.projection ? projectTicketFields(o, this.projection) : o,
      );
      let merged = mergeTicketRows(rows, projectedLegacy);
      if (Object.prototype.hasOwnProperty.call(f, "open") && f.open === false && merged.length > 1) {
        merged.sort((a?, b?) => {
          const ta = a.closedAt ? new Date(a.closedAt).getTime() : a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.closedAt ? new Date(b.closedAt).getTime() : b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        });
      }
      if (this._limit != null && merged.length > this._limit) {
        return merged.slice(0, this._limit);
      }
      return merged;
    }
    return execTicketFindAllBuckets(this);
  }

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

class TicketFindOneQuery {
  declare _lean: any;
  declare filter: any;
  declare projection: any;
  constructor(filter?, projection?) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._lean = false;
  }

  select(fields?) {
    if (fields == null) return this;
    const proj: Record<string, any> = {};
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
    const legacy = await findLegacyTicketOne(this.filter, this.projection);
    if (!legacy) return null;
    return this._lean || this.projection ? projectTicketFields(legacy, this.projection) : legacy;
  }

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

const Ticket = {
  findById(id?) {
    const idQuery = ticketIdMongoQuery(id);
    if (idQuery == null || idQuery === "") return Promise.resolve(null);
        return GuildFeatureBucket.collection
      .findOne(
        { "tickets._id": idQuery },
        { projection: { guildId: 1, tickets: { $elemMatch: { _id: idQuery } } } },
      )
      .then(async (bucket?) => {
        if (bucket?.tickets?.length) {
          const sid = String(id);
          const hit =
            bucket.tickets.find((t?) => String(t?._id) === sid) || bucket.tickets[0] || null;
          if (hit) {
            hit.guildId = String(hit.guildId || bucket.guildId || "").trim();
            return hit;
          }
        }
                const raw = await GuildFeatureBucket.collection
          .findOne({ "tickets._id": idQuery }, { projection: { guildId: 1, "tickets._id": 1 } })
          .catch(() => null);
        if (raw?.tickets?.length) {
          const sid = String(id);
          const idx = raw.tickets.findIndex((t?) => String(t?._id) === sid);
          if (idx >= 0) {
            const full = await GuildFeatureBucket.collection
              .findOne(
                { _id: raw._id },
                { projection: { guildId: 1, [`tickets.${idx}`]: 1 } },
              )
              .catch(() => null);
            const hit2 = full?.tickets?.[idx] || null;
            if (hit2) {
              hit2.guildId = String(hit2.guildId || full.guildId || "").trim();
              return hit2;
            }
          }
        }
        try {
          const Legacy = getLegacyTicketModel();
          return await Legacy.findById(id).lean().catch(() => null);
        } catch (_) {
          return null;
        }
      })
      .catch(() => null);
  },

  findOneByTranscriptViewToken(token?) {
    const t = String(token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(t)) return Promise.resolve(null);
        return GuildFeatureBucket.collection
      .findOne(
        { "tickets.transcriptViewToken": t },
        { projection: { guildId: 1, tickets: { $elemMatch: { transcriptViewToken: t } } } },
      )
      .then(async (bucket?) => {
        if (bucket?.tickets?.length) {
          const sub =
            bucket.tickets.find((x?) => String(x.transcriptViewToken || "").toLowerCase() === t) ||
            bucket.tickets[0];
          if (sub) {
            const plain = { ...sub };
            plain.guildId = String(plain.guildId || bucket.guildId || "").trim();
            return plain;
          }
        }
        return findLegacyTicketOne({ transcriptViewToken: t });
      })
      .catch(() => findLegacyTicketOne({ transcriptViewToken: t }));
  },

  findOne(filter?, projection?) {
    if (!filter || typeof filter !== "object") return Promise.resolve(null);
    return new TicketFindOneQuery(filter, projection);
  },

  find(filter?, projection?) {
    return new TicketFindQuery(filter, projection);
  },

  async findOneAndUpdate(filter?, update?, opts: Record<string, any> = {}) {
    const ref = await resolveTicketRef(filter);
    if (!ref) {
            try {
        const Legacy = getLegacyTicketModel();
        const doc = await Legacy.findOneAndUpdate(filter, update, {
          new: opts.new !== false,
          lean: true,
        }).catch(() => null);
        return doc;
      } catch (_) {
        return null;
      }
    }
    const $set = toTicketSet(update);
    if (!Object.keys($set).length) {
      return opts.new !== false ? readTicketByRef(ref.bucketId, ref.ticketId) : null;
    }
    const arrayFilter = buildTicketArrayFilter(filter, ref.ticketId);
    let result: any = await updateBucketTicketSet(ref.bucketId, $set, arrayFilter);
        if (result && Number(result.modifiedCount || 0) < 1) {
      const current = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (current && ticketUpdateSatisfied(current, $set)) {
                return opts.new !== false ? current : null;
      }
      if (filter.open === true && current && coerceTicketOpen(current.open) !== true) {
                return null;
      }
            result = await updateBucketTicketSet(ref.bucketId, $set, {
        "t._id": ticketIdArrayFilterClause(ref.ticketId),
      });
      if (result && Number(result.modifiedCount || 0) < 1 && filter.channelId) {
        result = await updateBucketTicketSet(ref.bucketId, $set, {
          "t.channelId": String(filter.channelId),
        });
      }
    }
    if (!result || (Number(result.modifiedCount || 0) < 1 && Number(result.matchedCount || 0) < 1)) {
      const current = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (current && ticketUpdateSatisfied(current, $set)) {
        return opts.new !== false ? current : null;
      }
      return null;
    }
    const fresh = opts.new !== false ? await readTicketByRef(ref.bucketId, ref.ticketId) : null;
    if (opts.new !== false) {
      if (!fresh) {
        global.logger?.warn?.(
          `[Ticket.findOneAndUpdate] ticket non leggibile bucket=${String(ref.bucketId)} ticket=${String(ref.ticketId)}`,
        );
        return null;
      }
      if (ticketUpdateSatisfied(fresh, $set)) return fresh;
      let forced: any = await updateBucketTicketSet(ref.bucketId, $set, {
        "t._id": ticketIdArrayFilterClause(ref.ticketId),
      });
      if (forced && Number(forced.modifiedCount || 0) < 1 && filter.channelId) {
        forced = await updateBucketTicketSet(ref.bucketId, $set, {
          "t.channelId": String(filter.channelId),
        });
      }
      const again = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (again && ticketUpdateSatisfied(again, $set)) return again;
      global.logger?.warn?.(
        `[Ticket.findOneAndUpdate] $set non persistito ticket=${String(ref.ticketId)} keys=${Object.keys($set).join(",")} matched=${Number(result?.matchedCount || 0)} modified=${Number(result?.modifiedCount || 0)}`,
      );
      return null;
    }
    return null;
  },

  async updateOne(filter?, update?) {
            const doc = await this.findOneAndUpdate(filter, update, { new: true });
    if (!doc) return { modifiedCount: 0, matchedCount: 0 };
    return { modifiedCount: 1, matchedCount: 1 };
  },

  async create(payload?) {
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