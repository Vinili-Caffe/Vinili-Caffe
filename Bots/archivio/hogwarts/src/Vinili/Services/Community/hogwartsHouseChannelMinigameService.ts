const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const mongoose = require("mongoose") as typeof import("mongoose");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year?, month?, day?, hour?, minute?, second = 0, ms = 0) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

const HOUSE_CHANNEL_KEYS = Object.freeze({
  gryffindor: "hogwartsHouseGryffindor",
  hufflepuff: "hogwartsHouseHufflepuff",
  ravenclaw: "hogwartsHouseRavenclaw",
  slytherin: "hogwartsHouseSlytherin",
});
const THEMED_GAME_TYPES = Object.freeze(["hogwartsQuiz", "hogwartsMemoryEmoji", "hogwartsCipher"]);
const TOWER_GAME_TYPE = "hogwartsObservationTower";
const DEFAULT_DURATION_MS = 60_000;
const DEFAULT_HOURLY_POINTS = 20;
const HOUSE_SCHEDULER_DOC_TYPE = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_CHANNEL_MINIGAME_SCHEDULER;
const CHECKPOINT_INTERVAL_MS = 60_000;
const DEFAULT_CATCH_UP_GRACE_MS = 900_000;
const DEFAULT_OVERDUE_FIRE_MS = 120_000;
const schedulersByClient = new WeakMap();
const persistTimerByClient = new WeakMap();
let shutdownPersistArmed = false;
let persistClientRef = null;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function readHouseChannelMinigameCfg(client?) {
  const raw = client?.config?.minigames?.hogwartsHouseChannelMinigames;
  if (!raw || raw.enabled === false) return null;
  return raw;
}

function resolveHouseChannelId(houseId?) {
  const hid = String(houseId || "").trim().toLowerCase();
  const key = HOUSE_CHANNEL_KEYS[hid];
  if (!key) return "";
  return String(IDs.channels?.[key] || "").trim();
}

function buildHouseChannelMap() {
  const out = new Map();
  for (const houseId of HOUSES) {
    const channelId = resolveHouseChannelId(houseId);
    if (channelId) out.set(channelId, houseId);
  }
  return out;
}

const HOUSE_CHANNEL_MAP = buildHouseChannelMap();

function isHogwartsEventLiveForHouseChannels(client?) {
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!eventCfg?.enabled) return false;
  const now = Date.now();
  const start = Number(eventCfg.sortingStartMs ?? eventCfg.startMs);
  const end = Number(eventCfg.endMs);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function romeMsFromParts(year?, month?, day?, hour?, minute?) {
  return createUtcFromRomeLocal(year, month, day, hour, minute, 0, 0).getTime();
}

function getRomeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function readMinuteOffset(rawOffsets?, houseId?, fallback?) {
  const hid = String(houseId || "").trim();
  const n = Math.floor(Number(rawOffsets?.[hid]));
  return Number.isFinite(n) ? Math.max(0, Math.min(59, n)) : fallback;
}

function resolveInclusiveLastHour(cfg?, fallback = 23) {
  const hourStart = Math.max(0, Math.floor(Number(cfg?.hourStart ?? 12)));
  const hourEnd = Math.max(hourStart, Math.floor(Number(cfg?.hourEnd ?? fallback)));
  return Math.min(23, hourEnd);
}

function resolveSpawnMinute(hour?, offset?) {
  return offset;
}

function shouldSkipSpawnSlot(parts?, dayShift?, day?, hour?, minute?, hourStart?) {
  if (dayShift !== 0 || day !== parts.day) return false;
  if (hour === 24 && parts.hour < hourStart) return true;
  if (hour < parts.hour) return true;
  if (hour === parts.hour && minute <= parts.minute) return true;
  return false;
}

function nextHourlySpawnMs(houseId?, cfg?, nowMs = Date.now()) {
  const hourStart = Math.max(0, Math.floor(Number(cfg?.hourStart ?? 12)));
  const lastHour = resolveInclusiveLastHour(cfg);
  const offset = readMinuteOffset(cfg?.hourlyMinuteOffsets, houseId, HOUSES.indexOf(houseId) * 12);
  const parts = getRomeParts(new Date(nowMs));
  for (let dayShift = 0; dayShift < 2; dayShift += 1) {
    const day = parts.day + dayShift;
    const month = parts.month;
    const year = parts.year;
    for (let hour = hourStart; hour <= lastHour; hour += 1) {
      const minute = resolveSpawnMinute(hour, offset);
      if (shouldSkipSpawnSlot(parts, dayShift, day, hour, minute, hourStart)) continue;
      const ms = romeMsFromParts(year, month, day, hour, minute);
      if (Number.isFinite(ms) && ms > nowMs) return ms;
    }
  }
  return nowMs + 3_600_000;
}

function nextTowerSpawnMs(houseId?, cfg?, nowMs = Date.now()) {
  const intervalHours = Math.max(2, Math.floor(Number(cfg?.towerIntervalHours ?? 2)));
  const firstHour = Math.max(0, Math.floor(Number(cfg?.towerFirstHour ?? 12)));
  const lastHour = resolveInclusiveLastHour(cfg);
  const hourStart = Math.max(0, Math.floor(Number(cfg?.hourStart ?? 12)));
  const offset = readMinuteOffset(cfg?.towerMinuteOffsets, houseId, 8 + HOUSES.indexOf(houseId) * 15);
  const parts = getRomeParts(new Date(nowMs));
  for (let dayShift = 0; dayShift < 3; dayShift += 1) {
    const day = parts.day + dayShift;
    const month = parts.month;
    const year = parts.year;
    for (let hour = firstHour; hour <= lastHour; hour += intervalHours) {
      const minute = resolveSpawnMinute(hour, offset);
      if (shouldSkipSpawnSlot(parts, dayShift, day, hour, minute, hourStart)) continue;
      const ms = romeMsFromParts(year, month, day, hour, minute);
      if (Number.isFinite(ms) && ms > nowMs) return ms;
    }
  }
  return nowMs + intervalHours * 3_600_000;
}

function listScheduledHoursForMode(mode?, cfg?) {
  const hourStart = Math.max(0, Math.floor(Number(cfg?.hourStart ?? 12)));
  const lastHour = resolveInclusiveLastHour(cfg);
  if (mode === "tower") {
    const intervalHours = Math.max(2, Math.floor(Number(cfg?.towerIntervalHours ?? 2)));
    const firstHour = Math.max(0, Math.floor(Number(cfg?.towerFirstHour ?? 12)));
    const out = [];
    for (let hour = firstHour; hour <= lastHour; hour += intervalHours) out.push(hour);
    return out;
  }
  const out = [];
  for (let hour = hourStart; hour <= lastHour; hour += 1) out.push(hour);
  return out;
}

function latestScheduledSlotMs(houseId?, mode?, cfg?, nowMs = Date.now()) {
  const isTower = mode === "tower";
  const offset = isTower
    ? readMinuteOffset(cfg?.towerMinuteOffsets, houseId, 8 + HOUSES.indexOf(houseId) * 15)
    : readMinuteOffset(cfg?.hourlyMinuteOffsets, houseId, HOUSES.indexOf(houseId) * 12);
  const parts = getRomeParts(new Date(nowMs));
  const hours = listScheduledHoursForMode(mode, cfg);
  let best = null;
  for (let dayShift = -1; dayShift <= 0; dayShift += 1) {
    const day = parts.day + dayShift;
    const month = parts.month;
    const year = parts.year;
    for (const hour of hours) {
      const minute = resolveSpawnMinute(hour, offset);
      const ms = romeMsFromParts(year, month, day, hour, minute);
      if (!Number.isFinite(ms) || ms > nowMs) continue;
      if (best == null || ms > best) best = ms;
    }
  }
  return best;
}

function resolveSchedulerGuildId(client?) {
  return String(IDs.guilds?.main || "").trim();
}

function resolveSchedulerDedupeKey(client?) {
  const eventCfg: any = resolveHogwartsEventConfig(client);
  const fromEvent = String(eventCfg?.dedupeKey || eventCfg?.eventKey || "").trim();
  return fromEvent || "default";
}

function serializeSchedulerState(state?) {
  const next: Record<string, any> = {};
  const last: Record<string, any> = {};
  for (const [key, ms] of state.nextFireAtByKey.entries()) {
    const n = Math.floor(Number(ms));
    if (key && Number.isFinite(n) && n > 0) next[key] = n;
  }
  for (const [key, ms] of (state.lastFiredAtByKey || new Map()).entries()) {
    const n = Math.floor(Number(ms));
    if (key && Number.isFinite(n) && n > 0) last[key] = n;
  }
  return {
    next,
    last,
    themed: state.themedIndexByHouse && typeof state.themedIndexByHouse === "object" ? state.themedIndexByHouse : {},
  };
}

function hydrateSchedulerState(payload?) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const state = {
    timers: new Map(),
    nextFireAtByKey: new Map(),
    lastFiredAtByKey: new Map(),
    themedIndexByHouse: raw.themed && typeof raw.themed === "object" ? { ...raw.themed } : {},
  };
  const next = raw.next && typeof raw.next === "object" ? raw.next : {};
  const last = raw.last && typeof raw.last === "object" ? raw.last : {};
  for (const [key, value] of Object.entries(next)) {
    const ms = Math.floor(Number(value));
    if (key && Number.isFinite(ms) && ms > 0) state.nextFireAtByKey.set(key, ms);
  }
  for (const [key, value] of Object.entries(last)) {
    const ms = Math.floor(Number(value));
    if (key && Number.isFinite(ms) && ms > 0) state.lastFiredAtByKey.set(key, ms);
  }
  return state;
}

async function persistHouseChannelScheduler(client?, state?) {
  if (!state || mongoose.connection?.readyState !== 1) return false;
  const guildId = resolveSchedulerGuildId(client);
  if (!guildId) return false;
  const dedupeKey = resolveSchedulerDedupeKey(client);
  const payload = serializeSchedulerState(state);
  const nextValues = Object.values(payload.next).map((v?) => Math.floor(Number(v))).filter((n?) => Number.isFinite(n) && n > 0);
  const checkpointUntil = nextValues.length ? Math.max(Date.now() + 60_000, ...nextValues) : Date.now() + 3_600_000;
  await SiteDocument.findOneAndUpdate(
    { docType: HOUSE_SCHEDULER_DOC_TYPE, dedupeKey },
    {
      $set: {
        guildId,
        status: "active",
        rawWebhook: payload,
        cooldownUntil: new Date(checkpointUntil),
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return true;
}

async function restoreHouseChannelSchedulerFromDb(client?) {
  if (mongoose.connection?.readyState !== 1) return null;
  const guildId = resolveSchedulerGuildId(client);
  if (!guildId) return null;
  const dedupeKey = resolveSchedulerDedupeKey(client);
  const doc = await SiteDocument.findOne({
    docType: HOUSE_SCHEDULER_DOC_TYPE,
    dedupeKey,
  })
    .select("rawWebhook updatedAt")
    .lean()
    .catch(() => null);
  if (!doc?.rawWebhook) return null;
  return hydrateSchedulerState(doc.rawWebhook);
}

function clearHouseChannelPersistTimer(client?) {
  const timer = persistTimerByClient.get(client);
  if (!timer) return;
  try {
    clearInterval(timer);
  } catch (_) {}
  persistTimerByClient.delete(client);
}

function scheduleHouseChannelPersistLoop(client?) {
  clearHouseChannelPersistTimer(client);
  if (!schedulersByClient.has(client)) return;
  const timer = setInterval(() => {
    const state = schedulersByClient.get(client);
    if (!state) {
      clearHouseChannelPersistTimer(client);
      return;
    }
    void persistHouseChannelScheduler(client, state);
  }, CHECKPOINT_INTERVAL_MS);
  timer.unref?.();
  persistTimerByClient.set(client, timer);
}

function armHouseChannelSchedulerPersist(client?) {
  persistClientRef = client;
  scheduleHouseChannelPersistLoop(client);
  if (shutdownPersistArmed) return;
  shutdownPersistArmed = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_hogwarts_house_channel_scheduler", async () => {
    const ref = persistClientRef;
    const state = ref ? schedulersByClient.get(ref) : null;
    if (ref && state) await persistHouseChannelScheduler(ref, state);
  });
}

function resolveFireAtMs(houseId?, mode?, cfg?, state?, nowMs = Date.now()) {
  const key = `${houseId}:${mode}`;
  const graceMs = Math.max(60_000, Math.floor(Number(cfg?.restartCatchUpGraceMs ?? DEFAULT_CATCH_UP_GRACE_MS)));
  const overdueMs = Math.max(30_000, Math.floor(Number(cfg?.restartOverdueFireMs ?? DEFAULT_OVERDUE_FIRE_MS)));
  const persisted = Math.floor(Number(state.nextFireAtByKey.get(key)) || 0);
  const calendarNext = mode === "tower" ? nextTowerSpawnMs(houseId, cfg, nowMs) : nextHourlySpawnMs(houseId, cfg, nowMs);
  const latestSlot = latestScheduledSlotMs(houseId, mode, cfg, nowMs);
  const lastFired = Math.floor(Number(state.lastFiredAtByKey?.get(key)) || 0);
  const modeStaggerMs = mode === "tower" ? 25_000 : 0;
  const staggerMs = 1500 + Math.max(0, HOUSES.indexOf(houseId)) * 800 + modeStaggerMs;
  if (latestSlot && lastFired >= latestSlot) {
    return calendarNext;
  }
  if (persisted > nowMs) return persisted;
  if (latestSlot && latestSlot > lastFired && nowMs - latestSlot <= graceMs) {
    return nowMs + staggerMs;
  }
  if (persisted > 0 && lastFired < latestSlot && nowMs - persisted <= overdueMs) {
    return nowMs + staggerMs;
  }
  return calendarNext;
}

function resolveHouseRoleId(client?, houseId?) {
  const hid = String(houseId || "").trim().toLowerCase();
  if (!hid) return "";
  const eventCfg = resolveHogwartsEventConfig(client);
  const fromEvent = String(eventCfg?.houses?.[hid]?.roleId || "").trim();
  if (fromEvent) return fromEvent;
  const fromConfig = String(client?.config?.hogwartsEvent?.houses?.[hid]?.roleId || "").trim();
  return fromConfig;
}

function parseHouseChannelTowerStartMs(client?) {
  const houseRaw = client?.config?.minigames?.hogwartsHouseChannelMinigames;
  const houseCfg = houseRaw && typeof houseRaw === "object" ? houseRaw : {};
  const startDate = String(houseCfg.towerStartDate || "").trim();
  if (startDate) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? `${startDate}T14:00:00` : startDate;
    const ms = new Date(normalized).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventStart = Number(eventCfg?.sortingStartMs ?? eventCfg?.startMs);
  return Number.isFinite(eventStart) ? eventStart : null;
}

function isHouseChannelTowerSpawnUnlocked(client?, nowMs = Date.now()) {
  if (!isHogwartsEventLiveForHouseChannels(client)) return false;
  const houseRaw = client?.config?.minigames?.hogwartsHouseChannelMinigames;
  const houseCfg = houseRaw && typeof houseRaw === "object" ? houseRaw : {};
  if (houseCfg.towerEnabled === false) return false;
  const startMs = parseHouseChannelTowerStartMs(client);
  return Number.isFinite(startMs) && nowMs >= startMs;
}

function cloneMinigameTypeBlock(raw?, durationMs?) {
  if (raw === false) return false;
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    ...base,
    durationMs,
  };
}

function isHouseChannelThemedTypeSpawnable(spawnCfg?, type?) {
  const t = String(type || "").trim();
  if (t === "hogwartsQuiz") {
    return spawnCfg?.hogwartsQuiz !== false && Boolean(spawnCfg?.hogwartsQuiz?.eventLive);
  }
  if (t === "hogwartsMemoryEmoji") {
    return (
      spawnCfg?.hogwartsMemoryEmoji !== false &&
      Boolean(spawnCfg?.hogwartsMemoryEmoji?.eventLive) &&
      Boolean(spawnCfg?.hogwartsMemoryEmoji?.unlocked)
    );
  }
  if (t === "hogwartsCipher") {
    return (
      spawnCfg?.hogwartsCipher !== false &&
      Boolean(spawnCfg?.hogwartsCipher?.eventLive) &&
      Boolean(spawnCfg?.hogwartsCipher?.unlocked)
    );
  }
  if (t === "findScroll") {
    return (
      spawnCfg?.findScroll !== false &&
      Boolean(spawnCfg?.findScroll?.eventLive) &&
      Boolean(spawnCfg?.findScroll?.unlocked)
    );
  }
  return false;
}

function listUnlockedHouseThemedTypes(client?, spawnCfg?) {
  const cfg = readHouseChannelMinigameCfg(client);
  const rawTypes = Array.isArray(cfg?.themedGameTypes) && cfg.themedGameTypes.length
    ? cfg.themedGameTypes.map((t?) => String(t || "").trim()).filter(Boolean)
    : THEMED_GAME_TYPES.slice();
  const allowed = rawTypes.filter((t?) => THEMED_GAME_TYPES.includes(t) || t === "findScroll");
  const pool = allowed.length ? allowed : THEMED_GAME_TYPES.slice();
  return pool.filter((type?) => isHouseChannelThemedTypeSpawnable(spawnCfg, type));
}

function buildHouseChannelSpawnCfg(client?, channelId?, houseId?, mode?, towerTierOverride = null) {
  const { getConfig, pickObservationTowerTier } = require("../Minigames/minigameService") as typeof import("../Minigames/minigameService");
  const base = getConfig(client);
  if (!base?.enabled) return null;
  const cfgRaw = readHouseChannelMinigameCfg(client);
  if (!cfgRaw) return null;
  const durationMs = mode === "tower"
    ? Math.max(30_000, Math.floor(Number(
      cfgRaw.towerDurationMs ?? cfgRaw.durationMs ?? base?.hogwartsObservationTower?.durationMs ?? DEFAULT_DURATION_MS,
    )))
    : Math.max(30_000, Math.floor(Number(cfgRaw.durationMs ?? DEFAULT_DURATION_MS)));
  const quizDurationMs = Math.max(30_000, Math.floor(Number(cfgRaw.quizDurationMs ?? durationMs)));
  const towerRaw = {
    ...(base?.hogwartsObservationTower && typeof base.hogwartsObservationTower === "object" ? base.hogwartsObservationTower : {}),
    ...(Array.isArray(cfgRaw.towerTiers) && cfgRaw.towerTiers.length ? { tiers: cfgRaw.towerTiers } : {}),
  };
  const towerTier = mode === "tower"
    ? (towerTierOverride || pickObservationTowerTier(towerRaw))
    : null;
  const towerMaxPerUser = Math.max(1, Math.floor(Number(cfgRaw.towerMaxPerUser ?? base?.hogwartsObservationTower?.maxPerUser ?? 10)));
  const towerMinLetters = Math.max(1, Math.floor(Number(cfgRaw.towerMinLetters ?? base?.hogwartsObservationTower?.minLetters ?? 5)));
  const towerHousePoints = Math.max(0, Math.floor(Number(towerTier?.housePoints ?? cfgRaw.towerHousePoints ?? cfgRaw.hourlyHousePoints ?? DEFAULT_HOURLY_POINTS)));
  const towerTargetBricks = Math.max(1, Math.floor(Number(towerTier?.targetBricks ?? cfgRaw.towerTargetBricks ?? base?.hogwartsObservationTower?.targetBricks ?? 50)));
  const towerMinPlayers = Math.max(1, Math.floor(Number(towerTier?.minPlayers ?? cfgRaw.towerMinPlayers ?? base?.hogwartsObservationTower?.minPlayers ?? 5)));
  const hid = String(houseId || "").trim();
  const chId = String(channelId || "").trim();
  if (!hid || !chId) return null;
  const cfg = {
    ...base,
    channelId: chId,
    guildId: String(IDs.guilds?.main || ""),
    roleId: resolveHouseRoleId(client, hid),
    hogwartsHouseChannelSpawn: true,
    hogwartsHouseChannelMeta: {
      houseId: hid,
      mode: mode === "tower" ? "tower" : "themed",
      singleWinner: mode !== "tower",
      housePoints: mode === "tower" ? towerHousePoints : Math.max(1, Math.floor(Number(cfgRaw.hourlyHousePoints ?? DEFAULT_HOURLY_POINTS))),
      soloHouseId: hid,
      durationMs,
    },
    hogwartsQuiz: cloneMinigameTypeBlock(base.hogwartsQuiz, quizDurationMs),
    hogwartsMemoryEmoji: cloneMinigameTypeBlock(base.hogwartsMemoryEmoji, durationMs),
    hogwartsCipher: cloneMinigameTypeBlock(base.hogwartsCipher, durationMs),
    findScroll: cloneMinigameTypeBlock(base.findScroll, durationMs),
    hogwartsObservationTower: (() => {
      const block = cloneMinigameTypeBlock(base.hogwartsObservationTower, durationMs);
      if (!block || typeof block !== "object") return block;
      return {
        ...block,
        durationMs,
        targetBricks: towerTargetBricks,
        maxPerUser: towerMaxPerUser,
        minLetters: towerMinLetters,
        minPlayers: towerMinPlayers,
        housePoints: towerHousePoints,
        tierLocked: true,
        eventLive: isHogwartsEventLiveForHouseChannels(client),
        unlocked: isHouseChannelTowerSpawnUnlocked(client),
      };
    })(),
  };
  return cfg;
}

function resolveHouseChannelMinigameCfg(client?, channelId?) {
  const chId = String(channelId || "").trim();
  const houseId = HOUSE_CHANNEL_MAP.get(chId);
  if (!houseId || !readHouseChannelMinigameCfg(client) || !isHogwartsEventLiveForHouseChannels(client)) return null;
  const game = require("../Minigames/minigameService").getActiveGameForChannel(chId);
  if (!game?.hogwartsHouseChannel) return null;
  return buildHouseChannelSpawnCfg(client, chId, houseId, game.hogwartsHouseChannel.mode === "tower" ? "tower" : "themed");
}

function pickThemedGameType(client?, houseId?, state?, spawnCfg?) {
  const types = listUnlockedHouseThemedTypes(client, spawnCfg);
  if (!types.length) return "";
  const key = String(houseId || "");
  const idx = Math.max(0, Math.floor(Number(state?.themedIndexByHouse?.[key]) || 0));
  const type = types[idx % types.length];
  state.themedIndexByHouse[key] = idx + 1;
  return type;
}

async function trySpawnHouseChannelMinigame(client?, houseId?, mode?, state?) {
  const cfgRaw = readHouseChannelMinigameCfg(client);
  if (!cfgRaw || !isHogwartsEventLiveForHouseChannels(client)) return { ok: false, reason: "inactive" };
  if (isHouseChannelQuietHours(client)) return { ok: false, reason: "quiet_hours" };
  const channelId = resolveHouseChannelId(houseId);
  if (!channelId) return { ok: false, reason: "missing_channel" };
  const { isMinigameChannelBusy, isMainChatMinigameChannelBusy, spawnHouseChannelMinigame } = require("../Minigames/minigameService") as typeof import("../Minigames/minigameService");
  if (isMinigameChannelBusy(channelId)) return { ok: false, reason: "busy" };
  if (isMainChatMinigameChannelBusy()) return { ok: false, reason: "main_chat_busy" };
  const spawnCfg = buildHouseChannelSpawnCfg(client, channelId, houseId, mode);
  if (!spawnCfg) return { ok: false, reason: "config" };
  let gameType = "";
  if (mode === "tower") {
    if (!spawnCfg?.hogwartsObservationTower?.unlocked) return { ok: false, reason: "locked" };
    gameType = TOWER_GAME_TYPE;
  } else {
    gameType = pickThemedGameType(client, houseId, state, spawnCfg);
    if (!gameType) return { ok: false, reason: "locked" };
  }
  const started = await spawnHouseChannelMinigame(client, spawnCfg, gameType);
  return started ? { ok: true } : { ok: false, reason: "failed" };
}

function scheduleHouseChannelJob(client?, houseId?, mode?, state?) {
  const cfg = readHouseChannelMinigameCfg(client);
  if (!cfg) return;
  const now = Date.now();
  const fireAtMs = resolveFireAtMs(houseId, mode, cfg, state, now);
  const delayMs = Math.max(1000, fireAtMs - now);
  const key = `${houseId}:${mode}`;
  const scheduledSlotMs = fireAtMs <= now + 10_000
    ? (latestScheduledSlotMs(houseId, mode, cfg, now) || fireAtMs)
    : fireAtMs;
  const existing = state.timers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    let spawnResult: any = { ok: false, reason: "inactive" };
    try {
      if (isHogwartsEventLiveForHouseChannels(client)) {
        spawnResult = await trySpawnHouseChannelMinigame(client, houseId, mode, state);
      }
    } catch (err) {
      global.logger?.warn?.("[hogwarts-house-minigame] spawn failed:", err?.message || err);
      spawnResult = { ok: false, reason: "failed" };
    } finally {
      const spawned = Boolean(spawnResult?.ok);
      const slotMs = Math.floor(Number(scheduledSlotMs)) || latestScheduledSlotMs(houseId, mode, cfg, Date.now()) || Date.now();
      if (spawned) {
        state.lastFiredAtByKey.set(key, slotMs);
        const nextMs = mode === "tower" ? nextTowerSpawnMs(houseId, cfg, Date.now()) : nextHourlySpawnMs(houseId, cfg, Date.now());
        state.nextFireAtByKey.set(key, nextMs);
      } else if (spawnResult?.reason === "main_chat_busy") {
        state.nextFireAtByKey.set(key, Date.now() + 30_000);
      } else if (spawnResult?.reason === "busy") {
        state.nextFireAtByKey.set(key, Date.now() + 15_000);
      } else if (spawnResult?.reason !== "busy" && slotMs <= Date.now() + 1000) {
        state.lastFiredAtByKey.set(key, slotMs);
        const nextMs = mode === "tower" ? nextTowerSpawnMs(houseId, cfg, Date.now()) : nextHourlySpawnMs(houseId, cfg, Date.now());
        state.nextFireAtByKey.set(key, nextMs);
      }
      scheduleHouseChannelJob(client, houseId, mode, state);
      void persistHouseChannelScheduler(client, state);
    }
  }, delayMs);
  timer.unref?.();
  state.timers.set(key, timer);
  state.nextFireAtByKey.set(key, fireAtMs);
  void persistHouseChannelScheduler(client, state);
}

async function bootstrapHogwartsHouseChannelMinigameScheduler(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return { ok: false, reason: "hogwarts_runtime_disabled" };
  const cfg = readHouseChannelMinigameCfg(client);
  if (!cfg || schedulersByClient.has(client)) return { ok: false, reason: "disabled_or_running" };
  const restored = await restoreHouseChannelSchedulerFromDb(client);
  const state = restored || {
    timers: new Map(),
    nextFireAtByKey: new Map(),
    lastFiredAtByKey: new Map(),
    themedIndexByHouse: {},
  };
  if (!state.lastFiredAtByKey) state.lastFiredAtByKey = new Map();
  schedulersByClient.set(client, state);
  for (const houseId of HOUSES) {
    if (!resolveHouseChannelId(houseId)) continue;
    scheduleHouseChannelJob(client, houseId, "themed", state);
    scheduleHouseChannelJob(client, houseId, "tower", state);
  }
  armHouseChannelSchedulerPersist(client);
  void persistHouseChannelScheduler(client, state);
  return { ok: true, restored: Boolean(restored) };
}

function isHogwartsHouseChannelId(channelId?) {
  return HOUSE_CHANNEL_MAP.has(String(channelId || "").trim());
}

function getHouseIdForChannel(channelId?) {
  return HOUSE_CHANNEL_MAP.get(String(channelId || "").trim()) || "";
}

function isWithinHouseChannelMinigameHours(client?, nowMs = Date.now()) {
  const cfg = readHouseChannelMinigameCfg(client);
  if (!cfg || !isHogwartsEventLiveForHouseChannels(client)) return false;
  const hourStart = Math.max(0, Math.floor(Number(cfg.hourStart ?? 12)));
  const lastHour = resolveInclusiveLastHour(cfg);
  const parts = getRomeParts(new Date(nowMs));
  return parts.hour >= hourStart && parts.hour <= lastHour;
}

function isHouseChannelQuietHours(client?, nowMs = Date.now()) {
  const cfg = readHouseChannelMinigameCfg(client);
  if (!cfg || !isHogwartsEventLiveForHouseChannels(client)) return false;
  return !isWithinHouseChannelMinigameHours(client, nowMs);
}

function listHouseChannelIds() {
  return [...HOUSE_CHANNEL_MAP.keys()];
}

export = {
  bootstrapHogwartsHouseChannelMinigameScheduler,
  buildHouseChannelSpawnCfg,
  getHouseIdForChannel,
  isHogwartsHouseChannelId,
  isHogwartsEventLiveForHouseChannels,
  isWithinHouseChannelMinigameHours,
  isHouseChannelQuietHours,
  listHouseChannelIds,
  resolveHouseChannelMinigameCfg,
  resolveHouseRoleId,
  HOUSE_CHANNEL_MAP,
};