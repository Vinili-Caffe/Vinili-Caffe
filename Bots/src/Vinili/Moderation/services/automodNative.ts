/** Automod: azioni dell'automod nativo di Discord. */
const { readSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { nowMs } = require("./automodText") as typeof import("./automodText");
const { USER_STATE } = require("./automodExempt") as typeof import("./automodExempt");
const { PANIC_MODE, getPanicState, pingStaffAutomodAlert } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { ACTION_COOLDOWN, ACTION_COOLDOWN_MS, AUTOMOD_HOT_SNAPSHOT_PATH, flushAutomodHotSnapshotNow } = require("./automodActions") as typeof import("./automodActions");
const { isAutomodExemptChannel } = require("../utils/automodChannelExemptions") as typeof import("../utils/automodChannelExemptions");

const GUILD_INSTANT_EVENTS = new Map();
const NATIVE_HANDLED_MESSAGES = new Map();
const NATIVE_HANDLED_TTL_MS = 30_000;
const PANIC_TRIGGER_KEYS = new Set(["invite", "scam_pattern", "scam_image_bait", "grabbed_scam_image", "nsfw_link", "word_blacklist", "link_blacklist", "mention_everyone", "mentions_lockdown", "mention_hour_cap", "unwhitelisted_webhook",]);
let automodHotSnapshotLoaded = false;

function readAutomodHotSnapshotRaw() {
  return readSnapshotWithMeta({
    filePath: AUTOMOD_HOT_SNAPSHOT_PATH,
    walPath: `${AUTOMOD_HOT_SNAPSHOT_PATH}.wal`,
    key: "vinyls_automod_hot",
    version: 1,
    fallback: {},
  });
}

function ensureAutomodHotSnapshotLoaded() {
  if (automodHotSnapshotLoaded) return;
  armShutdownCheckpoint();
  automodHotSnapshotLoaded = true;
  const raw = readAutomodHotSnapshotRaw();
  const rows = raw?.actionCooldown && typeof raw.actionCooldown === "object"
    ? raw.actionCooldown
    : {};
  const now = nowMs();
  const maxAge = ACTION_COOLDOWN_MS * 4;
  for (const [key, ts] of Object.entries(rows)) {
    const at = Number(ts || 0);
    if (!key || !Number.isFinite(at) || at <= 0) continue;
    if (now - at > maxAge) continue;
    ACTION_COOLDOWN.set(String(key), at);
  }
  if (!global.__vinylsAutomodHotFlushRegistered) {
    global.__vinylsAutomodHotFlushRegistered = true;
    registerShutdownFlush("vinyls_automod_hot", () => flushAutomodHotSnapshotNow());
  }
}

function markDiscordNativeHandled(messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return;
  const at = nowMs();
  NATIVE_HANDLED_MESSAGES.set(id, at);
  if (NATIVE_HANDLED_MESSAGES.size > 5000) {
    for (const [key, ts] of NATIVE_HANDLED_MESSAGES.entries()) {
      if (at - Number(ts || 0) > NATIVE_HANDLED_TTL_MS) {
        NATIVE_HANDLED_MESSAGES.delete(key);
      }
    }
  }
}

function wasDiscordNativeHandled(messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const ts = Number(NATIVE_HANDLED_MESSAGES.get(id) || 0);
  if (!ts) return false;
  if (nowMs() - ts > NATIVE_HANDLED_TTL_MS) {
    NATIVE_HANDLED_MESSAGES.delete(id);
    return false;
  }
  return true;
}

function prunePanicAccounts(state?, at = nowMs()) {
  const minTs = at - PANIC_MODE.triggerWindowMs;
  for (const [userId, payload] of state.triggerAccounts.entries()) {
    const ts = typeof payload === "number" ? payload : Number(payload?.ts || 0);
    if (ts < minTs) state.triggerAccounts.delete(userId);
  }
  if (Array.isArray(state.panicSignals)) {
    state.panicSignals = state.panicSignals.filter((ts?) => Number(ts || 0) >= minTs);
  }
}

function isRaiderInPanic(guildId?, userId?, at = nowMs()) {
  if (!PANIC_MODE.enabled || !guildId || !userId) return false;
  const state = getPanicState(guildId);
  if (state.activeUntil <= at) return false;
  return state.triggerAccounts?.has?.(String(userId)) === true;
}

function registerPanicTrigger(guildId?, userId?, options: Record<string, any> = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  const activityBoost = Math.max(0, Math.min(1, Math.floor(Number(options.activityBoost || 0))),);
  const dbBoost = Math.max(0, Math.min(1, Math.floor(Number(options.dbBoost || 0))),);
  const raidBoost = Math.max(0, Math.min(1, Math.floor(Number(options.raidBoost || 0))),);
  const state = getPanicState(guildId);
  prunePanicAccounts(state, at);
  if (!Array.isArray(state.panicSignals)) state.panicSignals = [];
  state.panicSignals.push(at);
  state.triggerAccounts.set(String(userId), {
    ts: at,
    activityBoost,
    dbBoost,
    raidBoost,
  });
  const signalCount = Number(state.panicSignals.length || 0);
  const alreadyActive = state.activeUntil > at;
  if (signalCount >= PANIC_MODE.triggerCount) {
    state.activeUntil = Math.max(state.activeUntil, at + PANIC_MODE.durationMs);
  }
  const nowActive = state.activeUntil > at;
  if (!alreadyActive && nowActive) {
    try {
      const { invalidateSecurityLockCache } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
      invalidateSecurityLockCache(guildId);
    } catch (_) {}
  }
  return { activated: !alreadyActive && nowActive, active: nowActive, count: signalCount };
}

function registerGuildInstantSignal(message?, at = nowMs()) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return { uniqueUsers: 0, youngUsers: 0 };
  const existing = GUILD_INSTANT_EVENTS.get(guildId) || [];
  const minTs = at - Number(PANIC_MODE.raidWindowMs || 120_000);
  const events = existing.filter((item?) => Number(item?.ts || 0) >= minTs);
  const accountAgeMs = at - Number(new Date(message?.author?.createdAt || 0).getTime() || 0);
  const isYoung = accountAgeMs > 0 && accountAgeMs < 7 * 24 * 60 * 60_000;
  events.push({
    ts: at,
    userId: String(message?.author?.id || ""),
    young: isYoung,
  });
  GUILD_INSTANT_EVENTS.set(guildId, events);
  const uniqueUsers = new Set(events.map((e?) => String(e.userId || ""))).size;
  const youngUsers = new Set(events.filter((e?) => e.young).map((e?) => String(e.userId || "")),).size;
  return { uniqueUsers, youngUsers };
}

function getUserKey(message?) {
  return `${message.guildId}:${message.author.id}`;
}

function getState(message?) {
  const key = getUserKey(message);
  const existing = USER_STATE.get(key);
  if (existing) return existing;
  const initial = { heat: 0, lastAt: nowMs(), msgTimes: [], normHistory: [], recentMessageHistory: [], mentionTimes: [], mentionHourTimes: [], automodHits: [], };
  USER_STATE.set(key, initial);
  return initial;
}

async function buildMessageFromAutomodExecution(execution?) {
  const guild = execution?.guild;
  const client = execution?.client;
  if (!guild || !client) return null;
  const channelId = String(execution?.channelId || "");
  const userId = String(execution?.userId || "");
  if (!channelId || !userId) return null;
  const channel =
    execution?.channel ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const author = member?.user || (await client.users.fetch(userId).catch(() => null));
  if (!author) return null;
  return {
    guild,
    guildId: String(guild.id),
    channel,
    channelId,
    author,
    member: member || null,
    id: String(execution?.messageId || ""),
    content: String(execution?.content || execution?.matchedContent || ""),
    client,
  };
}

async function pingStaffForAutomodExecution(execution?) {
  const message = await buildMessageFromAutomodExecution(execution);
  if (!message) return false;
  if (isAutomodExemptChannel(message.channel, message.guild, message.client)) return false;
  return pingStaffAutomodAlert(message);
}

export = { GUILD_INSTANT_EVENTS, PANIC_TRIGGER_KEYS, ensureAutomodHotSnapshotLoaded, markDiscordNativeHandled, wasDiscordNativeHandled, prunePanicAccounts, isRaiderInPanic, registerPanicTrigger, registerGuildInstantSignal, getState, buildMessageFromAutomodExecution, pingStaffForAutomodExecution };
