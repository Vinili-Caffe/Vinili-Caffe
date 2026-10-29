const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("./communitySchemas") as typeof import("./communitySchemas");

function asQueryLike(run?) {
  return {
    lean() {
      return run();
    },
    then(resolve?, reject?) {
      return run().then(resolve, reject);
    },
    catch(reject?) {
      return run().catch(reject);
    },
  };
}

const MentionReaction = {
  findOne(filter?) {
    const run = async () => {
      const safeFilter = filter
        ? { guildId: String(filter.guildId || ""), userId: String(filter.userId || "") }
        : filter;
      const doc = await ActivityUserProfile.findOne(safeFilter)
        .select("guildId userId profile.mentionReaction.reactions")
        .lean()
        .catch(() => null);
      if (!doc) return null;
      return {
        guildId: doc.guildId,
        userId: doc.userId,
        reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
      };
    };
    return asQueryLike(run);
  },
  find(filter: Record<string, any> = {}) {
    const run = async () => {
      const docs = await ActivityUserProfile.find(filter)
        .select("guildId userId profile.mentionReaction.reactions")
        .lean()
        .catch(() => []);
      return docs.map((doc?) => ({
        guildId: doc.guildId,
        userId: doc.userId,
        reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
      }));
    };
    return asQueryLike(run);
  },
  findOneAndUpdate(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
    const run = async () => {
      const setPayload = update?.$set || {};
      const gid = String(filter?.guildId || "");
      const uid = String(filter?.userId || "");
      const safeFilter = { guildId: gid, userId: uid };
            if (!Object.prototype.hasOwnProperty.call(setPayload, "reactions")) {
        const existing = await ActivityUserProfile.findOne(safeFilter)
          .select("guildId userId profile.mentionReaction.reactions")
          .lean()
          .catch(() => null);
        if (!existing) return null;
        return {
          guildId: existing.guildId,
          userId: existing.userId,
          reactions: Array.isArray(existing?.profile?.mentionReaction?.reactions)
            ? existing.profile.mentionReaction.reactions
            : [],
        };
      }
      const nextReactions = Array.isArray(setPayload.reactions) ? setPayload.reactions : [];
      const doc = await ActivityUserProfile.findOneAndUpdate(
        safeFilter,
        {
          $setOnInsert: { guildId: gid, userId: uid },
          $set: { "profile.mentionReaction.reactions": nextReactions },
        },
        { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
      ).lean().catch((err?) => {
        global.logger?.error?.("[MentionReaction-DB] findOneAndUpdate error:", err);
        return null;
      });
      if (!doc) {
        global.logger?.warn?.("[MentionReaction-DB] findOneAndUpdate returned null", { filter: safeFilter });
        return null;
      }
      return {
        guildId: doc.guildId,
        userId: doc.userId,
        reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions) ? doc.profile.mentionReaction.reactions : [],
      };
    };
    return asQueryLike(run);
  },
  async deleteOne(filter?) {
    const safeFilter = filter
      ? { guildId: String(filter.guildId || ""), userId: String(filter.userId || "") }
      : filter;
    return ActivityUserProfile.updateOne(safeFilter, { $set: { "profile.mentionReaction.reactions": [] } }).catch(() => ({ modifiedCount: 0 }));
  },
};

export = {
  MentionReaction,
};