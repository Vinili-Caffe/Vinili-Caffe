const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { deleteCustomVocIfPossible } = require("./customPerksRulesMigrationService") as typeof import("./customPerksRulesMigrationService");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { discoverCustomPrivateVoiceOwnersFromGuild } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const {
  CUSTOM_VOC_WEEKLY_MIN_SECONDS,
  CUSTOM_VOC_MAX_FAILED_WEEKS,
  CUSTOM_VOC_RECREATION_COOLDOWN_MS,
  getLastSunday21BoundaryMsAtOrBefore,
  listCompletedWeekEndMsForBackfill,
  sumCustomVocVoiceSecondsForWeek,
  formatCustomVocHoursFromSeconds,
} = require("../../Utils/Community/customVocWeeklyActivityUtils") as typeof import("../../Utils/Community/customVocWeeklyActivityUtils");

let enforcementRunning = false;

async function ensureGuildVoiceChannelsHydrated(guild?) {
  if (!guild?.channels?.cache?.size && typeof guild?.channels?.fetch === "function") {
    await guild.channels.fetch().catch(() => { });
  }
}

async function loadTargetActivityProfile(guildId?, userId?) {
  const lean = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("userId profile.customRole profile.totals.hourly profile.totals.daily profile.totals.sessionChannelId profile.totals.sessionStartedAt")
    .lean()
    .catch(() => null);
  try {
    const { hydrateProfileActivityBucketsFromGuild } = require("./activityService") as typeof import("./activityService");
    return await hydrateProfileActivityBucketsFromGuild(guildId, userId, lean);
  } catch (_) {
    return lean;
  }
}

async function loadCustomVocEnforcementTargets(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return [];
  await ensureGuildVoiceChannelsHydrated(guild);
  const discovered = discoverCustomPrivateVoiceOwnersFromGuild(guild);
  const dbDocs = await ActivityUserProfile.find({
    guildId,
    "profile.customRole.customVocChannelId": { $exists: true, $nin: [null, ""] },
  })
    .select("userId profile.customRole.customVocChannelId profile.customRole.customVocFailedWeekStreak profile.customRole.customVocLastEvaluatedWeekEndMs profile.customRole.customVocRecreationBlockedUntil")
    .lean()
    .catch(() => []);
  const byUserId = new Map();
  for (const doc of dbDocs) {
    const userId = String(doc?.userId || "").trim();
    const customRole = doc?.profile?.customRole || {};
    const channelId = String(customRole?.customVocChannelId || "").trim();
    if (!userId || !channelId) continue;
    byUserId.set(userId, { userId, channelId, customRole, source: "db" });
  }
  for (const [userId, channelId] of discovered.entries()) {
    const existing = byUserId.get(userId);
    if (existing) {
      if (existing.channelId !== channelId) existing.channelId = channelId;
      existing.source = existing.source === "db" ? "db+discord" : "discord";
      continue;
    }
    byUserId.set(userId, { userId, channelId, customRole: {}, source: "discord" });
  }
  return [...byUserId.values()];
}

async function persistCustomVocActivityFields(guildId?, userId?, fields?) {
  const setPayload: Record<string, any> = {};
  if (fields.customVocFailedWeekStreak != null) {
    setPayload["profile.customRole.customVocFailedWeekStreak"] = Math.max(0, Number(fields.customVocFailedWeekStreak) || 0);
  }
  if (fields.customVocLastEvaluatedWeekEndMs != null) {
    setPayload["profile.customRole.customVocLastEvaluatedWeekEndMs"] = Number(fields.customVocLastEvaluatedWeekEndMs) || null;
  }
  if (fields.customVocRecreationBlockedUntil !== undefined) {
    setPayload["profile.customRole.customVocRecreationBlockedUntil"] = fields.customVocRecreationBlockedUntil;
  }
  if (fields.customVocChannelId !== undefined) {
    setPayload["profile.customRole.customVocChannelId"] = fields.customVocChannelId;
  }
  if (!Object.keys(setPayload).length) return;
  await ActivityUserProfile.updateOne({ guildId: String(guildId), userId: String(userId) }, { $set: setPayload }).catch(() => { });
}

async function channelStillExists(guild?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!cid || !guild) return false;
  const ch = guild.channels.cache.get(cid) || (await getGuildChannelCached(guild, cid).catch(() => null));
  return Boolean(ch);
}

async function enforceDeleteCustomVoc(guild?, client?, userId?, channelId?, weekEndMs?) {
  const reason = "Custom voc: 3 settimane consecutive sotto il minimo di 5 ore settimanali";
  await deleteCustomVocIfPossible(guild, channelId, reason);
  if (await channelStillExists(guild, channelId)) {
    global.logger?.warn?.(`[CUSTOM VOC WEEKLY] Delete failed for voc ${channelId} user ${userId}; channel still exists`);
    return { deleted: false };
  }
  const blockUntil = CUSTOM_VOC_RECREATION_COOLDOWN_MS > 0
    ? new Date(Date.now() + CUSTOM_VOC_RECREATION_COOLDOWN_MS)
    : null;
  await persistCustomVocActivityFields(guild.id, userId, {
    customVocChannelId: null,
    customVocFailedWeekStreak: 0,
    customVocLastEvaluatedWeekEndMs: weekEndMs,
    customVocRecreationBlockedUntil: blockUntil,
  });
  global.logger?.info?.(`[CUSTOM VOC WEEKLY] Deleted voc ${channelId} for user ${userId} after ${CUSTOM_VOC_MAX_FAILED_WEEKS} failed weeks`);
  return { deleted: true, blockUntil };
}

async function evaluateCustomVocTarget(guild?, client?, target?, weekEndMsList?, { dryRun = false } = {}) {
  const userId = String(target?.userId || "").trim();
  const channelId = String(target?.channelId || "").trim();
  if (!userId || !channelId) return { touched: false };
  if (!(await channelStillExists(guild, channelId))) {
    if (!dryRun) await persistCustomVocActivityFields(guild.id, userId, { customVocChannelId: null });
    return { touched: true, deleted: false, missingChannel: true };
  }

  const profileDoc = await loadTargetActivityProfile(guild.id, userId);
  const customRole = {
    ...(profileDoc?.profile?.customRole || {}),
    ...(target?.customRole || {}),
    customVocChannelId: channelId,
  };
  const evalProfile = profileDoc || { userId, profile: { customRole } };
  if (!evalProfile.profile) evalProfile.profile = { customRole };
  if (!evalProfile.profile.customRole) evalProfile.profile.customRole = customRole;
  if (!dryRun && String(evalProfile.profile.customRole?.customVocChannelId || "") !== channelId) {
    await persistCustomVocActivityFields(guild.id, userId, { customVocChannelId: channelId });
  }

  let streak = Math.max(0, Number(customRole?.customVocFailedWeekStreak || 0));
  let lastEval = Number(customRole?.customVocLastEvaluatedWeekEndMs || 0);
  let deleted = false;
  const weekLogs = [];

  for (const weekEndMs of weekEndMsList) {
    if (weekEndMs <= lastEval) continue;
    const seconds = sumCustomVocVoiceSecondsForWeek(evalProfile, channelId, weekEndMs, {
      includeLiveSession: false,
      guild,
      ownerId: userId,
    });
    weekLogs.push({ weekEndMs, seconds, hours: formatCustomVocHoursFromSeconds(seconds) });
    if (seconds >= CUSTOM_VOC_WEEKLY_MIN_SECONDS) {
      streak = 0;
    } else {
      streak += 1;
    }
    lastEval = weekEndMs;
    if (streak >= CUSTOM_VOC_MAX_FAILED_WEEKS) {
      if (dryRun) {
        deleted = true;
        break;
      }
      const result = await enforceDeleteCustomVoc(guild, client, userId, channelId, weekEndMs);
      deleted = Boolean(result?.deleted);
      if (!deleted) {
        await persistCustomVocActivityFields(guild.id, userId, {
          customVocFailedWeekStreak: streak,
          customVocLastEvaluatedWeekEndMs: lastEval,
        });
      } else {
        streak = 0;
      }
      break;
    }
  }

  if (!deleted && !dryRun) {
    await persistCustomVocActivityFields(guild.id, userId, {
      customVocFailedWeekStreak: streak,
      customVocLastEvaluatedWeekEndMs: lastEval || null,
    });
  }
  return { touched: true, deleted, streak, weekLogs, userId, channelId, wouldDelete: dryRun && deleted };
}

async function runCustomVocWeeklyEnforcement(client?, { mode = "weekly", guildId = null, dryRun = false } = {}) {
  if (enforcementRunning) return { skipped: true, reason: "running" };
  enforcementRunning = true;
  const stats = { rows: 0, discovered: 0, deleted: 0, weeks: 0, failedDeletes: 0, details: [] };
  try {
    const targetGuildId = String(guildId || IDs?.guilds?.main || "").trim();
    if (!targetGuildId) return { ...stats, skipped: true, reason: "no_guild" };
    const guild = client?.guilds?.cache?.get(targetGuildId) || (await getClientGuildCached(client, targetGuildId, { ttlMs: 120_000 }).catch(() => null));
    if (!guild) return { ...stats, skipped: true, reason: "guild_missing" };

    const nowMs = Date.now();
    const targets = await loadCustomVocEnforcementTargets(guild);
    stats.rows = targets.length;
    stats.discovered = targets.filter((t?) => t.source === "discord" || t.source === "db+discord").length;
    if (!targets.length) return stats;

    for (const target of targets) {
      const customRole = target?.customRole || {};
      const lastEval = Number(customRole?.customVocLastEvaluatedWeekEndMs || 0);
      let weekEndMsList = [];
      if (mode === "weekly") {
        const weekEnd = getLastSunday21BoundaryMsAtOrBefore((nowMs as any));
        if (weekEnd > lastEval) weekEndMsList = [weekEnd];
      } else {
        weekEndMsList = listCompletedWeekEndMsForBackfill(nowMs, lastEval);
      }
      if (!weekEndMsList.length) continue;
      stats.weeks += weekEndMsList.length;
      if (dryRun) {
        const preview = await evaluateCustomVocTarget(guild, client, target, weekEndMsList, { dryRun: true });
        stats.details.push(preview);
        if (preview?.wouldDelete) stats.deleted += 1;
        continue;
      }
      const result = await evaluateCustomVocTarget(guild, client, target, weekEndMsList);
      if (result?.deleted) stats.deleted += 1;
      else if (result?.weekLogs?.length && Number(result?.streak || 0) >= CUSTOM_VOC_MAX_FAILED_WEEKS) stats.failedDeletes += 1;
      if (result?.weekLogs?.length) {
        stats.details.push({
          userId: result.userId,
          channelId: result.channelId,
          streak: result.streak,
          deleted: result.deleted,
          weeks: result.weekLogs,
        });
      }
    }
    return stats;
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    global.logger?.error?.("[CUSTOM VOC WEEKLY] Enforcement failed:", msg);
    throw err;
  } finally {
    enforcementRunning = false;
  }
}

function isCustomVocRecreationBlocked(customRoleLean?, nowMs = Date.now()) {
  const until = customRoleLean?.customVocRecreationBlockedUntil;
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > nowMs;
}

export = {
  runCustomVocWeeklyEnforcement,
  isCustomVocRecreationBlocked,
  enforceDeleteCustomVoc,
  evaluateCustomVocTarget,
  loadCustomVocEnforcementTargets,
};