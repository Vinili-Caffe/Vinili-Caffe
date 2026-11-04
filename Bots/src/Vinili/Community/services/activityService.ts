
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { isExcludedActivityChannel } = require("./activityChannels") as typeof import("./activityChannels");
const { loadDailyRows, loadHourlyRows } = require("./activityRows") as typeof import("./activityRows");
const { hydrateProfileActivityBucketsFromGuild } = require("./activityBackfill") as typeof import("./activityBackfill");
const { isMongoUnavailableError } = require("./activityBumps") as typeof import("./activityBumps");
const { recordMessageActivity, handleVoiceActivity, startActivityMessageWriteDrainLoop } = require("./activityRecord") as typeof import("./activityRecord");
const { loadLiveVoiceSessions, getLiveVoiceOverlay } = require("./activityAggregate") as typeof import("./activityAggregate");
const { getChannelOverviewStats } = require("./activityStats") as typeof import("./activityStats");
const { getServerOverviewStats, getUserOverviewStats } = require("./activityOverview") as typeof import("./activityOverview");
const { syncLiveVoiceSessionsFromGateway, runLiveVoiceExpTick } = require("./activityLiveVoice") as typeof import("./activityLiveVoice");


const LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS = Number(process.env.LIVE_VOICE_EXP_INTERVAL_MS) || 45_000;
let liveVoiceExpSuspended = false;
const liveVoiceExpClients = new Set();

function startLiveVoiceExpLoop(client?, intervalMs?) {
  /* EXP vocale live sul gateway (bots-vinyls): serve la cache canali.
     Su community-poll (REST) isChannelEligibleForMemberExp non risolva i canali → EXP solo a leave. */
  if (client?._isSiteApiRestClient) return null;
  if (String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1") return null;
  const resolved = Number(intervalMs ?? LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS) || LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS;
  const safeInterval = Math.max(10_000, Math.min(300_000, resolved));
  if (client?._liveVoiceExpInterval) return client._liveVoiceExpInterval;
  if (client) liveVoiceExpClients.add(client);
  const runner = () => {
    if (liveVoiceExpSuspended || !isMongoReady()) return;
    runLiveVoiceExpTick(client).catch((error?) => {
      if (liveVoiceExpSuspended || isMongoUnavailableError(error) || !isMongoReady()) return;
      global.logger?.warn?.("[LIVE VOICE EXP] Tick failed:", error?.message || error);
    });
  };
  runner();
  client._liveVoiceExpInterval = setInterval(runner, safeInterval);
  client._liveVoiceExpInterval.unref?.();
  return client._liveVoiceExpInterval;
}

function stopLiveVoiceExpLoop(client?) {
  const timer = client?._liveVoiceExpInterval;
  if (!timer) return false;
  clearInterval(timer);
  client._liveVoiceExpInterval = null;
  return true;
}

function suspendAllLiveVoiceExp() {
  liveVoiceExpSuspended = true;
  for (const client of liveVoiceExpClients) {
    try {
      stopLiveVoiceExpLoop(client);
    } catch {
    }
  }
}

export = {
  recordMessageActivity,
  handleVoiceActivity,
  startActivityMessageWriteDrainLoop,
  getServerOverviewStats,
  getUserOverviewStats,
  getChannelOverviewStats,
  getLiveVoiceOverlay,
  loadLiveVoiceSessions,
  loadDailyRows,
  loadHourlyRows,
  hydrateProfileActivityBucketsFromGuild,
  syncLiveVoiceSessionsFromGateway,
  startLiveVoiceExpLoop,
  suspendAllLiveVoiceExp,
  isExcludedActivityChannel,
};