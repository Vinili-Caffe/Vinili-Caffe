const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const DISCADIA_PENDING_VOTES_PATH = "profile.totals.exp.bumpVoteRewards.discadia_vote.pendingVotes";
const DEDUPE_WINDOW_MS = 3 * 60 * 1000;
const MAX_PENDING_PER_USER = 8;

function resolveGuildId(guildId?) {
  return String(guildId || IDs.guilds?.main || "").trim();
}

function normalizeVoteListing(listing?) {
  return String(listing || "discadia").trim().toLowerCase() === "topgg" ? "topgg" : "discadia";
}

function listingMatchFilter(listing?) {
  const normalized = normalizeVoteListing(listing);
  if (normalized === "topgg") return { listing: "topgg" };
    return { $or: [{ listing: "discadia" }, { listing: { $exists: false } }, { listing: null }] };
}

async function enqueuePendingVote(guildId?, userId?, meta: Record<string, any> = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !/^\d{17,22}$/.test(uid)) return { ok: false, reason: "invalid" };

  const listing = normalizeVoteListing(meta.listing);
  const now = new Date();
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS);
  const existing = await ActivityUserProfile.findOne({
    guildId: gid,
    userId: uid,
    [DISCADIA_PENDING_VOTES_PATH]: {
      $elemMatch: {
        processed: { $ne: true },
        receivedAt: { $gte: since },
        ...listingMatchFilter(listing),
      },
    },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (existing) return { ok: true, duplicate: true };

  const entry = {
    receivedAt: now,
    attempts: 0,
    processed: false,
    listing,
    source: String(meta.source || "http").slice(0, 32),
    rawSnippet: String(meta.rawSnippet || "").slice(0, 240),
  };

  await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    {
      $setOnInsert: { guildId: gid, userId: uid },
      $push: {
        [DISCADIA_PENDING_VOTES_PATH]: {
          $each: [entry],
          $slice: -MAX_PENDING_PER_USER,
        },
      },
    },
    { upsert: true },
  ).catch(() => null);

  return { ok: true, duplicate: false };
}

async function enqueuePendingDiscadiaVote(guildId?, userId?, meta: Record<string, any> = {}) {
  return enqueuePendingVote(guildId, userId, { ...meta, listing: "discadia" });
}

async function enqueuePendingTopggVote(guildId?, userId?, meta: Record<string, any> = {}) {
  return enqueuePendingVote(guildId, userId, { ...meta, listing: "topgg" });
}

async function listUsersWithPendingDiscadiaVotes(guildId?, limit = 25) {
  const gid = resolveGuildId(guildId);
  if (!gid) return [];
  return ActivityUserProfile.find({
    guildId: gid,
    [`${DISCADIA_PENDING_VOTES_PATH}.0`]: { $exists: true },
  })
    .select(`userId ${DISCADIA_PENDING_VOTES_PATH}`)
    .limit(Math.max(1, Math.min(100, Number(limit) || 25)))
    .catch(() => []);
}

async function setPendingDiscadiaVotes(guildId?, userId?, votes?) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { [DISCADIA_PENDING_VOTES_PATH]: Array.isArray(votes) ? votes : [] } },
  ).catch(() => null);
}

export = {
  enqueuePendingDiscadiaVote,
  enqueuePendingTopggVote,
  listUsersWithPendingDiscadiaVotes,
  setPendingDiscadiaVotes,
  resolveGuildId,
  normalizeVoteListing,
};
