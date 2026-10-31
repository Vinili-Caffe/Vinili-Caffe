/** Antinuke: controllo di creazione e cancellazione di ruoli e canali, espulsioni e ban. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { UNKNOWN_EXECUTOR_ID, isWhitelistedExecutorAsync, isCategoryWhitelisted } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState, persistAntiNukePanicSnapshotNow, createPanicCaseId, ensurePanicReport, lockDangerousRolesForPanic, scheduleAntiNukePanicUnlock, lockGuildChannelsForPanic } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { buildChannelBackupSnapshot, queueDeletedRoleSnapshot, queueDeletedChannelSnapshot } = require("./antiNukeRestore") as typeof import("./antiNukeRestore");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");

const KICK_BAN_TRACKER = new Map();
const ROLE_CREATION_TRACKER = new Map();
const ROLE_DELETION_TRACKER = new Map();
const CHANNEL_CREATION_TRACKER = new Map();
const CHANNEL_DELETION_TRACKER = new Map();
const ACTION_EVENT_DEDUPE = new Map();
const ACTION_EVENT_DEDUPE_TTL_MS = 3_500;
const ACTION_EVENT_DEDUPE_NO_TARGET_TTL_MS = 900;
const GUILD_BURST_TRACKER = new Map();
const GUILD_BURST_WINDOW_MS = 20_000;
const GUILD_BURST_TRIGGER_HEAT = 160;
const GUILD_BURST_COOLDOWN_MS = 30_000;
const PANIC_EXECUTOR_COOLDOWN = new Map();
const PANIC_EXECUTOR_COOLDOWN_MS = 20_000;
const COMMAND_LOCK_CACHE = new Map();
const ANTINUKE_MAX_HEAT = 100;

function percentToHeat(percent?) {
  return (Number(percent) / 100) * ANTINUKE_MAX_HEAT;
}

function normalizeExecutorId(executorId?) {
  const raw = String(executorId || "").trim();
  return raw || UNKNOWN_EXECUTOR_ID;
}

function resetPanicReport(state?) {
  state.panicCaseId = createPanicCaseId();
  state.panicReport = null;
  ensurePanicReport(state);
}

function decayPanicHeat(state?, at = Date.now()) {
  const elapsedSec = Math.max(0, (at - Number(state.lastAt || at)) / 1000);
  const decay = elapsedSec * Number(ANTINUKE_CONFIG.panicMode.decayPerSec || 0);
  state.heat = Math.max(0, Number(state.heat || 0) - decay);
  state.lastAt = at;
}

async function enableAntiNukePanic(guild?, reason?, addedHeat = 0, options: Record<string, any> = {}) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.panicMode.enabled || !guild) {
    return { activated: false, active: false };
  }
  if (!isAntiNukeScopeGuild(guild.id)) {
    return { activated: false, active: false };
  }
  const now = Date.now();
  const state = getPanicState(guild.id);
  if (state.restoreRetryTimer) {
    clearTimeout(state.restoreRetryTimer);
    state.restoreRetryTimer = null;
  }
  state.restoreRetryCount = 0;
  if (ANTINUKE_CONFIG.panicMode.useHeatAlgorithm) {
    decayPanicHeat(state, now);
  } else {
    state.lastAt = now;
  }
  state.heat += percentToHeat(addedHeat || 0);
  const threshold = Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 100);
  const forceTrigger = Boolean(options?.force);
  if (forceTrigger && Number(state.activeUntil || 0) <= now) {
    state.heat = Math.max(state.heat, threshold);
  }

  const wasActive = Number(state.activeUntil || 0) > now;
  if (state.heat < threshold && !wasActive && !forceTrigger) {
    return { activated: false, active: false };
  }

  const baseDuration = Number(ANTINUKE_CONFIG.panicMode.durationMs || 0);
  const extendBy = Number(ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger || 0);
  const maxDuration = Math.max(baseDuration, Number(ANTINUKE_CONFIG.panicMode.maxDurationMs || baseDuration));
  if (!wasActive || !Number(state.panicStartedAt || 0)) {
    state.panicStartedAt = now;
  }
  const targetUntil = wasActive ? now + Math.max(baseDuration, extendBy) : now + baseDuration;
  state.activeUntil = Math.max(Number(state.activeUntil || 0), targetUntil);
  const hardCapUntil = Number(state.panicStartedAt || now) + maxDuration;
  if (state.activeUntil > hardCapUntil) {
    state.activeUntil = hardCapUntil;
  }
  state.panicTriggerHeat = Math.max(Number(state.heat || 0), threshold);
  state.heat = 0;
  persistAntiNukePanicSnapshotNow();
  try {
    const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
    invalidateSecurityLockCache(guild.id);
  } catch (_) {}
  COMMAND_LOCK_CACHE.delete(String(guild.id));

  if (!wasActive) {
    resetPanicReport(state);
    await lockDangerousRolesForPanic(guild, state);
    await lockGuildChannelsForPanic(guild, state);
  }

  scheduleAntiNukePanicUnlock(guild, state);

  if (!wasActive) {
    await sendAntiNukeLog(
      guild,
      "<a:VC_Alert:1482706673176150077> AntiNuke Panic Mode Enabled",
      [
        `<:VC_reason:1478517122929004544> **Reason:** ${reason || "threshold reached"}`,
        `<:VC_reason:1478517122929004544> **Heat Algorithm:** ${ANTINUKE_CONFIG.panicMode.useHeatAlgorithm ? "ON" : "OFF"}`,
        `<:VC_reason:1478517122929004544> **Duration:** ${Math.round(ANTINUKE_CONFIG.panicMode.durationMs / 60_000)} min`,
        `<:VC_reason:1478517122929004544> **Max Duration:** ${Math.round(maxDuration / 60_000)} min`,
        `<:VC_reason:1478517122929004544> **Dangerous Roles Lockdown:** ${ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles ? "ON" : "OFF"}`,
        `<:VC_reason:1478517122929004544> **Channel Lockdown:** ${ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown ? "ON" : "OFF"}`,
      ],
      "#ED4245",
    );
  }

  return { activated: !wasActive, active: true };
}

function cleanupTrackerMap(map?, now = Date.now()) {
  for (const [key, state] of map.entries()) {
    if (!state) {
      map.delete(key);
      continue;
    }
    const hits = Array.isArray(state.hourHits) ? state.hourHits : [];
    const hasRecentHits = hits.some((ts?) => now - Number(ts || 0) <= 60 * 60_000);
    const hasRecentPunish = now - Number(state.lastPunishAt || 0) <= 60 * 60_000;
    if (!hasRecentHits && !hasRecentPunish) {
      map.delete(key);
    }
  }
}

function cleanupActionDedupe(now = Date.now()) {
  for (const [key, ts] of ACTION_EVENT_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ACTION_EVENT_DEDUPE_TTL_MS) {
      ACTION_EVENT_DEDUPE.delete(key);
    }
  }
}

function cleanupPanicExecutorCooldown(now = Date.now()) {
  for (const [key, ts] of PANIC_EXECUTOR_COOLDOWN.entries()) {
    if (now - Number(ts || 0) > PANIC_EXECUTOR_COOLDOWN_MS) {
      PANIC_EXECUTOR_COOLDOWN.delete(key);
    }
  }
}

function isPanicExecutorCooldownActive(guildId?, executorId?, now = Date.now()) {
  cleanupPanicExecutorCooldown(now);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const last = Number(PANIC_EXECUTOR_COOLDOWN.get(key) || 0);
  return now - last <= PANIC_EXECUTOR_COOLDOWN_MS;
}

function touchPanicExecutorCooldown(guildId?, executorId?, now = Date.now()) {
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  PANIC_EXECUTOR_COOLDOWN.set(key, now);
}

function shouldSkipDuplicatedActionEvent({ guildId, executorId, actionKey, targetId = "", now = Date.now() }) {
  cleanupActionDedupe(now);
  const normalizedTarget = String(targetId || "").trim() || "__no_target__";
  const dedupeKey = [String(guildId || ""), String(executorId || ""), String(actionKey || ""), normalizedTarget,].join(":");
  const lastTs = Number(ACTION_EVENT_DEDUPE.get(dedupeKey) || 0);
  ACTION_EVENT_DEDUPE.set(dedupeKey, now);
  const ttlMs = normalizedTarget === "__no_target__" ? ACTION_EVENT_DEDUPE_NO_TARGET_TTL_MS : ACTION_EVENT_DEDUPE_TTL_MS;
  return now - lastTs <= ttlMs;
}

function getTrackerExecutorId(executorId?, targetId = "", actionKey = "", now = Date.now()) {
  const actorId = normalizeExecutorId(executorId);
  if (actorId !== UNKNOWN_EXECUTOR_ID) return actorId;
  const target = String(targetId || "").trim();
  if (target) return `${UNKNOWN_EXECUTOR_ID}:${target}`;
  const action = String(actionKey || "").trim() || "unknown";
  return `${UNKNOWN_EXECUTOR_ID}:${action}`;
}

function registerGuildBurstActivity(guildId?, addedHeat?, now = Date.now()) {
  for (const [gid, state] of GUILD_BURST_TRACKER.entries()) {
    const hits = Array.isArray(state?.hits) ? state.hits : [];
    const freshHits = hits.filter((x?) => now - Number(x?.ts || 0) <= GUILD_BURST_WINDOW_MS,);
    const recentlyTriggered = now - Number(state?.lastTriggeredAt || 0) <= GUILD_BURST_COOLDOWN_MS;
    if (!freshHits.length && !recentlyTriggered) {
      GUILD_BURST_TRACKER.delete(gid);
    } else if (freshHits.length !== hits.length) {
      GUILD_BURST_TRACKER.set(gid, {
        hits: freshHits,
        lastTriggeredAt: Number(state?.lastTriggeredAt || 0),
      });
    }
  }
  const key = String(guildId || "");
  if (!key || !Number.isFinite(Number(addedHeat || 0)) || Number(addedHeat || 0) <= 0) {
    return { triggered: false, totalHeat: 0 };
  }
  const existing = GUILD_BURST_TRACKER.get(key) || { hits: [], lastTriggeredAt: 0, };
  existing.hits = existing.hits.filter(
    (x?) => now - Number(x?.ts || 0) <= GUILD_BURST_WINDOW_MS,
  );
  existing.hits.push({ ts: now, heat: Number(addedHeat || 0) });
  const totalHeat = existing.hits.reduce((sum?, x?) => sum + Number(x?.heat || 0), 0,);
  const canTrigger = totalHeat >= GUILD_BURST_TRIGGER_HEAT && now - Number(existing.lastTriggeredAt || 0) > GUILD_BURST_COOLDOWN_MS;
  if (canTrigger) existing.lastTriggeredAt = now;
  GUILD_BURST_TRACKER.set(key, existing);
  return { triggered: canTrigger, totalHeat };
}

async function applyBurstPanicGuard(guild?, actorId?, actionLabel?, addedHeatPercent?) {
  if (!guild?.id) return;
  const heatPoints = percentToHeat(addedHeatPercent || 0);
  const burst = registerGuildBurstActivity(guild.id, heatPoints, Date.now());
  if (!burst.triggered) return;
  await enableAntiNukePanic(
    guild,
    `<a:VC_Alert:1482706673176150077> Coordinated burst detected (${actionLabel || "unknown"})`,
    Math.max(70, Number(addedHeatPercent || 0)),
    { force: true },
  );
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Coordinated Burst Guard",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Action:** ${actionLabel || "unknown"}`,
      `<:VC_reason:1478517122929004544> **Burst Heat (20s):** ${Math.round(burst.totalHeat)}/${GUILD_BURST_TRIGGER_HEAT}`,
      `<:VC_reason:1478517122929004544> **Result:** Panic mode forced`,
    ].filter(Boolean),
    "#ED4245",
  );
}

function getKickBanState(guildId?, executorId?) {
  cleanupTrackerMap(KICK_BAN_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = KICK_BAN_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  KICK_BAN_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimKickBanState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);
}

async function handleKickBanAction({ guild, executorId, action = "unknown", targetId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.kickBanFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, targetId, `kickban:${action}`, now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: `kickban:${action}`,
      targetId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `kick/ban (${action})`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction ?? 20,
  );
  await enableAntiNukePanic(
    guild,
    `Kick/Ban filter: ${action}`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction ?? 20,
  );

  const { state } = getKickBanState(guild.id, trackerId);
  trimKickBanState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.kickBanFilter.minuteLimit || 5);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.kickBanFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: kick/ban abuse detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Kick/Ban Filter",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Action:** ${action}`,
      targetId
        ? `<a:VC_Alert:1482706673176150077> **Target:** <@${targetId}> \`${targetId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.kickBanFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.kickBanFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getRoleCreationState(guildId?, executorId?) {
  cleanupTrackerMap(ROLE_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);
}

async function handleRoleCreationAction({ guild, executorId, roleId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:create",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "role create",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Role creation filter",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && roleId) {
    getPanicState(guild.id).createdRoleIds.add(String(roleId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedRoles && roleId) {
    const me = guild.members?.me;
    const role = await getGuildRoleCached(guild, String(roleId), { ttlMs: 30_000 });
    if (
      role &&
      !role.managed &&
      me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles) &&
      role.position < me.roles.highest.position
    ) {
      const removed = await role.delete("<:VC_Lock:1482526739044368476> AntiNuke panic: delete role created during active panic").then(() => true).catch(() => false);
      const canQuarantine = instantCfg?.quarantineExecutor && !isPanicExecutorCooldownActive(guild.id, actorId, now);
      const quarantine = canQuarantine ? await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke panic: role creation blocked during active panic",) : { applied: false, method: "cooldown" };
      if (canQuarantine && quarantine.applied) touchPanicExecutorCooldown(guild.id, actorId, now);
      if (removed) {
        await sendAntiNukeLog(
          guild,
          "<a:VC_Alert:1482706673176150077> AntiNuke: Panic Instant Rollback",
          [
            formatExecutorLine(actorId),
            `<a:VC_Alert:1482706673176150077> **Action:** Role creation blocked during panic`,
            `<a:VC_Alert:1482706673176150077> **Role:** \`${roleId}\``,
            `<a:VC_Alert:1482706673176150077> **Result:** Role deleted immediately`,
            `<a:VC_Alert:1482706673176150077> **Quarantena executor:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getRoleCreationState(guild.id, trackerId);
  trimRoleCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.minuteLimit || 5);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: role creation spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Role Creations Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<a:VC_Alert:1482706673176150077> **Last Role:** <@&${roleId}> \`${roleId}\``
        : null,
      `<:VC_reason:1478517122929004544> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleCreationFilter.minuteLimit}`,
      `<:VC_reason:1478517122929004544> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleCreationFilter.hourLimit}`,
      `<:VC_reason:1478517122929004544> **Heat:** ${state.heat}/100`,
      `<:VC_reason:1478517122929004544> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getRoleDeletionState(guildId?, executorId?) {
  cleanupTrackerMap(ROLE_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleDeletionState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);
}

async function handleRoleDeletionAction({ guild, executorId, roleName = "", roleId = "", roleSnapshot = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:delete",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "<a:VC_Alert:1482706673176150077> role delete",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Role deletion filter",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction,
  );
  if (
    isAntiNukePanicActive(guild.id) &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedRoles &&
    roleSnapshot?.id
  ) {
    queueDeletedRoleSnapshot(guild.id, roleSnapshot);
  }

  const { state } = getRoleDeletionState(guild.id, trackerId);
  trimRoleDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.hourLimit || 10);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: role deletion spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Role Deletions Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<a:VC_Alert:1482706673176150077> **Last Deleted Role:** ${roleName || "sconosciuto"} \`${roleId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleDeletionFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getChannelCreationState(guildId?, executorId?) {
  cleanupTrackerMap(CHANNEL_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);
}

async function handleChannelCreationAction({ guild, executorId, channelId = "", channel = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) {  }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:create",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "<a:VC_Alert:1482706673176150077> channel create",
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Channel creation filter",
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && channelId) {
    getPanicState(guild.id).createdChannelIds.add(String(channelId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedChannels && channelId) {
    try {
      const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
      if (isProtectedStreamerStageChannelId(channelId, guild.client)) {
        global.logger?.warn?.("[AntiNuke] skip instant delete protected streamer stage:", channelId);
        return;
      }
    } catch {
      /* ignore */
    }
    const me = guild.members?.me;
    const targetChannel = channel || (await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000 }));
    const canDelete = targetChannel?.deletable && me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels);
    if (canDelete) {
      const removed = await targetChannel.delete("<:VC_Lock:1482526739044368476> AntiNuke panic: delete channel created during active panic").then(() => true).catch(() => false);
      const canQuarantine = instantCfg?.quarantineExecutor && !isPanicExecutorCooldownActive(guild.id, actorId, now);
      const quarantine = canQuarantine ? await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke panic: channel creation blocked during active panic",) : { applied: false, method: "cooldown" };
      if (canQuarantine && quarantine.applied) touchPanicExecutorCooldown(guild.id, actorId, now);
      if (removed) {
        await sendAntiNukeLog(
          guild,
          "<a:VC_Alert:1482706673176150077> AntiNuke: Panic Instant Rollback",
          [
            formatExecutorLine(actorId),
            `<a:VC_Alert:1482706673176150077> **Action:** Channel creation blocked during panic`,
            `<a:VC_Alert:1482706673176150077> **Channel:** \`${channelId}\``,
            `<a:VC_Alert:1482706673176150077> **Result:** Channel deleted immediately`,
            `<a:VC_Alert:1482706673176150077> **Quarantena executor:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getChannelCreationState(guild.id, trackerId);
  trimChannelCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.minuteLimit || 4);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.hourLimit || 12);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: channel creation spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Channel Creations Filter",
    [
      formatExecutorLine(actorId),
      channelId
        ? `<a:VC_Alert:1482706673176150077> **Last Channel:** <#${channelId}> \`${channelId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelCreationFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelCreationFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getChannelDeletionState(guildId?, executorId?) {
  cleanupTrackerMap(CHANNEL_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelDeletionState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);
}

async function handleChannelDeletionAction({ guild, executorId, channelName = "", channelId = "", channel = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:delete",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "<a:VC_Alert:1482706673176150077> channel delete",
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Channel deletion filter",
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction,
  );
  if (
    isAntiNukePanicActive(guild.id) &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedChannels &&
    channel?.id
  ) {
    const backup = buildChannelBackupSnapshot(channel);
    if (backup?.id) {
      queueDeletedChannelSnapshot(guild.id, backup);
    }
  }

  const { state } = getChannelDeletionState(guild.id, trackerId);
  trimChannelDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.hourLimit || 8);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: channel deletion spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Channel Deletions Filter",
    [
      formatExecutorLine(actorId),
      channelId
        ? `<a:VC_Alert:1482706673176150077> **Last Deleted Channel:** ${channelName || "sconosciuto"} \`${channelId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelDeletionFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = { KICK_BAN_TRACKER, ROLE_CREATION_TRACKER, ROLE_DELETION_TRACKER, CHANNEL_CREATION_TRACKER, CHANNEL_DELETION_TRACKER, COMMAND_LOCK_CACHE, percentToHeat, normalizeExecutorId, enableAntiNukePanic, cleanupTrackerMap, isPanicExecutorCooldownActive, touchPanicExecutorCooldown, shouldSkipDuplicatedActionEvent, getTrackerExecutorId, applyBurstPanicGuard, handleKickBanAction, handleRoleCreationAction, handleRoleDeletionAction, handleChannelCreationAction, handleChannelDeletionAction };
