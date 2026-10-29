const { logBotReady } = require("../../shared/discord/readyLog") as typeof import("../../shared/discord/readyLog");
const { restoreTtsConnections } = require("../Services/TTS/ttsService") as typeof import("../Services/TTS/ttsService");
const { startHourlyReminderLoop } = require("../Services/Community/chatReminderService") as typeof import("../Services/Community/chatReminderService");
const { restoreStanzaRoomsFromSnapshot } = require("../Services/Voice/stanzaVoiceRoomsService") as typeof import("../Services/Voice/stanzaVoiceRoomsService");
const { restorePendingVoiceTranscriptions } = require("../Services/Voice/voiceTranscriptionService") as typeof import("../Services/Voice/voiceTranscriptionService");
const { printRecoveryHealthOnce } = require("../../shared/recovery/recoveryHealth") as typeof import("../../shared/recovery/recoveryHealth");
const { isMongoReady } = require("../../Vinyls/Utils/Database/mongoConnect") as typeof import("../../Vinyls/Utils/Database/mongoConnect");

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
      const { startCoffeeHealthHttpServer } = require("../Utils/Web/coffeeHealthHttp") as typeof import("../Utils/Web/coffeeHealthHttp");
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
    const { syncForbiddenSectionPresence, startForbiddenSectionPresenceLoop } = require("../../Vinyls/Services/Community/hogwartsForbiddenSectionChannelService") as typeof import("../../Vinyls/Services/Community/hogwartsForbiddenSectionChannelService");
    await syncForbiddenSectionPresence(activeClient).catch((err?) => {
      global.logger?.warn?.("[FORBIDDEN CHANNELS] presence sync failed:", err?.message || err);
    });
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
      startForbiddenSectionPresenceLoop(activeClient);
    } catch (err) {
      global.logger?.error?.("[FORBIDDEN CHANNELS] Failed to start presence loop:", err?.message || err);
    }
    try {
      const { initLavalinkMusicIfEnabled } = require("../Services/Music/lavalinkMusicService") as typeof import("../Services/Music/lavalinkMusicService");
      initLavalinkMusicIfEnabled(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }
    try {
      const { startMarkovKeeperHttpServer } = require("../Services/Community/markovKeeperHttpService") as typeof import("../Services/Community/markovKeeperHttpService");
      const { startMarkovBackfill } = require("../Services/Community/markovMessageCollectorService") as typeof import("../Services/Community/markovMessageCollectorService");
      startMarkovKeeperHttpServer(activeClient);
      startMarkovBackfill(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MARKOV] init:", err?.message || err);
    }
    try {
      const { ensurePrefixQueueLoaded } = require("../Utils/Prefix/officialPrefixDispatcher") as typeof import("../Utils/Prefix/officialPrefixDispatcher");
      ensurePrefixQueueLoaded(activeClient);
    } catch (err) {
      global.logger?.warn?.("[PREFIX] queue restore:", err?.message || err);
    }
    printRecoveryHealthOnce("COFFEE_RECOVERY_HEALTH");
  },
};