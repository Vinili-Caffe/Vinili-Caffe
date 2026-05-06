const mongoose = require("mongoose");
const { logBotReady } = require("../../shared/discord/readyLog");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { startHourlyReminderLoop } = require("../Services/Community/chatReminderService");
const { restoreStanzaRoomsFromSnapshot } = require("../Services/Voice/stanzaVoiceRoomsService");
const { printRecoveryHealthOnce } = require("../../shared/recovery/recoveryHealth");

const PRESENCE_STATE = "☕📀 discord.gg/viniliecaffe";
const PRESENCE_TYPE_CUSTOM = 4;

async function setPresence(client) {
  try {
    client.user.setPresence({
      status: client.config?.status || "idle",
      activities: [
        {
          type: PRESENCE_TYPE_CUSTOM,
          name: "idle",
          state: PRESENCE_STATE,
        },
      ],
    });
  } catch (err) {
    client.logs.error(
      "[STATUS] Errore impostazione presence:",
      err?.message || err,
    );
  }
}

async function connectMongo(client) {
  const mongodbURL =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    client.config.mongoURL;
  if (!mongodbURL) {
    global.logger.warn(" MONGO_URL o MONGO_URL_LOCAL non impostato.");
    return;
  }

  try {
    await mongoose.connect(mongodbURL, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
  } catch (err) {
    global.logger.error(" MongoDB:", err.message);
  }
}

async function restoreTtsState(client) {
  await restoreTtsConnections(client);
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(_readyClient, client) {
    const activeClient = client || _readyClient;
    logBotReady(activeClient);

    await setPresence(activeClient);
    await connectMongo(activeClient);
    await restoreTtsState(activeClient);
    void restoreStanzaRoomsFromSnapshot(activeClient).catch((err) => {
      global.logger?.warn?.("[stanza] snapshot restore failed:", err?.message || err);
    });
    try {
      startHourlyReminderLoop(activeClient);
    } catch (err) {
      global.logger?.error?.("[CHAT REMINDER] Failed to start hourly loop:", err?.message || err);
    }
    try {
      const { initLavalinkMusicIfEnabled } = require("../Services/Music/lavalinkMusicService");
      initLavalinkMusicIfEnabled(activeClient);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }
    printRecoveryHealthOnce("COFFEE_RECOVERY_HEALTH");
  },
};