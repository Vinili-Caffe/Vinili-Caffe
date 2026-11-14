const { ActivityUserProfile, GlobalSettings, LEVEL_HISTORY_MAX_ENTRIES } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { isLevelExpGuild, getIsoWeekKey, getCurrentWeekKey, getLevelInfo, getTotalExpForLevel, repairExpTotals, resolveLevelUpAnnounceLevel } = require("./expLevels") as typeof import("./expLevels");
const { DEFAULT_MULTIPLIER, settingsCache, normalizeSettingsDoc, getGuildExpSettings, getRoleMultiplier, combineWeeklyExpMultiplier, getResolvedWeeklyExpMultiplier, getGlobalMultiplier } = require("./expMultipliers") as typeof import("./expMultipliers");
const { LEVEL_ROLE_MAP, getLevelRoleMap, sendLevelUpAnnouncement, scheduleEventLevelUpMessage } = require("./expLevelUp") as typeof import("./expLevelUp");
const { fetchGuildMember, addLevelRoleIfPossible, healMissingLevelRoles, healLevelRolesForGuildOnStartup, addPerkRoleIfPossible, syncLevelRolesForMember, minRoleLevel } = require("./expRoles") as typeof import("./expRoles");
const { getTopExpGainsInPeriod } = require("./expHistory") as typeof import("./expHistory");
const { ensureWeeklyExp, getUserExpStats, getUserRanks, retroSyncGuildLevels } = require("./expStats") as typeof import("./expStats");




const EXP_EXCLUDED_CATEGORY_IDS = new Set([].filter(Boolean).map((id?) => String(id)),);
const MESSAGE_EXP = 2;
const VOICE_EXP_PER_MINUTE = 5;

function invalidateSettingsCache(guildId?) {
  if (guildId) settingsCache.delete(String(guildId));
  else settingsCache.clear();
}

async function resolveMessageExp(guildId?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    return await LVL.getMessageExp(guildId);
  } catch {
    return MESSAGE_EXP;
  }
}

async function resolveVoiceExpPerMinute(guildId?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    return await LVL.getVoiceExpPerMinute(guildId);
  } catch {
    return VOICE_EXP_PER_MINUTE;
  }
}

async function resolveMessageCooldownSec(guildId?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg = await LVL.getConfig(String(guildId || ""));
    return Math.max(0, Math.floor(Number(cfg.messageCooldownSec) || 0));
  } catch {
    return 0;
  }
}

async function recordLevelHistory(guildId?, userId?, actorId = null, action = "update", beforeExp = 0, afterExp = 0, note = null) {
  if (typeof guildId === "object" && guildId !== null) {
    const o = guildId;
    return recordLevelHistory(o.guildId, o.userId, o.actorId ?? null, o.action ?? "update", o.beforeExp ?? 0, o.afterExp ?? 0, o.note ?? null);
  }
  if (!isValidGuildUserId(guildId, userId)) return null;
  const beforeLevel = getLevelInfo(beforeExp).level;
  const afterLevel = getLevelInfo(afterExp).level;
  const entry: Record<string, any> = {
    action: String(action || "update"),
    beforeExp: Number(beforeExp || 0),
    afterExp: Number(afterExp || 0),
    beforeLevel,
    afterLevel,
    deltaExp: Number(afterExp || 0) - Number(beforeExp || 0),
    createdAt: new Date(),
  };
  if (actorId) entry.actorId = String(actorId);
  if (note) entry.note = String(note).slice(0, 500);
  const cap = Math.max(50, Math.min(500, Number(process.env.LEVEL_HISTORY_MAX_ENTRIES) || LEVEL_HISTORY_MAX_ENTRIES));
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $push: { "profile.totals.exp.levelHistory": { $each: [entry], $position: 0, $slice: -cap } } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return null;
}

async function addExp(guildId?, userId?, amount?, applyMultiplier = false, weeklyAmountOverride = null, options: Record<string, any> = {}) {
  if (!isMongoReady()) return null;
  if (!isLevelExpGuild(guildId)) return null;
  if (!isValidGuildUserId(guildId, userId) || !Number.isFinite(amount)) return null;
  const now = new Date();
  const weekKey = getIsoWeekKey(now);
  const multiplier = applyMultiplier ? await getGlobalMultiplier(guildId) : 1;
  let effective = Math.max(0, Math.floor(Number(amount))) * multiplier;
  const gid = String(guildId);
  const uid = String(userId);
  const weeklyEffective =
    weeklyAmountOverride !== null
      ? Math.max(0, Math.floor(Number(weeklyAmountOverride)))
      : effective;
  if (effective === 0 && weeklyEffective === 0) return null;
  const beforeRow = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.totals.exp.totalExp profile.totals.exp.level")
    .lean()
    .catch(() => null);
  let beforeExp = Math.max(0, Math.floor(Number(beforeRow?.profile?.totals?.exp?.totalExp || 0)));
  const storedLevel = Math.max(0, Math.floor(Number(beforeRow?.profile?.totals?.exp?.level || 0)));
  const minExpForStoredLevel = getTotalExpForLevel(storedLevel);
  if (storedLevel > 0 && beforeExp < minExpForStoredLevel) {
    beforeExp = minExpForStoredLevel;
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $max: { "profile.totals.exp.totalExp": beforeExp }, $set: { "profile.totals.exp.level": storedLevel } },
    ).catch(() => null);
  }
  const prevLevel = Math.max(storedLevel, getLevelInfo(beforeExp).level);
  const eff = Math.floor(effective);
  const wk = Math.floor(weeklyEffective);
  const activityDelta = Math.max(0, Math.floor(Number(options?.activityAmount || 0)));
  let doc = null;
  try {
    doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      [
        {
          $set: {
            guildId: { $ifNull: ["$guildId", gid] },
            userId: { $ifNull: ["$userId", uid] },
            "profile.totals.exp.totalExp": {
              $add: [{ $max: [{ $ifNull: ["$profile.totals.exp.totalExp", 0] }, beforeExp] }, eff],
            },
            "profile.totals.exp.activityExpTotal": {
              $add: [{ $ifNull: ["$profile.totals.exp.activityExpTotal", 0] }, activityDelta],
            },
            "profile.totals.exp.weeklyKey": weekKey,
            "profile.totals.exp.weeklyExp": {
              $cond: [
                { $eq: [{ $ifNull: ["$profile.totals.exp.weeklyKey", ""] }, weekKey] },
                { $add: [{ $ifNull: ["$profile.totals.exp.weeklyExp", 0] }, wk] },
                wk,
              ],
            },
            "profile.totals.exp.sourceUpdatedAt": now,
          },
        },
      ],
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (
      err?.name === "MongoNotConnectedError" ||
      /Client must be connected before running operations/i.test(String(err?.message || err || ""))
    ) {
      return null;
    }
    global.logger?.warn?.("[expService] addExp atomic failed, fallback:", err?.message || err);
    let fallback = await ActivityUserProfile.findOne({ guildId: gid, userId: uid });
    if (!fallback) fallback = new ActivityUserProfile({ guildId: gid, userId: uid });
    if (!fallback.profile) fallback.profile = {} as any;
    if (!fallback.profile.totals) fallback.profile.totals = {} as any;
    if (!fallback.profile.totals.exp) fallback.profile.totals.exp = {} as any;
    ensureWeeklyExp(fallback.profile.totals.exp, now);
    fallback.profile.totals.exp.totalExp = Number(fallback.profile.totals.exp.totalExp || 0) + eff;
    if (activityDelta > 0) {
      fallback.profile.totals.exp.activityExpTotal =
        Number(fallback.profile.totals.exp.activityExpTotal || 0) + activityDelta;
    }
    fallback.profile.totals.exp.weeklyExp = Number(fallback.profile.totals.exp.weeklyExp || 0) + wk;
    const li = getLevelInfo(fallback.profile.totals.exp.totalExp);
    const fallbackStoredLevel = Math.max(0, Math.floor(Number(fallback.profile.totals.exp.level || 0)));
    const fallbackLevel = Math.max(fallbackStoredLevel, li.level);
    fallback.profile.totals.exp.level = fallbackLevel;
    li.level = fallbackLevel;
    await fallback.save();
    doc = fallback;
  }
  if (!doc) return null;
  const afterExp = Math.max(0, Math.floor(Number(doc.profile?.totals?.exp?.totalExp || 0)));
  const levelInfo = getLevelInfo(afterExp);
  const persistedLevel = Math.max(storedLevel, levelInfo.level);
  if (persistedLevel !== Number(doc.profile?.totals?.exp?.level || 0)) {
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    if (!doc.profile.totals.exp) doc.profile.totals.exp = {};
    doc.profile.totals.exp.level = persistedLevel;
    levelInfo.level = persistedLevel;
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $set: { "profile.totals.exp.level": persistedLevel } },
    ).catch(() => null);
  } else if (persistedLevel > levelInfo.level) {
    levelInfo.level = persistedLevel;
  }
  recordLevelHistory(guildId, userId, null, "update", beforeExp, afterExp, null).catch(() => null);
  return {
    doc,
    prevLevel,
    levelInfo,
    beforeExp,
    afterExp,
  };
}

async function incrementMinigameWinCounters(guildId?, userId?, effectiveExp?, newStreak?, bestStreak?) {
  if (!isLevelExpGuild(guildId)) return null;
  if (!isValidGuildUserId(guildId, userId)) return null;
  const gid = String(guildId);
  const uid = String(userId);
  const eff = Math.max(0, Math.floor(Number(effectiveExp)));
  if (!Number.isFinite(eff)) return null;
  const weekKey = getIsoWeekKey(new Date());
  const ns = Math.max(0, Math.floor(Number(newStreak)));
  const bs = Math.max(0, Math.floor(Number(bestStreak)));
  try {
    const doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      [
        {
          $set: {
            guildId: { $ifNull: ["$guildId", gid] },
            userId: { $ifNull: ["$userId", uid] },
            "profile.totals.exp.minigame.totalExp": {
              $add: [{ $ifNull: ["$profile.totals.exp.minigame.totalExp", 0] }, eff],
            },
            "profile.totals.exp.minigame.weeklyKey": weekKey,
            "profile.totals.exp.minigame.weeklyExp": {
              $cond: [
                { $eq: [{ $ifNull: ["$profile.totals.exp.minigame.weeklyKey", ""] }, weekKey] },
                { $add: [{ $ifNull: ["$profile.totals.exp.minigame.weeklyExp", 0] }, eff] },
                eff,
              ],
            },
            "profile.totals.exp.minigame.currentStreak": ns,
            "profile.totals.exp.minigame.bestStreak": bs,
          },
        },
      ],
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc;
  } catch (err) {
    global.logger?.warn?.("[expService] incrementMinigameWinCounters failed:", err?.message || err);
    return null;
  }
}

async function addExpWithLevel(guild?, userId?, amount?, applyMultiplier = false, includeWeekly = true, options: Record<string, any> = {}) {
  if (!guild || !userId) return null;
  if (!isLevelExpGuild(guild.id)) return null;
  const member = await fetchGuildMember(guild, userId);
  if (member?.user?.bot) return null;
  let effectiveAmount = amount;
  if (applyMultiplier) {
    const settings = await getGuildExpSettings(guild.id);
    const globalMulti = settings.effectiveMultiplier;
    const roleMulti = getRoleMultiplier(member || null, settings);
    const combined = combineWeeklyExpMultiplier(globalMulti, roleMulti);
    effectiveAmount = Number(amount || 0) * combined;
  }
  let weeklyAmount = null;
  if (!includeWeekly) {
    weeklyAmount = 0;
  } else if (applyMultiplier) {
    weeklyAmount = Number(amount || 0);
  }
  const isActivitySource = options?.source === "activity";
  const activityBase = isActivitySource ? Number(amount || 0) : 0;
  const activityAmount = applyMultiplier ? activityBase * (options?.activityMultiplierOverride || 1) : activityBase;
  const result = await addExp(
    guild.id,
    userId,
    effectiveAmount,
    false,
    weeklyAmount,
    { activityAmount, client: guild.client, guild },
  );
  if (!result || !result.levelInfo) return result;
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    if (member) {
      const level = result.levelInfo.level;
      const roleMap = await getLevelRoleMap(guild.id).catch(() => LEVEL_ROLE_MAP);
      const reachedPerkLevels = Array.from(roleMap.keys())
        .filter((perkLevel?) => perkLevel > (result.prevLevel ?? 0) && perkLevel <= level)
        .sort((a?, b?) => a - b);
      for (const perkLevel of reachedPerkLevels) {
        const roleId = roleMap.get(perkLevel);
        if (!roleId) continue;
        await addLevelRoleIfPossible(member, roleId);
      }
      const inlineSnapshot = repairExpTotals({
        totalExp: result.afterExp,
        level: result.levelInfo.level,
      });
      const announceLevel = resolveLevelUpAnnounceLevel(result.prevLevel ?? 0, level, inlineSnapshot);
      if (announceLevel) {
        scheduleEventLevelUpMessage(guild, guild.id, userId, announceLevel, result.prevLevel ?? 0);
      }
      if (result.levelInfo.level >= (await minRoleLevel(guild.id).catch(() => 10))) {
        await healMissingLevelRoles(member, result.levelInfo.level);
        await addPerkRoleIfPossible(member, result.levelInfo.level);
      }
    }
  } else if (member && result.levelInfo.level >= (await minRoleLevel(guild.id).catch(() => 10))) {
    /* levelRoleHeal1: self-heal milestone anche senza level-up (solo da quando serve un ruolo) */
    await healMissingLevelRoles(member, result.levelInfo.level);
    await addPerkRoleIfPossible(member, result.levelInfo.level);
  }
  return result;
}

async function syncLevelsBlobField(guildId?, patch?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const gid = String(guildId || IDs.guilds.main || "");
    if (!gid || !patch || typeof patch !== "object") return;
    const prev = await LVL.getConfig(gid, true);
    if (!(prev.userSaved || prev.seedVersion > 0)) return;
    const next = LVL.normalizeConfig({ ...prev, ...patch, userSaved: true });
    await T.setGuildBlob("levels", gid, next);
    await LVL.getConfig(gid, true);
  } catch (_) {}
}

async function setGlobalMultiplier(guildId?, multiplier?) {
  if (!guildId) return DEFAULT_MULTIPLIER;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = DEFAULT_MULTIPLIER;
  const doc = await GlobalSettings.findOneAndUpdate({ guildId }, { $set: { expMultiplier: value } }, { upsert: true, new: true, setDefaultsOnInsert: true },);
  invalidateSettingsCache(guildId);
  await syncLevelsBlobField(guildId, { globalMultiplier: value });
  const settings = normalizeSettingsDoc(doc);
  return settings.baseMultiplier;
}

async function setTemporaryEventMultiplier(guildId?, multiplier?, durationMs?) {
  if (!guildId) return null;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = 1;
  const safeDurationMs = Math.max(60 * 1000, Number(durationMs || 60 * 1000));
  const expiresAt = new Date(Date.now() + safeDurationMs);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    {
      $set: {
        expEventMultiplier: value,
        expEventMultiplierExpiresAt: expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return { multiplier: value, expiresAt };
}

async function setLevelChannelLocked(guildId?, channelId?, locked = true) {
  if (!guildId || !channelId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.lockedChannelIds);
  if (locked) set.add(channelId);
  else set.delete(channelId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    { $set: { expLockedChannelIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  await syncLevelsBlobField(guildId, { lockedChannelIds: next });
  return next;
}

async function setRoleIgnored(guildId?, roleId?, ignored = true) {
  if (!guildId || !roleId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.ignoredRoleIds);
  if (ignored) set.add(roleId);
  else set.delete(roleId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    { $set: { expIgnoredRoleIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  await syncLevelsBlobField(guildId, { ignoredRoleIds: next });
  return next;
}

async function setRoleExpMultiplier(guildId?, roleId?, multiplier?) {
  const rid = String(roleId || "").trim();
  if (!guildId || !/^\d{16,20}$/.test(rid)) return null;
  const targetGuildId = IDs.guilds.main;
  const n = Number(multiplier);
  const remove = multiplier === null || multiplier === undefined || !Number.isFinite(n) || n <= 0;
  try {
    if (remove) {
      await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        { $unset: { [`expRoleMultipliers.${rid}`]: "" } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } else {
      await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        { $set: { [`expRoleMultipliers.${rid}`]: n } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
  } catch (err) {
    global.logger?.warn?.("[expService] setRoleExpMultiplier:", err?.message || err);
    return null;
  }
  invalidateSettingsCache(guildId);
  return getGuildExpSettings(guildId);
}

async function resolveMemberVisibilityRoleForExp(guild?) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await getGuildRoleCached(guild, configuredId));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

async function isChannelEligibleForMemberExp(guild?, channelId?) {
  const id = String(channelId || "").trim();
  if (!guild || !id) return true;
  const role = await resolveMemberVisibilityRoleForExp(guild);
  if (!role) return true;

  const channel = guild.channels?.cache?.get(id) || (await getGuildChannelCached(guild, id));
  /* Fail-open: senza canale in cache (es. client REST del community-poll) non bloccare l'EXP.
     Altrimenti l'EXP vocale live restava a 0 e partiva solo al leave sul gateway. */
  if (!channel) return true;

  const perms = channel.permissionsFor(role);
  if (!perms?.has("ViewChannel")) return false;

  if (perms.has("SendMessages")) return true;
  if (perms.has("Connect")) return true;
  return false;
}

async function shouldIgnoreExpForMember({ guildId, member, channelId = null, skipIgnoredRoleIds = false }) {
  const settings = await getGuildExpSettings(guildId);
  const chId = channelId != null ? String(channelId) : "";
  if (chId) {
    const locked = new Set(
      (settings.lockedChannelIds || []).map((id?) => String(id)),
    );
    if (locked.has(chId)) return true;
  }
  if (channelId && EXP_EXCLUDED_CATEGORY_IDS.size > 0) {
    const guild = member?.guild || null;
    const channel = guild?.channels?.cache?.get(channelId) || (await guild?.channels?.fetch?.(channelId).catch(() => null));
    const parentId = String(channel?.parentId || "");
    if (parentId && EXP_EXCLUDED_CATEGORY_IDS.has(parentId)) return true;
  }
  if (chId) {
    const guild = member?.guild || null;
    const allowed = await isChannelEligibleForMemberExp(guild, chId);
    if (!allowed) return true;
  }
  if (!skipIgnoredRoleIds && member?.roles?.cache && settings.ignoredRoleIds.length > 0) {
    for (const roleId of settings.ignoredRoleIds) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}
const PERIOD_LOOKBACK_DAYS = [1, 7, 14, 21, 30];

export = {
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
  resolveMessageExp,
  resolveVoiceExpPerMinute,
  resolveMessageCooldownSec,
  invalidateSettingsCache,
  isLevelExpGuild,
  addExpWithLevel,
  getUserExpStats,
  getUserRanks,
  getLevelInfo,
  getTotalExpForLevel,
  getGlobalMultiplier,
  setGlobalMultiplier,
  setTemporaryEventMultiplier,
  getGuildExpSettings,
  setLevelChannelLocked,
  setRoleIgnored,
  setRoleExpMultiplier,
  shouldIgnoreExpForMember,
  recordLevelHistory,
  syncLevelRolesForMember,
  retroSyncGuildLevels,
  healLevelRolesForGuildOnStartup,
  getResolvedWeeklyExpMultiplier,
  getCurrentWeekKey,
  incrementMinigameWinCounters,
  sendLevelUpAnnouncement,
  getTopExpGainsInPeriod,
  PERIOD_LOOKBACK_DAYS,
};
