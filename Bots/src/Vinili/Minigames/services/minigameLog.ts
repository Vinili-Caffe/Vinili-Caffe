/** Minigiochi: log, avvisi e pausa dopo i 429 di TheSportsDB. */
const MINIGAME_429_THROTTLE_MS = 60 * 60 * 1000;
const MINIGAME_403_THROTTLE_MS = 60 * 1000;
let last429LogAt = 0;
let last403LogAt = 0;
let sportsDb429Until = 0;
let sportsDb429Consecutive = 0;
let sportsDb429LastHitAt = 0;
/** Free-tier TheSportsDB 429 is routine; keep quiet and back off hard. */
const SPORTSDB_429_BACKOFF_FLOOR_MS = 15 * 60_000;
const SPORTSDB_429_BACKOFF_CAP_MS = 6 * 60 * 60_000;
const MINIGAME_DEBUG = String(process.env.MINIGAME_DEBUG || "0") === "1";
const MINIGAME_SPAWN_LOG = String(process.env.MINIGAME_SPAWN_LOG || "0") === "1";

function logMinigameSpawn(message?, data = null, level = "info") {
  if (!MINIGAME_SPAWN_LOG) return;
  const prefix = `[MINIGAMES-SPAWN] ${message}`;
  const logger = global.logger;
  if (!logger) return;
  if (level === "warn") {
    if (data != null && typeof data === "object") logger.warn?.(prefix, data);
    else logger.warn?.(prefix);
    return;
  }
  if (data != null && typeof data === "object") logger.info?.(prefix, data);
  else logger.info?.(prefix);
}

function shouldLogMinigameSpawnForCfg(cfg?, client?) {
  return false;
}

function logMaybeStartSkip(cfg?, client?, reason?, extra = null) {
  if (!shouldLogMinigameSpawnForCfg(cfg, client)) return;
  const payload = { channelId: cfg?.channelId || null, reason, ...(extra && typeof extra === "object" ? extra : {}) };
  logMinigameSpawn("maybeStart blocked", payload, "warn");
}

function isBenignDiscordMinigameError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if ([10003, 10008, 10014, 10062, 50001, 50013, 90001].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "");
  if (/unknown message/i.test(msg)) return true;
  if (/unknown emoji/i.test(msg)) return true;
  if (/missing (access|permissions)/i.test(msg)) return true;
  return false;
}

function warnMinigame(err?) {
  if (isBenignDiscordMinigameError(err)) return;
  const msg = err?.message || err?.response?.data || String(err);
  if (typeof msg === "string") {
    if (msg.includes("treasure_hunt_react_failed:decoy")) return;
  }
  const status = err?.response?.status;
  const url = err?.response?.config?.url || err?.config?.url;
  const is429 = status === 429 || (typeof msg === "string" && msg.includes("429"));
  const is403 = status === 403 || (typeof msg === "string" && msg.includes("403"));
  if (is403 && typeof url === "string" && /wikipedia\.org\/api\/rest_v1\/page\/summary/i.test(url)) return;
  if (is429 && typeof url === "string" && /thesportsdb\.com/i.test(url)) {
    noteSportsDb429(err);
    return;
  }
  const now = Date.now();
  if (is429 && now - last429LogAt < MINIGAME_429_THROTTLE_MS) return;
  if (is429) last429LogAt = now;
  if (is403 && now - last403LogAt < MINIGAME_403_THROTTLE_MS) return;
  if (is403) last403LogAt = now;
  const is503 = status === 503 || (typeof msg === "string" && /status code 503/i.test(msg));
  let host = null;
  try { host = url ? new URL(String(url)).host : null; } catch { host = null; }
  let logMsg = is403 ? `${msg} (API 403 Forbidden: chiave/permessi o IP bloccato)` : msg;
  if (is429) {
    logMsg = `429 rate limit${host ? ` (${host})` : ""}`;
  } else if (is503) {
    logMsg = `503 service unavailable${host ? ` (${host})` : ""}`;
  }
  if (is403 && url) logMsg += ` URL: ${typeof url === "string" ? url.replace(/\/api\/v1\/json\/[^/]+/, "/api/v1/json/***") : url}`;
  global.logger?.warn?.(`[minigameService] ${logMsg}`);
}

function noteSportsDb429(err?) {
  const now = Date.now();
  const retryAfterRaw = err?.response?.headers?.["retry-after"] || err?.response?.headers?.["Retry-After"];
  if (now - sportsDb429LastHitAt < SPORTSDB_429_BACKOFF_FLOOR_MS) sportsDb429Consecutive += 1;
  else sportsDb429Consecutive = 1;
  sportsDb429LastHitAt = now;
  let retryAfterMs = 0;
  if (typeof retryAfterRaw === "string" && retryAfterRaw.trim()) {
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum > 0) retryAfterMs = asNum * 1000;
    else {
      const t = Date.parse(retryAfterRaw);
      if (Number.isFinite(t)) retryAfterMs = Math.max(0, t - now);
    }
  }
  if (!retryAfterMs) {
    const expMultiplier = Math.min(8, 2 ** Math.max(0, sportsDb429Consecutive - 1));
    retryAfterMs = SPORTSDB_429_BACKOFF_FLOOR_MS * expMultiplier;
  }
  retryAfterMs = Math.min(SPORTSDB_429_BACKOFF_CAP_MS, Math.max(SPORTSDB_429_BACKOFF_FLOOR_MS, retryAfterMs));
  sportsDb429Until = Math.max(sportsDb429Until, now + retryAfterMs);
}

function isSportsDbCoolingDown() {
  return Date.now() < sportsDb429Until;
}

function logMinigameDebug(message?, data = null) {
  if (!MINIGAME_DEBUG) return;
  if (data && typeof data === "object") {
    global.logger?.info?.(`[MINIGAMES][DEBUG] ${message}`, data);
    return;
  }
  global.logger?.info?.(`[MINIGAMES][DEBUG] ${message}`);
}

function is429Error(error?) {
  const status = error?.response?.status;
  const msg = error?.message || String(error);
  return status === 429 || (typeof msg === "string" && msg.includes("429"));
}

export = { logMinigameSpawn, logMaybeStartSkip, isBenignDiscordMinigameError, warnMinigame, noteSportsDb429, isSportsDbCoolingDown, logMinigameDebug, is429Error };
