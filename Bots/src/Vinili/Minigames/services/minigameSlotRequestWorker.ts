/**
 * Worker-only slot timer: scrive richieste su BotState senza caricare minigameService/canvas.
 * Il gateway consuma le richieste e avvia i round in-process.
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { envFlagOn, shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { getMinigameRomeTime } = require("./minigameUtils") as typeof import("./minigameUtils");

const MINIGAME_SPAWN_REQUEST_KEY = "minigameSpawnRequest";
const MINIGAME_FIRST_HOUR = 8;
const MINIGAME_LAST_HOUR = 23;
const MINIGAME_LAST_MINUTE = 45;
const MINIGAME_SLOT_MINUTES = [0, 15, 30, 45];

let lastMinigameSlotKey = null;
let loopStarted = false;
let loopTimer = null;

function isMinigameFixedSlot(rome?) {
  const { hour, minute } = rome || {};
  if (!MINIGAME_SLOT_MINUTES.includes(minute)) return false;
  if (hour < MINIGAME_FIRST_HOUR || hour > MINIGAME_LAST_HOUR) return false;
  if (hour === MINIGAME_LAST_HOUR && minute > MINIGAME_LAST_MINUTE) return false;
  return true;
}

function minigameSlotKeyFromRome(rome?) {
  return `${rome.year}-${String(rome.month).padStart(2, "0")}-${String(rome.day).padStart(2, "0")}_${rome.hour}_${rome.minute}`;
}

function computeMsUntilNextRomeSlotStart(client?) {
  const now = Date.now();
  const maxAhead = 4 * 60 * 60 * 1000;
  for (let ms = 0; ms <= maxAhead; ms += 1000) {
    const t = new Date(now + ms);
    const rome = getMinigameRomeTime(t, client);
    if (rome.second !== 0) continue;
    if (!MINIGAME_SLOT_MINUTES.includes(rome.minute)) continue;
    if (!isMinigameFixedSlot(rome)) continue;
    const slotKey = minigameSlotKeyFromRome(rome);
    if (slotKey === lastMinigameSlotKey) continue;
    return ms;
  }
  return 60_000;
}

function getWorkerMinigameCfg(client?) {
  const cfg = client?.config?.minigames || null;
  if (!cfg) return null;
  return {
    enabled: cfg.enabled !== false,
    channelId: String(IDs.channels?.chat || cfg.channelId || "").trim() || null,
  };
}

async function requestMinigameSlotSpawn(slotKey?, channelId?) {
  const key = String(slotKey || "").trim();
  if (!key) return false;
  await setBotState(MINIGAME_SPAWN_REQUEST_KEY, {
    slotKey: key,
    channelId: String(channelId || "").trim() || null,
    requestedAt: Date.now(),
  });
  return true;
}

function startMinigameSlotRequestLoop(client?) {
  if (!shouldStartExternalWorkerLoop("MINIGAMES")) return;
  if (envFlagOn("MINIGAMES_EXTERNAL") && !envFlagOn("MINIGAMES_WORKER")) return;
  if (loopStarted) return;
  loopStarted = true;

  const cfg = getWorkerMinigameCfg(client);
  console.log(
    `[BOT-SCHEDULER] minigame slot-request loop started channel=${cfg?.channelId || "n/a"} enabled=${Boolean(cfg?.enabled)}`,
  );

  const schedule = () => {
    const ms = computeMsUntilNextRomeSlotStart(client);
    loopTimer = setTimeout(async () => {
      try {
        const cfgTick = getWorkerMinigameCfg(client);
        if (!cfgTick?.enabled) return;
        const rome = getMinigameRomeTime(new Date(), client);
        if (!isMinigameFixedSlot(rome)) return;
        const slotKey = minigameSlotKeyFromRome(rome);
        if (slotKey === lastMinigameSlotKey) return;
        await requestMinigameSlotSpawn(slotKey, cfgTick.channelId);
        lastMinigameSlotKey = slotKey;
      } catch (err) {
        console.error("[MINIGAMES] slot request tick", err?.message || err);
      }
      schedule();
    }, ms);
    loopTimer.unref?.();
  };
  schedule();
}

export = {
  startMinigameSlotRequestLoop,
  requestMinigameSlotSpawn,
  MINIGAME_SPAWN_REQUEST_KEY,
};
