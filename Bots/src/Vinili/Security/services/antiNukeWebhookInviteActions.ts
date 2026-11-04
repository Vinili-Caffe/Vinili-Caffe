/** Antinuke: controllo di webhook e inviti. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { percentToHeat, normalizeExecutorId, enableAntiNukePanic, cleanupTrackerMap, isPanicExecutorCooldownActive, touchPanicExecutorCooldown, shouldSkipDuplicatedActionEvent, getTrackerExecutorId, applyBurstPanicGuard } = require("./antiNukeRoleChannelActions") as typeof import("./antiNukeRoleChannelActions");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const WEBHOOK_CREATION_TRACKER = new Map();
const WEBHOOK_UPDATE_TRACKER = new Map();
const WEBHOOK_DELETION_TRACKER = new Map();
const INVITE_CREATION_TRACKER = new Map();

async function deleteWebhookById(guild?, webhookId?, _preferredChannelId = "") {
  const id = String(webhookId || "");
  if (!guild?.id || !id) return false;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageWebhooks)) return false;
  if (typeof guild.fetchWebhooks !== "function") return false;
  const webhooks = await guild.fetchWebhooks().catch(() => null);
  const target = webhooks?.get?.(id) || null;
  if (!target) return false;
  return target.delete(`${E.VC_Lock} AntiNuke panic: delete webhook created during active panic`).then(() => true).catch(() => false);
}

function getWebhookCreationState(guildId?, executorId?) {
  cleanupTrackerMap(WEBHOOK_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = WEBHOOK_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  WEBHOOK_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimWebhookCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15);
}

async function handleWebhookCreationAction({ guild, executorId, webhookId = "", channelId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const normalizedWebhookId = String(webhookId || "").trim();
  const panicActive = isAntiNukePanicActive(guild.id);
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, normalizedWebhookId, "webhook:create", now,);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "webhook:create",
      targetId: normalizedWebhookId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} webhook create`,
    ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Webhook creation filter`,
    ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction,
  );
  if (panicActive && normalizedWebhookId) {
    getPanicState(guild.id).createdWebhookIds.add(String(normalizedWebhookId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (
    panicActive &&
    instantCfg?.enabled &&
    instantCfg?.deleteCreatedWebhooks &&
    normalizedWebhookId
  ) {
    const removed = await deleteWebhookById(guild, normalizedWebhookId, channelId);
    const canQuarantine = instantCfg?.quarantineExecutor && !isPanicExecutorCooldownActive(guild.id, actorId, now);
    const quarantine = canQuarantine ? await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke panic: webhook creation blocked during active panic`,) : { applied: false, method: "cooldown" };
    if (canQuarantine && quarantine.applied) touchPanicExecutorCooldown(guild.id, actorId, now);
    if (removed) {
      await sendAntiNukeLog(
        guild,
        `${E.VC_Alert} AntiNuke: Panic Instant Rollback`,
        [
          formatExecutorLine(actorId),
          `${E.VC_Alert} **Action:** Webhook creation blocked during panic`,
          `${E.VC_Alert} **Webhook:** \`${normalizedWebhookId}\``,
          `${E.VC_Alert} **Result:** Webhook deleted immediately`,
          `${E.VC_Alert} **Quarantena executor:** ${quarantineOutcomeLabel(quarantine)}`,
        ],
      );
    }
    return;
  }

  const { state } = getWebhookCreationState(guild.id, trackerId);
  trimWebhookCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.webhookCreationFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.webhookCreationFilter.hourLimit || 10);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: webhook creation spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Webhook Creations Filter`,
    [
      formatExecutorLine(actorId),
      normalizedWebhookId
        ? `${E.VC_Alert} **Last Webhook:** \`${normalizedWebhookId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookCreationFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookCreationFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getWebhookDeletionState(guildId?, executorId?) {
  cleanupTrackerMap(WEBHOOK_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = WEBHOOK_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  WEBHOOK_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function getWebhookUpdateState(guildId?, executorId?) {
  cleanupTrackerMap(WEBHOOK_UPDATE_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = WEBHOOK_UPDATE_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  WEBHOOK_UPDATE_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimWebhookUpdateState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookUpdateFilter.heatPerAction || 12);
}

async function handleWebhookUpdateAction({ guild, executorId, webhookId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookUpdateFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const normalizedWebhookId = String(webhookId || "").trim();
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, normalizedWebhookId, "webhook:update", now,);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "webhook:update",
      targetId: normalizedWebhookId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} webhook update`,
    ANTINUKE_CONFIG.webhookUpdateFilter.heatPerAction || 12,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Webhook update filter`,
    ANTINUKE_CONFIG.webhookUpdateFilter.heatPerAction,
  );

  const { state } = getWebhookUpdateState(guild.id, trackerId);
  trimWebhookUpdateState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookUpdateFilter.heatPerAction || 12);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.webhookUpdateFilter.minuteLimit || 4);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.webhookUpdateFilter.hourLimit || 12);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: webhook update spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Webhook Updates Filter`,
    [
      formatExecutorLine(actorId),
      normalizedWebhookId
        ? `${E.VC_Alert} **Last Webhook:** \`${normalizedWebhookId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookUpdateFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookUpdateFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function trimWebhookDeletionState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10);
}

async function handleWebhookDeletionAction({ guild, executorId, webhookId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const normalizedWebhookId = String(webhookId || "").trim();
  const panicActive = isAntiNukePanicActive(guild.id);
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, normalizedWebhookId, "webhook:delete", now,);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "webhook:delete",
      targetId: normalizedWebhookId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} webhook delete`,
    ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Webhook deletion filter`,
    ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction,
  );

  const { state } = getWebhookDeletionState(guild.id, trackerId);
  trimWebhookDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.webhookDeletionFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.webhookDeletionFilter.hourLimit || 8);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: webhook deletion spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Webhook Deletions Filter`,
    [
      formatExecutorLine(actorId),
      normalizedWebhookId
        ? `${E.VC_Alert} **Last Webhook:** \`${normalizedWebhookId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getInviteCreationState(guildId?, executorId?) {
  cleanupTrackerMap(INVITE_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = INVITE_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  INVITE_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimInviteCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12);
}

async function handleInviteCreationAction({ guild, executorId, inviteCode = "", channelId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.inviteCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, inviteCode, "invite:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "invite:create",
      targetId: inviteCode,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} invite create`,
    ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Invite creation filter`,
    ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction,
  );

  const { state } = getInviteCreationState(guild.id, trackerId);
  trimInviteCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.inviteCreationFilter.minuteLimit || 4);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.inviteCreationFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: invite creation spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Invite Creations Filter`,
    [
      formatExecutorLine(actorId),
      inviteCode
        ? `${E.VC_Alert} **Invite:** \`${inviteCode}\``
        : null,
      channelId
        ? `${E.VC_Alert} **Channel:** <#${channelId}> \`${channelId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.inviteCreationFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.inviteCreationFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = { WEBHOOK_CREATION_TRACKER, WEBHOOK_UPDATE_TRACKER, WEBHOOK_DELETION_TRACKER, INVITE_CREATION_TRACKER, handleWebhookCreationAction, handleWebhookUpdateAction, handleWebhookDeletionAction, handleInviteCreationAction };
