
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths") as typeof import("../../Utils/Community/activityUserProfilePaths");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { violationKeyLabelIt } = require("../utils/modRegolamentoConstants") as typeof import("../utils/modRegolamentoConstants");
const { BAD_USER_CACHE, isDbReady } = require("./automodExempt") as typeof import("./automodExempt");

const AUTO_TIMEOUT_PROFILE = new Map();
const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60_000;

function getAutoTimeoutProfileKey(message?) {
  return `${String(message?.guildId || "")}:${String(message?.author?.id || "")}`;
}

function isSafeRegolaBucketId(bucketId?) {
  const b = String(bucketId || "").trim();
  return /^[0-9]+_[0-9]+$/.test(b) && b.length <= 12;
}

async function getRegolaTimeoutStrikeCount(userId?, bucketId?) {
  if (!isSafeRegolaBucketId(bucketId) || !isDbReady()) return 0;
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(ACTIVITY_MAIN_GUILD_ID, uid)) return 0;
  try {
    const doc = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: uid },
      { _id: 0, moderation: 1 },
    )
      .lean()
      .catch(() => null);
    const strikes = doc?.moderation?.automodBadUser?.regolaTimeoutStrikes || {};
    return Math.max(0, Math.min(100, Number(strikes[String(bucketId)] || 0)));
  } catch {
    return 0;
  }
}

async function incrementRegolaTimeoutStrike(userId?, bucketId?) {
  if (!isSafeRegolaBucketId(bucketId) || !isDbReady()) return;
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(ACTIVITY_MAIN_GUILD_ID, uid)) return;
  const path = `${automodBadUser("regolaTimeoutStrikes")}.${String(bucketId).trim()}`;
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: uid },
      { $inc: { [path]: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(uid);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

function pickSortedViolations(violations = []) {
  return [...(Array.isArray(violations) ? violations : [])]
    .map((v?) => ({
      key: String(v?.key || "unknown").trim(),
      heat: Number(v?.heat || 0),
      info: v?.info ? String(v.info).trim() : "",
    }))
    .filter((v?) => v.key && v.key !== "unknown")
    .sort((a?, b?) => b.heat - a.heat);
}

function firstViolationLabel(violations = []) {
  const sorted = pickSortedViolations(violations);
  if (!sorted.length) return "Violazione regolamento";
  return violationKeyLabelIt(sorted[0].key);
}

export = { AUTO_TIMEOUT_PROFILE, DISCORD_TIMEOUT_MAX_MS, getAutoTimeoutProfileKey, getRegolaTimeoutStrikeCount, incrementRegolaTimeoutStrike, pickSortedViolations, firstViolationLabel };
