/**
 * When `<KIND>_EXTERNAL=1` on the Discord bot, background loops must no-op there
 * and run only in the process that sets `<KIND>_WORKER=1` (bot-workers / dedicated apps).
 */
const HEARTBEAT_KEY = "externalWorkerHeartbeat.v1";
const WATCHED_KINDS = [
  "BOT_SCHEDULER",
  "COMMUNITY_POLL",
  "MINIGAMES",
  "AUTO_BACKUP",
  "VOTE_QUEUE",
  "PARTNERSHIP_MIGRATION",
  "MARKOV",
] as const;

function envFlagOn(name?) {
  return String(process.env[name] || "").trim() === "1";
}

/**
 * @param {"BOT_SCHEDULER"|"COMMUNITY_POLL"|"AUTO_BACKUP"|"VOTE_QUEUE"|"PARTNERSHIP_MIGRATION"|"MARKOV"|"MINIGAMES"} kind
 */
function shouldStartExternalWorkerLoop(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key) return true;
  const dedicated = envFlagOn(`${key}_WORKER`);
  const external = envFlagOn(`${key}_EXTERNAL`);
  if (external && !dedicated) return false;
  return true;
}

const skipWarned = new Set();

/** Una volta per processo: avvisa se EXTERNAL senza WORKER locale (i loop qui non partono). */
function warnIfExternalWorkerSkipped(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key || skipWarned.has(key)) return;
  if (!(envFlagOn(`${key}_EXTERNAL`) && !envFlagOn(`${key}_WORKER`))) return;
  skipWarned.add(key);
  /* Atteso con EXTERNAL=1 sul gateway: niente warn arancione, solo se BOOT_VERBOSE */
  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    global.logger?.info?.(
      `[RUNTIME] ${key}_EXTERNAL=1: loop su worker (${key}_WORKER), non su questo processo`,
    );
  }
}

async function touchExternalWorkerHeartbeat(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key || !envFlagOn(`${key}_WORKER`)) return;
  try {
    const { getBotState, setBotState } = require("../botState/botStateStore") as typeof import("../botState/botStateStore");
    const raw: any = (await getBotState(HEARTBEAT_KEY, {})) || {};
    raw[key] = { at: Date.now(), pid: process.pid, name: process.env.name || process.env.PM2_NAME || "" };
    await setBotState(HEARTBEAT_KEY, raw);
  } catch (_) {}
}

/** Sul processo WORKER: heartbeat ogni 30s così la dashboard Salute vede se il worker è vivo. */
function startExternalWorkerHeartbeat(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key || !envFlagOn(`${key}_WORKER`)) return null;
  void touchExternalWorkerHeartbeat(key);
  const t = setInterval(() => void touchExternalWorkerHeartbeat(key), 30_000);
  t.unref?.();
  return t;
}

/**
 * Per la Salute dashboard: tipi con EXTERNAL=1 il cui worker non ha battuto da > maxAgeMs.
 * @returns {Promise<Array<{ kind: string, ageMs: number | null }>>}
 */
async function listStaleExternalWorkers(maxAgeMs = 120_000) {
  const stale: Array<{ kind: string; ageMs: number | null }> = [];
  let raw: any = {};
  try {
    const { getBotState } = require("../botState/botStateStore") as typeof import("../botState/botStateStore");
    raw = (await getBotState(HEARTBEAT_KEY, {})) || {};
  } catch (_) {
    raw = {};
  }
  for (const kind of WATCHED_KINDS) {
    if (!envFlagOn(`${kind}_EXTERNAL`)) continue;
    /* su un processo WORKER non segnalare se stesso come stale */
    if (envFlagOn(`${kind}_WORKER`)) continue;
    const at = Number(raw?.[kind]?.at || 0);
    const ageMs = at > 0 ? Date.now() - at : null;
    if (ageMs == null || ageMs > maxAgeMs) stale.push({ kind, ageMs });
  }
  return stale;
}

export = {
  envFlagOn,
  shouldStartExternalWorkerLoop,
  warnIfExternalWorkerSkipped,
  startExternalWorkerHeartbeat,
  touchExternalWorkerHeartbeat,
  listStaleExternalWorkers,
  WATCHED_KINDS,
};
