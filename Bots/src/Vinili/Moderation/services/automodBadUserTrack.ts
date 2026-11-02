/** Automod: profilo bad-user, strike timeout e snapshot membro. */
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths") as typeof import("../../Utils/Community/activityUserProfilePaths");
const { isExtraOwner } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { isJoinGateSuspiciousAccount } = require("./joinGateSuspiciousService") as typeof import("./joinGateSuspiciousService");
const { nowMs } = require("./automodText") as typeof import("./automodText");
const { BAD_USER_CACHE, USER_STATE, isDbReady, getCachedBadUser, setCachedBadUser, isAutoModRoleExemptMember } = require("./automodExempt") as typeof import("./automodExempt");
const { AUTO_TIMEOUT_PROFILE, DISCORD_TIMEOUT_MAX_MS, getAutoTimeoutProfileKey, firstViolationLabel } = require("./automodBadUser") as typeof import("./automodBadUser");
const { createAutomodUserActions } = require("./automodDecisions") as typeof import("./automodDecisions");
const { isExempt } = require("./automodHeat") as typeof import("./automodHeat");
const {
  getAutoTimeoutRegularMs,
  getAutoTimeoutCapMs,
  getAutoTimeoutCapStrike,
  isAutoTimeoutMultiplierEnabled,
  getAutoTimeoutMultiplierPercent,
  getAutoTimeoutProfileResetMs,
} = require("./automodRuntime") as typeof import("./automodRuntime");

function computeNextAutoTimeoutDuration(message?, at = nowMs(), options: Record<string, any> = {}) {
  const AUTO_TIMEOUT_REGULAR_MS = getAutoTimeoutRegularMs();
  const AUTO_TIMEOUT_CAP_MS = getAutoTimeoutCapMs();
  const AUTO_TIMEOUT_CAP_STRIKE = getAutoTimeoutCapStrike();
  const AUTO_TIMEOUT_MULTIPLIER_ENABLED = isAutoTimeoutMultiplierEnabled();
  const AUTO_TIMEOUT_MULTIPLIER_PERCENT = getAutoTimeoutMultiplierPercent();
  const AUTO_TIMEOUT_PROFILE_RESET_MS = getAutoTimeoutProfileResetMs();
  const dryRun = Boolean(options.dryRun);
  const key = getAutoTimeoutProfileKey(message);
  if (!key || key.startsWith(":")) {
    return { durationMs: AUTO_TIMEOUT_REGULAR_MS, strike: 1, capReached: false };
  }
  const stored = AUTO_TIMEOUT_PROFILE.get(key) || { strikes: 0, currentDurationMs: AUTO_TIMEOUT_REGULAR_MS, lastAt: 0, capReached: false, };
  const existing = dryRun ? { ...stored } : stored;
  if (at - Number(existing.lastAt || 0) > AUTO_TIMEOUT_PROFILE_RESET_MS) {
    existing.strikes = 0;
    existing.currentDurationMs = AUTO_TIMEOUT_REGULAR_MS;
    existing.capReached = false;
  }

  const nextStrike = Number(existing.strikes || 0) + 1;
  let durationMs = AUTO_TIMEOUT_REGULAR_MS;
  if (nextStrike < AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_REGULAR_MS;
  } else if (nextStrike === AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  } else if (AUTO_TIMEOUT_MULTIPLIER_ENABLED) {
    const base = Math.max(AUTO_TIMEOUT_CAP_MS, Number(existing.currentDurationMs || AUTO_TIMEOUT_CAP_MS),);
    durationMs = Math.round(base * (AUTO_TIMEOUT_MULTIPLIER_PERCENT / 100));
    existing.capReached = true;
  } else {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  }

  durationMs = Math.max(60_000, Math.min(DISCORD_TIMEOUT_MAX_MS, durationMs));
  existing.strikes = nextStrike;
  existing.currentDurationMs = durationMs;
  existing.lastAt = at;
  if (!dryRun) {
    AUTO_TIMEOUT_PROFILE.set(key, existing);
  }
  return { durationMs, strike: nextStrike, capReached: Boolean(existing.capReached) };
}

function isBadUserProfileStale(profile?, at = nowMs()) {
  const lastActionAt = profile?.lastActionAt ? new Date(profile.lastActionAt).getTime() : 0;
  if (!Number.isFinite(lastActionAt) || lastActionAt <= 0) return false;
  return at - lastActionAt > getAutoTimeoutProfileResetMs();
}

function shouldSkipAutomodBadUserDbWrite(message?) {
  if (!message) return true;
  if (message.author?.bot || message.system) return true;
  const guildId = String(message.guildId || message.guild?.id || "");
  const userId = String(message.author?.id || "");
  if (!userId) return true;
  if (guildId && isExtraOwner(guildId, userId)) return true;
  if (isExempt(message)) return true;
  return false;
}

async function getBadUserProfile(userId?, guildId = "") {
  const cached = getCachedBadUser(userId);
  if (cached !== undefined) {
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    if (!cached) {
      return joinGateSuspicious
        ? {
          suspicious: true,
          warnPoints: 0,
          activeStrikes: 0,
          activeStrikeReasons: [],
          timeoutActions: 0,
          totalTriggers: 0,
        }
        : null;
    }
    return {
      ...cached,
      suspicious: Boolean(joinGateSuspicious),
    };
  }
  if (!isDbReady()) {
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    return joinGateSuspicious
      ? {
        suspicious: true,
        warnPoints: 0,
        activeStrikes: 0,
        activeStrikeReasons: [],
        timeoutActions: 0,
        totalTriggers: 0,
      }
      : null;
  }
  try {
    const doc = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(userId) },
      {
        _id: 0,
        userId: 1,
        [automodBadUser()]: 1,
      },
    )
      .lean()
      .catch(() => null);
    const amSub = automodBadUser()
      .split(".")
      .reduce((acc?, k?) => acc?.[k], doc);
    const row = amSub ? { userId: doc.userId, ...amSub } : null;
    if (!row) {
      setCachedBadUser(userId, null, 15_000);
      const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
      return joinGateSuspicious
        ? {
          suspicious: true,
          warnPoints: 0,
          activeStrikes: 0,
          activeStrikeReasons: [],
          timeoutActions: 0,
          totalTriggers: 0,
        }
        : null;
    }

    const at = nowMs();
    const stale = isBadUserProfileStale(row, at);
    const regolaRaw = row.regolaTimeoutStrikes;
    const hadRegolaStrikes =
      regolaRaw &&
      typeof regolaRaw === "object" &&
      Object.keys(regolaRaw).some((k?) => Number(regolaRaw[k] || 0) > 0);
    const regolaTimeoutStrikes =
      stale || typeof regolaRaw !== "object" || regolaRaw === null ? {} : { ...regolaRaw };
    const normalized = {
      ...row,
      warnPoints: stale ? 0 : Math.max(0, Number(row.warnPoints || 0)),
      activeStrikes: stale ? 0 : Math.max(0, Number(row.activeStrikes || 0)),
      activeStrikeReasons: stale ? [] : (Array.isArray(row.activeStrikeReasons) ? row.activeStrikeReasons : []),
      regolaTimeoutStrikes,
    };

    if (
      stale &&
      (Number(row.warnPoints || 0) > 0 ||
        Number(row.activeStrikes || 0) > 0 ||
        hadRegolaStrikes) &&
      (!guildId || !isExtraOwner(String(guildId), String(userId)))
    ) {
      ActivityUserProfile.updateOne(
        { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(userId) },
        {
          $set: {
            [automodBadUser("warnPoints")]: 0,
            [automodBadUser("activeStrikes")]: 0,
            [automodBadUser("activeStrikeReasons")]: [],
            [automodBadUser("regolaTimeoutStrikes")]: {},
          },
        },
      ).catch(() => { });
    }

    setCachedBadUser(userId, normalized, 60_000);
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    return {
      ...normalized,
      suspicious: Boolean(joinGateSuspicious),
    };
  } catch {
    return null;
  }
}

async function markBadUserTrigger(message?, violations?, heatValue?) {
  if (!isDbReady()) return;
  const userId = String(message.author?.id || "");
  if (!userId) return;
  if (shouldSkipAutomodBadUserDbWrite(message)) return;
  const reasons = [...new Set((violations || []).map((v?) => String(v?.key || "").trim()).filter(Boolean))].slice(0, 10);
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      {
        $set: {
          [automodBadUser("lastTriggerAt")]: new Date(),
          [automodBadUser("lastGuildId")]: String(message.guildId || ""),
          [automodBadUser("lastHeat")]: Number(heatValue || 0),
          [automodBadUser("reasons")]: reasons,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(userId);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

async function markBadUserAction(message?, action?, violations = []) {
  if (!isDbReady()) return;
  const userId = String(message?.author?.id || "");
  if (!userId) return;
  if (shouldSkipAutomodBadUserDbWrite(message)) return;
  const normalizedAction = String(action || "").trim().toLowerCase();
  const inc = { totalTriggers: 1, activeStrikes: 0, warnPoints: 0 };
  if (normalizedAction === "warn") inc.warnPoints = 1;
  if (
    normalizedAction === "timeout" ||
    normalizedAction === "ban" ||
    normalizedAction === "delete" ||
    normalizedAction === "delete_webhook"
  ) {
    inc.activeStrikes = 1;
  }
  const strikeReasons = (Array.isArray(violations) ? violations : []).map((v?) => firstViolationLabel([v])).filter(Boolean).slice(0, 5);
  const update: Record<string, any> = {
    $set: {
      [automodBadUser("lastActionAt")]: new Date(),
      [automodBadUser("lastAction")]: normalizedAction || null,
    },
    $inc: {
      [automodBadUser("totalTriggers")]: inc.totalTriggers,
      [automodBadUser("warnPoints")]: inc.warnPoints,
      [automodBadUser("activeStrikes")]: inc.activeStrikes,
    },
  };
  if (strikeReasons.length) {
    update.$push = {
      [automodBadUser("activeStrikeReasons")]: { $each: strikeReasons, $slice: -40 },
    };
  }
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      update,
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(userId);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

const { warnUser, deleteMessage } = createAutomodUserActions({ markBadUserAction });

async function registerAutoModTimeoutStrike(message?) {
  if (!isDbReady()) return { ok: false, timeoutActions: 0, escalate1h: false };
  const userId = String(message?.author?.id || "");
  if (!userId) return { ok: false, timeoutActions: 0, escalate1h: false };
  if (shouldSkipAutomodBadUserDbWrite(message)) return { ok: false, timeoutActions: 0, escalate1h: false };
  try {
    const updated = await ActivityUserProfile.findOneAndUpdate(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      {
        $inc: { [automodBadUser("timeoutActions")]: 1 },
        $set: {
          [automodBadUser("lastActionAt")]: new Date(),
          [automodBadUser("lastAction")]: "timeout",
          [automodBadUser("lastGuildId")]: String(message?.guildId || ""),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        projection: { _id: 0, [automodBadUser("timeoutActions")]: 1 },
      },
    )
      .lean()
      .catch(() => null);
    BAD_USER_CACHE.delete(userId);
    const timeoutActions = Math.max(
      0,
      Number(updated?.moderation?.automodBadUser?.timeoutActions || 0),
    );
    return {
      ok: true,
      timeoutActions,
      escalate1h: timeoutActions > 0 && timeoutActions % 5 === 0,
    };
  } catch {
    return { ok: false, timeoutActions: 0, escalate1h: false };
  }
}

async function shouldEscalateNextAutoTimeout(message?) {
  if (!isDbReady()) return false;
  const userId = String(message?.author?.id || "");
  if (!userId) return false;
  if (shouldSkipAutomodBadUserDbWrite(message)) return false;
  try {
    const row = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      { _id: 0, [automodBadUser("timeoutActions")]: 1 },
    )
      .lean()
      .catch(() => null);
    const current = Math.max(
      0,
      Number(row?.moderation?.automodBadUser?.timeoutActions || 0),
    );
    const next = current + 1;
    return next > 0 && next % 5 === 0;
  } catch {
    return false;
  }
}

async function getAutoModMemberSnapshot(member?) {
  if (!member?.guild || !member?.user) {
    return {
      heat: 0,
      suspicious: false,
      warnPoints: 0,
      activeStrikes: 0,
      strikeReasons: [],
      whitelist: {
        spam: false,
        ping: false,
        advertising: false,
      },
    };
  }

  const guild = member.guild;
  const userId = String(member.id);
  const key = `${String(guild.id)}:${userId}`;
  const state = USER_STATE.get(key);
  const heat = Number(state?.heat || 0);

  const roleExempt = isAutoModRoleExemptMember(guild, member);
  let suspicious = false;
  let warnPoints = 0;
  let activeStrikes = 0;
  let strikeReasons = [];
  try {
    const profile = await getBadUserProfile(userId, guild.id);
    suspicious = Boolean(profile?.suspicious);
    warnPoints = Math.max(0, Number(profile?.warnPoints || 0));
    activeStrikes = Math.max(0, Number(profile?.activeStrikes || 0));
    strikeReasons = Array.isArray(profile?.activeStrikeReasons)
      ? profile.activeStrikeReasons
        .map((x?) => String(x || "").trim())
        .filter(Boolean)
      : [];
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }

  return {
    heat,
    suspicious,
    warnPoints,
    activeStrikes,
    strikeReasons,
    whitelist: {
      spam: roleExempt,
      ping: roleExempt,
      advertising: roleExempt,
    },
  };
}

export = {
  computeNextAutoTimeoutDuration,
  getBadUserProfile,
  markBadUserTrigger,
  markBadUserAction,
  warnUser,
  deleteMessage,
  registerAutoModTimeoutStrike,
  shouldEscalateNextAutoTimeout,
  getAutoModMemberSnapshot,
};
