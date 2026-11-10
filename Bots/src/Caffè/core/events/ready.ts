const { logBotReady } = require("../../../shared/discord/readyLog") as typeof import("../../../shared/discord/readyLog");
const { restoreTtsConnections } = require("../../../shared/tts/services/ttsService") as typeof import("../../../shared/tts/services/ttsService");
const { printRecoveryHealthOnce } = require("../../../shared/recovery/recoveryHealth") as typeof import("../../../shared/recovery/recoveryHealth");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
async function restoreTtsState(client?) {
  await restoreTtsConnections(client);
}

export = {
  name: "clientReady",
  once: true,
  async execute(_readyClient?, client?) {
    const activeClient = client || _readyClient;
    logBotReady(activeClient);
    try {
      const { startCoffeeHealthHttpServer } = require("../../site/http/coffeeHealthHttp") as typeof import("../../site/http/coffeeHealthHttp");
      startCoffeeHealthHttpServer(activeClient);
    } catch (err) {
      global.logger?.warn?.("[HEALTH] Coffee init:", err?.message || err);
    }

    if (!isMongoReady()) {
      global.logger?.error?.("[DATABASE] Startup aborted: MongoDB not connected.");
      return;
    }
    await restoreTtsState(activeClient);
    const { applyBotPresence, schedulePresenceStabilization, installBotPresenceKeeper } = require("../../../shared/discord/botPresenceActivity") as typeof import("../../../shared/discord/botPresenceActivity");
    await applyBotPresence(activeClient);
    installBotPresenceKeeper(activeClient);
    schedulePresenceStabilization(activeClient);
    try {
      const { initLavalinkMusicIfEnabled } = require("../../../shared/music/services/lavalinkMusicService") as typeof import("../../../shared/music/services/lavalinkMusicService");
      initLavalinkMusicIfEnabled(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }
    try {
      const { ensurePrefixQueueLoaded } = require("../../core/prefixDispatcher") as typeof import("../../core/prefixDispatcher");
      ensurePrefixQueueLoaded(activeClient);
    } catch (err) {
      global.logger?.warn?.("[PREFIX] queue restore:", err?.message || err);
    }
    printRecoveryHealthOnce("COFFEE_RECOVERY_HEALTH");
  },
};