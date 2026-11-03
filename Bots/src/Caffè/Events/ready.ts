const { logBotReady } = require("../../shared/discord/readyLog") as typeof import("../../shared/discord/readyLog");
const { restoreTtsConnections } = require("../../shared/tts/services/ttsService") as typeof import("../../shared/tts/services/ttsService");
const { startHourlyReminderLoop } = require("../Community/services/chatReminderService") as typeof import("../Community/services/chatReminderService");
const { restoreStanzaRoomsFromSnapshot } = require("../Voice/services/stanzaVoiceRoomsService") as typeof import("../Voice/services/stanzaVoiceRoomsService");
const { restorePendingVoiceTranscriptions } = require("../Voice/services/voiceTranscriptionService") as typeof import("../Voice/services/voiceTranscriptionService");
const { printRecoveryHealthOnce } = require("../../shared/recovery/recoveryHealth") as typeof import("../../shared/recovery/recoveryHealth");
const { isMongoReady } = require("../../shared/db/mongoConnect") as typeof import("../../shared/db/mongoConnect");

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
      const { startCoffeeHealthHttpServer } = require("../site/http/coffeeHealthHttp") as typeof import("../site/http/coffeeHealthHttp");
      startCoffeeHealthHttpServer(activeClient);
    } catch (err) {
      global.logger?.warn?.("[HEALTH] Coffee init:", err?.message || err);
    }

    if (!isMongoReady()) {
      global.logger?.error?.("[DATABASE] Startup aborted: MongoDB not connected.");
      return;
    }
    await restoreTtsState(activeClient);
    void restorePendingVoiceTranscriptions(activeClient).catch((err?) => {
      global.logger?.warn?.("[VOICE TRANSCRIBE] restore failed:", err?.message || err);
    });
    const { applyBotPresence, schedulePresenceStabilization, installBotPresenceKeeper } = require("../../shared/discord/botPresenceActivity") as typeof import("../../shared/discord/botPresenceActivity");
    await applyBotPresence(activeClient);
    installBotPresenceKeeper(activeClient);
    schedulePresenceStabilization(activeClient);
    void restoreStanzaRoomsFromSnapshot(activeClient).catch((err?) => {
      global.logger?.warn?.("[stanza] snapshot restore failed:", err?.message || err);
    });
    try {
      startHourlyReminderLoop(activeClient);
    } catch (err) {
      global.logger?.error?.("[CHAT REMINDER] Failed to start hourly loop:", err?.message || err);
    }
    try {
      const { initLavalinkMusicIfEnabled } = require("../../shared/music/services/lavalinkMusicService") as typeof import("../../shared/music/services/lavalinkMusicService");
      initLavalinkMusicIfEnabled(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }
    try {
      const { startMarkovKeeperHttpServer } = require("../Community/services/markovKeeperHttpService") as typeof import("../Community/services/markovKeeperHttpService");
      const { startMarkovBackfill } = require("../Community/services/markovMessageCollectorService") as typeof import("../Community/services/markovMessageCollectorService");
      startMarkovKeeperHttpServer(activeClient);
      startMarkovBackfill(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MARKOV] init:", err?.message || err);
    }
    try {
      const { ensurePrefixQueueLoaded } = require("../core/officialPrefixDispatcher") as typeof import("../core/officialPrefixDispatcher");
      ensurePrefixQueueLoaded(activeClient);
    } catch (err) {
      global.logger?.warn?.("[PREFIX] queue restore:", err?.message || err);
    }
    printRecoveryHealthOnce("COFFEE_RECOVERY_HEALTH");
  },
};