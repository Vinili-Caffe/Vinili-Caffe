const { UNKNOWN_EXECUTOR_ID } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const { percentToHeat } = require("./antiNukeActionHeat") as typeof import("./antiNukeActionHeat");

const ACTION_EVENT_DEDUPE = new Map();
const ACTION_EVENT_DEDUPE_TTL_MS = 3_500;
const ACTION_EVENT_DEDUPE_NO_TARGET_TTL_MS = 900;
const GUILD_BURST_TRACKER = new Map();
const GUILD_BURST_WINDOW_MS = 20_000;
const GUILD_BURST_TRIGGER_HEAT = 160;
const GUILD_BURST_COOLDOWN_MS = 30_000;
const PANIC_EXECUTOR_COOLDOWN = new Map();
const PANIC_EXECUTOR_COOLDOWN_MS = 20_000;

function normalizeExecutorId(executorId?) {
  const raw = String(executorId || "").trim();
  return raw || UNKNOWN_EXECUTOR_ID;
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

export = {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  isPanicExecutorCooldownActive,
  touchPanicExecutorCooldown,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
};
