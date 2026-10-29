"use strict";

/**
 * Coffee music = stesso lavalinkMusicService di Vinyls + hook TTS Coffee (no voice capture).
 * Legacy pieno: lavalinkMusicService.coffeeLegacy.js.bak
 */
const path = require("path") as typeof import("path");
const { setMusicBotHooks } = require("../../../shared/music/musicBotHooks") as typeof import("../../../shared/music/musicBotHooks");

/* snapshot coda nel Data di Coffee, non Vinyls */
process.env.MUSIC_QUEUE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "musicQueueSnapshot.json");

const coffeeTtsPath = path.join(__dirname, "..", "TTS", "ttsService.js");

function loadCoffeeTts() {
  return require(coffeeTtsPath);
}

setMusicBotHooks({
  profile: "coffee",
  nowPlayingTitle: "Now playing",
  nowPlayingVerifiedPrefix: "<a:VC_Verified:1482532479637127188>",
  enableVoiceCapture: false,
  purgeTtsVoicePersistence: async (guildId?, client?) => {
    const tts = loadCoffeeTts();
    if (typeof tts.purgeTtsVoicePersistence === "function") {
      return tts.purgeTtsVoicePersistence(guildId, client);
    }
  },
  leaveTtsGuild: async (guildId?, client?) => {
    const tts = loadCoffeeTts();
    if (typeof tts.leaveTtsGuild === "function") {
      return tts.leaveTtsGuild(guildId, client);
    }
  },
  startVoiceContinuousCapture: async () => {},
  stopVoiceContinuousCapture: async () => {},
  isVoiceCaptureActive: () => false,
});

export = require("../../../Vinyls/Services/Music/lavalinkMusicService");
