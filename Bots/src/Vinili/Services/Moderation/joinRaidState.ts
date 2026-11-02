const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  joinRaidFindOneLean,
  joinRaidUpdateOneUpsert,
} = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { JOIN_RAID_CONFIG } = require("./joinRaidConfig") as typeof import("./joinRaidConfig");

const VERIFIED_BOT_IDS = new Set(
  Object.values(IDs?.bots || {})
    .filter(Boolean)
    .map(String),
);
const GUILD_STATE = new Map();
const TEMP_BAN_TIMERS = new Map();
const RAID_REPORT_TIMERS = new Map();
const SAVE_TIMERS = new Map();
const LOADED_GUILDS = new Set();
const LOAD_SUCCEEDED_GUILDS = new Set();
const LOAD_GUILD_PROMISES = new Map();
const GUILD_LOCKS = new Map();
const CLEARED_GUILDS = new Set();
const LAST_RESTORE_AT = new Map();
const VERIFIED_BOT_CACHE = new Map();
const LOW_RISK_FLAG_LOG_COOLDOWN = new Map();
const RESTORE_COOLDOWN_MS = 45_000;
const LOW_RISK_FLAG_LOG_COOLDOWN_MS = 20_000;

async function withGuildLock(guildId?, task?) {
  const key = String(guildId || "");
  const prev = GUILD_LOCKS.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => task());
  const lockPromise = run.finally(() => {
    if (GUILD_LOCKS.get(key) === lockPromise) {
      GUILD_LOCKS.delete(key);
    }
  });
  GUILD_LOCKS.set(key, lockPromise);
  return run;
}

function getGuildState(guildId?) {
  const key = String(guildId || "");
  const existing = GUILD_STATE.get(key);
  if (existing) return existing;
  const initial = {
    samples: [],
    flagged: [],
    tempBans: [],
    raidUntil: 0,
    raidCaseCode: "",
    raidStartedAt: 0,
    raidInitialFlaggedUserIds: [],
    raidCaughtUserIds: [],
  };
  GUILD_STATE.set(key, initial);
  return initial;
}

function nowMs() {
  return Date.now();
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

async function loadGuildState(guildId?) {
  const key = String(guildId || "");
  if (!key || CLEARED_GUILDS.has(key) || LOADED_GUILDS.has(key)) return;
  if (!isDbReady()) return;
  const existingLoad = LOAD_GUILD_PROMISES.get(key);
  if (existingLoad) {
    await existingLoad;
    return;
  }
  const loader = (async () => {
    try {
      if (CLEARED_GUILDS.has(key)) return;
      const row = await joinRaidFindOneLean(key);
      if (CLEARED_GUILDS.has(key)) return;
      if (row) {
        GUILD_STATE.set(key, {
          samples: Array.isArray(row.samples) ? row.samples : [],
          flagged: Array.isArray(row.flagged) ? row.flagged : [],
          tempBans: Array.isArray(row.tempBans) ? row.tempBans : [],
          raidUntil: Number(row.raidUntil || 0),
          raidCaseCode: String(row.raidCaseCode || ""),
          raidStartedAt: Number(row.raidStartedAt || 0),
          raidInitialFlaggedUserIds: Array.isArray(row.raidInitialFlaggedUserIds)
            ? row.raidInitialFlaggedUserIds
                .map((x?) => String(x || ""))
                .filter(Boolean)
            : [],
          raidCaughtUserIds: Array.isArray(row.raidCaughtUserIds)
            ? row.raidCaughtUserIds.map((x?) => String(x || "")).filter(Boolean)
            : [],
        });
      }
      if (!CLEARED_GUILDS.has(key)) LOAD_SUCCEEDED_GUILDS.add(key);
    } catch (err) {
      global.logger?.warn?.(
        "[joinRaid] loadGuildState failed:",
        key,
        err?.message || err,
      );
    } finally {
      if (!CLEARED_GUILDS.has(key)) LOADED_GUILDS.add(key);
      LOAD_GUILD_PROMISES.delete(key);
    }
  })();
  LOAD_GUILD_PROMISES.set(key, loader);
  await loader;
}

function scheduleStateSave(guildId?) {
  const key = String(guildId || "");
  if (!key || !isDbReady() || CLEARED_GUILDS.has(key)) return;
  if (!LOAD_SUCCEEDED_GUILDS.has(key)) return;
  const old = SAVE_TIMERS.get(key);
  if (old) clearTimeout(old);
  const timer = setTimeout(async () => {
    SAVE_TIMERS.delete(key);
    const state = getGuildState(key);
    pruneState(state, nowMs());
    try {
      await joinRaidUpdateOneUpsert(key, {
        raidUntil: Number(state.raidUntil || 0),
        samples: state.samples.slice(-300),
        flagged: state.flagged.slice(-300),
        tempBans: Array.isArray(state.tempBans)
          ? state.tempBans.slice(-300)
          : [],
        raidCaseCode: String(state.raidCaseCode || ""),
        raidStartedAt: Number(state.raidStartedAt || 0),
        raidInitialFlaggedUserIds: Array.isArray(state.raidInitialFlaggedUserIds)
          ? state.raidInitialFlaggedUserIds.slice(-80)
          : [],
        raidCaughtUserIds: Array.isArray(state.raidCaughtUserIds)
          ? state.raidCaughtUserIds.slice(-300)
          : [],
      });
    } catch (err) {
      global.logger?.warn?.(
        "[joinRaid] scheduleStateSave failed:",
        key,
        err?.message || err,
      );
    }
  }, 1_500);
  timer.unref?.();
  SAVE_TIMERS.set(key, timer);
}

function pruneState(state?, at = nowMs()) {
  const minSampleTs = at - JOIN_RAID_CONFIG.idFlag.compareWindowMs;
  const minFlagTs = at - JOIN_RAID_CONFIG.triggerWindowMs;
  if (!Array.isArray(state.samples)) state.samples = [];
  if (!Array.isArray(state.flagged)) state.flagged = [];
  let sampleIdx = 0;
  while (
    sampleIdx < state.samples.length &&
    Number(state.samples[sampleIdx]?.ts || 0) < minSampleTs
  ) {
    sampleIdx += 1;
  }
  if (sampleIdx > 0) state.samples.splice(0, sampleIdx);
  let flaggedIdx = 0;
  while (
    flaggedIdx < state.flagged.length &&
    Number(state.flagged[flaggedIdx]?.ts || 0) < minFlagTs
  ) {
    flaggedIdx += 1;
  }
  if (flaggedIdx > 0) state.flagged.splice(0, flaggedIdx);
  if (!Array.isArray(state.tempBans)) state.tempBans = [];
  if (!Array.isArray(state.raidInitialFlaggedUserIds)) {
    state.raidInitialFlaggedUserIds = [];
  }
  if (!Array.isArray(state.raidCaughtUserIds)) state.raidCaughtUserIds = [];
  if (typeof state.raidCaseCode !== "string") state.raidCaseCode = "";
  if (!Number.isFinite(Number(state.raidStartedAt || 0))) state.raidStartedAt = 0;
  state.tempBans = state.tempBans.filter(
    (x?) =>
      String(x?.userId || "").length > 0 && Number(x?.unbanAt || 0) > at,
  );
}

function makeJoinRaidCaseCode() {
  const token = Math.random().toString(36).slice(2, 10);
  const stamp = String(Date.now()).slice(-8);
  return `${token}_${stamp}`;
}

function clearGuildState(guildId?) {
  const key = String(guildId || "");
  if (!key) return;
  CLEARED_GUILDS.add(key);
  GUILD_STATE.delete(key);
  LOADED_GUILDS.delete(key);
  LOAD_SUCCEEDED_GUILDS.delete(key);
  const saveTimer = SAVE_TIMERS.get(key);
  if (saveTimer) {
    clearTimeout(saveTimer);
    SAVE_TIMERS.delete(key);
  }
  const reportTimer = RAID_REPORT_TIMERS.get(key);
  if (reportTimer) {
    clearTimeout(reportTimer);
    RAID_REPORT_TIMERS.delete(key);
  }
  LOAD_GUILD_PROMISES.delete(key);
  GUILD_LOCKS.delete(key);
  LAST_RESTORE_AT.delete(key);
  const tempBanKeys = [...TEMP_BAN_TIMERS.keys()].filter((k?) =>
    k.startsWith(`${key}:`),
  );
  for (const timerKey of tempBanKeys) {
    const t = TEMP_BAN_TIMERS.get(timerKey);
    if (t) clearTimeout(t);
    TEMP_BAN_TIMERS.delete(timerKey);
  }
  const cooldownKeys = [...LOW_RISK_FLAG_LOG_COOLDOWN.keys()].filter((k?) =>
    k.startsWith(`${key}:`),
  );
  for (const cooldownKey of cooldownKeys) {
    LOW_RISK_FLAG_LOG_COOLDOWN.delete(cooldownKey);
  }
}

export = {
  VERIFIED_BOT_IDS,
  VERIFIED_BOT_CACHE,
  TEMP_BAN_TIMERS,
  RAID_REPORT_TIMERS,
  CLEARED_GUILDS,
  LAST_RESTORE_AT,
  LOW_RISK_FLAG_LOG_COOLDOWN,
  RESTORE_COOLDOWN_MS,
  LOW_RISK_FLAG_LOG_COOLDOWN_MS,
  LOAD_SUCCEEDED_GUILDS,
  withGuildLock,
  getGuildState,
  nowMs,
  isDbReady,
  loadGuildState,
  scheduleStateSave,
  pruneState,
  makeJoinRaidCaseCode,
  clearGuildState,
};
