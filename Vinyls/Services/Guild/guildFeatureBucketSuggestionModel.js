const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../Schemas/Guild/guildFeatureBucketSchema");

const COUNTER_FILTER = {
  ChannelID: "__counter__",
  Msg: "__counter__",
  AuthorID: "__system__",
};

function isCounterSuggestion(s) {
  return (
    String(s?.ChannelID || "") === COUNTER_FILTER.ChannelID &&
    String(s?.Msg || "") === COUNTER_FILTER.Msg &&
    String(s?.AuthorID || "") === COUNTER_FILTER.AuthorID
  );
}

const suggestion = {
  async findOne(filter) {
    const guildId = String(filter?.GuildID || "");
    const msgId = String(filter?.Msg || "");
    if (!guildId || !msgId) return null;
    const bucket = await GuildFeatureBucket.findOne({
      guildId,
      "suggestions.Msg": msgId,
    }).catch(() => null);
    if (!bucket) return null;
    const sub = bucket.suggestions.find((s) => String(s.Msg) === msgId && !isCounterSuggestion(s));
    return sub || null;
  },

  async findOneAndUpdate(filter, update, opts = {}) {
    const guildId = String(filter?.GuildID || "");
    if (!guildId) return null;
    const isCounter =
      String(filter.ChannelID || "") === COUNTER_FILTER.ChannelID &&
      String(filter.Msg || "") === COUNTER_FILTER.Msg &&
      String(filter.AuthorID || "") === COUNTER_FILTER.AuthorID;
    if (!isCounter) return null;
    const bucket = await ensureGuildFeatureBucket(guildId);
    const inc = Number(update?.$inc?.count || 0);
    if (inc) bucket.suggestionCounter = Math.max(0, Number(bucket.suggestionCounter || 0) + inc);
    if (update?.$setOnInsert) {
      if (!Array.isArray(bucket.suggestions)) bucket.suggestions = [];
    }
    await bucket.save();
    const out = {
      GuildID: guildId,
      ...COUNTER_FILTER,
      count: bucket.suggestionCounter,
      sID: "__counter__",
      Upmembers: [],
      Downmembers: [],
      upvotes: 0,
      downvotes: 0,
    };
    if (opts.new === false) return null;
    return out;
  },

  async create(doc) {
    const guildId = String(doc.GuildID || "");
    if (!guildId) throw new Error("suggestion.create: GuildID required");
    const bucket = await ensureGuildFeatureBucket(guildId);
    const { GuildID: _g, ...rest } = doc;
    bucket.suggestions.push(rest);
    await bucket.save();
    return bucket.suggestions[bucket.suggestions.length - 1];
  },

  async deleteOne(filter) {
    const id = filter?._id;
    if (!id) return { deletedCount: 0 };
    const bucket = await GuildFeatureBucket.findOne({ "suggestions._id": id }).catch(() => null);
    if (!bucket) return { deletedCount: 0 };
    bucket.suggestions.pull(id);
    await bucket.save();
    return { deletedCount: 1 };
  },

  async saveEmbedded(subdoc) {
    if (!subdoc) return null;
    const root =
      typeof subdoc.ownerDocument === "function"
        ? subdoc.ownerDocument()
        : null;
    if (!root || typeof root.save !== "function") return null;
    try {
      return await root.save();
    } catch {
      return null;
    }
  },
};

module.exports = suggestion;
module.exports.COUNTER_FILTER = COUNTER_FILTER;