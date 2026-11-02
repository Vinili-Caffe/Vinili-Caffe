/** Minigiochi: attività della chat che decide quando far partire un gioco. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { getMinigameRomeTime, getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");

const recentMessages = new Map();
const lastSentAtByChannel = new Map();

function getActivityWindowMs(cfg?) {
  return Math.max(60 * 1000, Number(cfg?.activityWindowMs || 15 * 60 * 1000));
}

function getMinMessages(cfg?) {
  return Math.max(1, Number(cfg?.minMessages ?? 1));
}

function getActivityThresholdCfg(cfg?) {
  const at = cfg?.activityThreshold;
  return at && typeof at === "object" ? at : {};
}

function normalizeActivityEntry(raw?) {
  if (typeof raw === "number" && Number.isFinite(raw)) return { t: raw, u: null };
  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.t))) {
    const uid = raw.u != null && String(raw.u).trim() ? String(raw.u).trim() : null;
    return { t: Number(raw.t), u: uid };
  }
  return null;
}

function getRecentActivityStats(activityScopeKey?, windowMs?) {
  if (!activityScopeKey) return { count: 0, uniqueUsers: 0, avgPerUser: 0 };
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(activityScopeKey) || [];
  const cutoff = now - safeWindowMs;
  const trimmed = [];
  for (const raw of list) {
    const e = normalizeActivityEntry(raw);
    if (!e || e.t < cutoff) continue;
    trimmed.push(e);
  }
  recentMessages.set(activityScopeKey, trimmed);
  const count = trimmed.length;
  const set = new Set();
  let unknown = 0;
  for (const e of trimmed) {
    if (e.u) set.add(e.u);
    else unknown += 1;
  }
  let uniqueUsers = set.size;
  if (unknown > 0) {
    uniqueUsers += Math.max(0, Math.min(unknown, Math.ceil(unknown / 4)));
  }
  uniqueUsers = Math.max(1, Math.min(count, uniqueUsers));
  const avgPerUser = count / uniqueUsers;
  return { count, uniqueUsers, avgPerUser };
}

function getTimeFactorAdaptive(at?, client?) {
  const h = getMinigameRomeTime(new Date(), client).hour;
  const nightStart = Number(at.nightHourStart ?? 2);
  const nightEnd = Number(at.nightHourEnd ?? 7);
  const inNight =
    nightStart <= nightEnd
      ? h >= nightStart && h < nightEnd
      : h >= nightStart || h < nightEnd;
  if (inNight) return Math.max(0.45, Number(at.nightFactor ?? 0.72));
  const peakStart = Number(at.peakHourStart ?? 18);
  const peakEnd = Number(at.peakHourEnd ?? 22);
  if (h >= peakStart && h <= peakEnd) return Math.max(0.5, Number(at.peakFactor ?? 1.2));
  return Math.max(0.5, Number(at.defaultTimeFactor ?? 1));
}

function getMemberFactorAdaptive(at?, client?, cfg?) {
  const ref = Math.max(50, Number(at.memberReference ?? 400));
  const minF = Number(at.memberFactorMin ?? 0.78);
  const maxF = Number(at.memberFactorMax ?? 1.38);
  const exp = Number(at.memberExponent ?? 0.28);
  const gid = String(cfg?.guildId || "").trim();
  const g = gid && client?.guilds?.cache?.get(gid);
  const members = Math.max(30, Number(g?.approximateMemberCount || g?.memberCount || ref));
  const raw = (members / ref) ** exp;
  return Math.min(maxF, Math.max(minF, raw));
}

function getSpamPenaltyMultiplier(at?, stats?) {
  const above = Math.max(1.5, Number(at.spamAvgMessagesPerUser ?? 4));
  if (stats.avgPerUser <= above) return 1;
  const per = Number(at.spamPenaltyPerExcess ?? 0.065);
  const cap = Number(at.spamPenaltyCap ?? 0.42);
  return 1 + Math.min(cap, (stats.avgPerUser - above) * per);
}

function computeAdaptiveMinMessages(cfg?, client?, stats?) {
  const at = getActivityThresholdCfg(cfg);
  if (at.enabled === false) return getMinMessages(cfg);
  const base = getMinMessages(cfg);
  const nRaw =
    base *
    getTimeFactorAdaptive(at, client) *
    getMemberFactorAdaptive(at, client, cfg) *
    getSpamPenaltyMultiplier(at, stats);
  const lo = Math.max(1, Math.floor(Number(at.hardMin ?? 12)));
  const hi = Math.max(lo, Math.floor(Number(at.hardMax ?? 120)));
  return Math.min(hi, Math.max(lo, Math.round(nRaw)));
}

function passesUniqueAuthorsGate(cfg?, stats?, effectiveMin?) {
  const at = getActivityThresholdCfg(cfg);
  if (at.enabled === false) return true;
  const minUnique = Math.max(
    2,
    Math.min(14, Math.ceil(effectiveMin / Math.max(4, Number(at.minUniqueDivisor ?? 12)))),
  );
  const bypassMultiple = Math.max(1.2, Number(at.uniqueBypassMultiple ?? 1.65));
  if (stats.uniqueUsers >= minUnique) return true;
  if (stats.count >= effectiveMin * bypassMultiple) return true;
  return false;
}

function isReadyByActivity(cfg?, client?) {
  const activityScopeKey = getActivityScopeKey(cfg);
  if (!activityScopeKey) return false;
  const windowMs = getActivityWindowMs(cfg);
  const stats = getRecentActivityStats(activityScopeKey, windowMs);
  const effectiveMin = computeAdaptiveMinMessages(cfg, client, stats);
  if (stats.count < effectiveMin) return false;
  if (!passesUniqueAuthorsGate(cfg, stats, effectiveMin)) return false;
  return true;
}

const FRESH_SPAWN_ACTIVITY_WINDOW_MS_DEFAULT = 5 * 60 * 1000;
const FRESH_SPAWN_MIN_MESSAGES_DEFAULT = 5;

function getFreshSpawnActivityGate(cfg?) {
  const raw = cfg?.spawnFreshActivity;
  const o = raw && typeof raw === "object" ? raw : {};
  if (o.enabled === false) return null;
  return {
    windowMs: Math.max(60_000, Math.floor(Number(o.windowMs) || FRESH_SPAWN_ACTIVITY_WINDOW_MS_DEFAULT)),
    minMessages: Math.max(1, Math.floor(Number(o.minMessages) || FRESH_SPAWN_MIN_MESSAGES_DEFAULT)),
  };
}

function assessFreshSpawnChatActivity(cfg?) {
  const gate = getFreshSpawnActivityGate(cfg);
  if (!gate) return { ok: true, skipped: true };
  const key = getActivityScopeKey(cfg);
  if (!key) return { ok: false, skipped: false, count: 0, ...gate, uniqueUsers: 0 };
  const stats = getRecentActivityStats(key, gate.windowMs);
  return {
    ok: stats.count >= gate.minMessages,
    skipped: false,
    count: stats.count,
    uniqueUsers: stats.uniqueUsers,
    minMessages: gate.minMessages,
    windowMs: gate.windowMs,
  };
}

function getActivityScopeKey(cfg?) {
  return String(cfg?.channelId || "");
}

function getFailsafeMs(cfg?) {
  return Math.max(60 * 1000, Number(cfg?.failsafeMs || 90 * 60 * 1000));
}

function recordActivity(activityScopeKey?, windowMs?, userId?) {
  if (!activityScopeKey) return;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const uid = userId != null && String(userId).trim() ? String(userId).trim() : null;
  const list = recentMessages.get(activityScopeKey) || [];
  list.push({ t: now, u: uid });
  const cutoff = now - safeWindowMs;
  const trimmed = [];
  for (const raw of list) {
    const e = normalizeActivityEntry(raw);
    if (e && e.t >= cutoff) trimmed.push(e);
  }
  recentMessages.set(activityScopeKey, trimmed);
}

async function backfillRecentChatActivityFromHistory(client?, cfg?) {
  const channelId = String(cfg?.channelId || "").trim();
  const scopeKey = getActivityScopeKey(cfg);
  if (!client || !channelId || !scopeKey) return { ok: false, count: 0 };
  const windowMs = Math.max(
    getActivityWindowMs(cfg),
    getFreshSpawnActivityGate(cfg)?.windowMs || 0,
    5 * 60 * 1000,
  );
  const channel = await getChannelCached(client, channelId);
  if (!channel?.messages?.fetch) return { ok: false, count: 0 };
  const cutoff = Date.now() - windowMs;
  let fetched;
  try {
    fetched = await channel.messages.fetch({ limit: 100 });
  } catch (err) {
    warnMinigame(err);
    return { ok: false, count: 0 };
  }
  const entries = [];
  for (const msg of fetched.values()) {
    if (!msg || msg.author?.bot) continue;
    const t = msg.createdTimestamp || 0;
    if (!t || t < cutoff) continue;
    const uid = msg.author?.id != null ? String(msg.author.id).trim() : null;
    if (!uid) continue;
    entries.push({ t, u: uid });
  }
  entries.sort((a?, b?) => a.t - b.t);
  if (!entries.length) return { ok: true, count: 0 };
  const existing = recentMessages.get(scopeKey) || [];
  const merged = [...existing, ...entries]
    .map(normalizeActivityEntry)
    .filter((e?) => e && e.t >= cutoff)
    .sort((a?, b?) => a.t - b.t);
  recentMessages.set(scopeKey, merged);
  return { ok: true, count: merged.length };
}

function getRecentCount(activityScopeKey?, windowMs?) {
  return getRecentActivityStats(activityScopeKey, windowMs).count;
}

function isFailsafeDue(cfg?) {
  const channelId = cfg?.channelId;
  const activityScopeKey = getActivityScopeKey(cfg);
  if (!channelId || !activityScopeKey) return false;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  if (!lastSent) return true;
  if (Date.now() - lastSent < getFailsafeMs(cfg)) return false;
  const minActivityForFailsafe = Math.max(8, Math.floor(getMinMessages(cfg) * 0.5));
  if (getRecentCount(activityScopeKey, getActivityWindowMs(cfg)) < minActivityForFailsafe) return false;
  return true;
}

function canCountMessageForActivity(message?) {
  if (!message?.guild || !message?.channel) return false;
  const channelId = String(message.channel?.id || "");
  const allowedChannelIds = new Set(
    [IDs.channels.chat, IDs.channels.media]
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!allowedChannelIds.has(channelId)) return false;
  const memberRoleId = String(IDs.roles.Member || "");
  if (!memberRoleId) return false;
  const memberRole = message.guild.roles?.cache?.get(memberRoleId) || null;
  if (!memberRole) return false;
  const perms = message.channel.permissionsFor(memberRole);
  if (!perms) return false;
  return perms.has("ViewChannel") && perms.has("SendMessages");
}

function getRecentQuestionKey(questionKey?) {
  return String(questionKey || "").trim().toLowerCase();
}

export = { lastSentAtByChannel, getActivityWindowMs, getMinMessages, getRecentActivityStats, computeAdaptiveMinMessages, isReadyByActivity, assessFreshSpawnChatActivity, getActivityScopeKey, recordActivity, backfillRecentChatActivityFromHistory, isFailsafeDue, canCountMessageForActivity, getRecentQuestionKey };
