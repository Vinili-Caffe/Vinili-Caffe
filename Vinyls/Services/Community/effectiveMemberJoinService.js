const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getSeenUser, setSeenUser } = require("./dailyStatsStore");

const REJOIN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const MEMBER_SEEN_SCOPE = "memberSeen";

function getMainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function discordMemberJoinedAt(member) {
  if (!member) return null;
  if (member.joinedAt instanceof Date && !Number.isNaN(member.joinedAt.getTime())) {
    return member.joinedAt;
  }
  const ts = Number(member.joinedTimestamp || 0);
  if (Number.isFinite(ts) && ts > 0) return new Date(ts);
  return null;
}

function pickEarlierDate(a, b) {
  const da = toDateOrNull(a);
  const db = toDateOrNull(b);
  if (da && db) return da.getTime() <= db.getTime() ? da : db;
  return da || db || null;
}

async function readStoredJoin(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return { firstJoinedAt: null, lastLeftAt: null };

  const [seen, profile] = await Promise.all([
    getSeenUser(MEMBER_SEEN_SCOPE, gid, uid).catch(() => null),
    ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.effectiveJoin")
      .lean()
      .catch(() => null),
  ]);

  const profileJoin = profile?.profile?.effectiveJoin || {};
  return {
    firstJoinedAt: pickEarlierDate(seen?.firstJoinedAt, profileJoin.firstJoinedAt),
    lastLeftAt: toDateOrNull(profileJoin.lastLeftAt) || toDateOrNull(seen?.lastLeftAt),
  };
}

async function writeStoredJoin(guildId, userId, payload) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return;

  const firstJoinedAt = payload?.firstJoinedAt !== undefined ? toDateOrNull(payload.firstJoinedAt) : undefined;
  const lastJoinedAt = payload?.lastJoinedAt !== undefined ? toDateOrNull(payload.lastJoinedAt) : undefined;
  const lastLeftAt = payload?.lastLeftAt === undefined ? undefined : toDateOrNull(payload.lastLeftAt);

  const seenPayload = {};
  if (firstJoinedAt) seenPayload.firstJoinedAt = firstJoinedAt;
  if (lastJoinedAt) seenPayload.lastJoinedAt = lastJoinedAt;
  if (lastLeftAt !== undefined) seenPayload.lastLeftAt = lastLeftAt;
  if (Object.keys(seenPayload).length) {
    const existing = await getSeenUser(MEMBER_SEEN_SCOPE, gid, uid).catch(() => null);
    await setSeenUser(MEMBER_SEEN_SCOPE, gid, uid, { ...existing, ...seenPayload });
  }

  const profileSet = {};
  if (firstJoinedAt) profileSet["profile.effectiveJoin.firstJoinedAt"] = firstJoinedAt;
  if (lastJoinedAt) profileSet["profile.effectiveJoin.lastJoinedAt"] = lastJoinedAt;
  if (lastLeftAt !== undefined) profileSet["profile.effectiveJoin.lastLeftAt"] = lastLeftAt;
  if (!Object.keys(profileSet).length) return;

  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $setOnInsert: { guildId: gid, userId: uid },
      $set: profileSet,
    },
    { upsert: true },
  ).catch((err) => {
    global.logger?.warn?.("[effectiveMemberJoin] profile upsert failed:", err?.message || err);
  });
}

async function recordEffectiveMemberJoin(member) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) return null;
  const guildId = getMainGuildId();
  if (!guildId || String(member.guild.id) !== guildId) return null;

  const userId = String(member.id);
  const now = new Date();
  const discordJoin = discordMemberJoinedAt(member) || now;
  const stored = await readStoredJoin(guildId, userId);
  const previousFirst = stored.firstJoinedAt;
  const lastLeftAt = stored.lastLeftAt;
  const leftMs = lastLeftAt ? lastLeftAt.getTime() : 0;
  const withinGrace =
    Boolean(previousFirst) &&
    leftMs > 0 &&
    now.getTime() - leftMs <= REJOIN_GRACE_MS;

  let firstJoinedAt;
  if (withinGrace) {
    firstJoinedAt = previousFirst;
  } else if (previousFirst && leftMs > 0 && now.getTime() - leftMs > REJOIN_GRACE_MS) {
    firstJoinedAt = discordJoin;
  } else if (previousFirst) {
    firstJoinedAt = pickEarlierDate(previousFirst, discordJoin) || discordJoin;
  } else {
    firstJoinedAt = discordJoin;
  }

  await writeStoredJoin(guildId, userId, {
    firstJoinedAt,
    lastJoinedAt: now,
    lastLeftAt: null,
  });
  return firstJoinedAt;
}

async function recordEffectiveMemberLeave(member) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) return;
  const guildId = getMainGuildId();
  if (!guildId || String(member.guild.id) !== guildId) return;

  const userId = String(member.id);
  const now = new Date();
  const stored = await readStoredJoin(guildId, userId);
  const firstJoinedAt = stored.firstJoinedAt || discordMemberJoinedAt(member) || now;

  await writeStoredJoin(guildId, userId, {
    firstJoinedAt,
    lastLeftAt: now,
  });
}

async function getEffectiveJoinedAt(member) {
  if (!member?.guild?.id || !member?.id) return null;
  const guildId = getMainGuildId();
  if (!guildId || String(member.guild.id) !== guildId) {
    return discordMemberJoinedAt(member);
  }

  const userId = String(member.id);
  const stored = await readStoredJoin(guildId, userId);
  if (stored.firstJoinedAt) return stored.firstJoinedAt;

  if (member.guild.members?.me?.id !== userId) {
    await recordEffectiveMemberJoin(member).catch(() => null);
    const after = await readStoredJoin(guildId, userId);
    if (after.firstJoinedAt) return after.firstJoinedAt;
  }

  return discordMemberJoinedAt(member);
}

function getEffectiveJoinedTimestamp(member) {
  return getEffectiveJoinedAt(member).then((date) => (date ? date.getTime() : 0));
}

module.exports = {
  REJOIN_GRACE_MS,
  recordEffectiveMemberJoin,
  recordEffectiveMemberLeave,
  getEffectiveJoinedAt,
  getEffectiveJoinedTimestamp,
  discordMemberJoinedAt,
};