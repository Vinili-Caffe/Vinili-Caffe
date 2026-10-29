"use strict";

/**
 * Hook TTS / voice-capture per lavalinkMusicService unico (Vinyls + Coffee).
 * Ogni bot imposta i hook all'avvio prima di initShoukaku.
 */

const noopAsync = async () => {};
const noopFalse = () => false;

let hooks = {
  profile: "vinyls",
  nowPlayingTitle: "In riproduzione",
  nowPlayingVerifiedPrefix: "",
  enableVoiceCapture: true,
  purgeTtsVoicePersistence: noopAsync,
  leaveTtsGuild: noopAsync,
  startVoiceContinuousCapture: noopAsync,
  stopVoiceContinuousCapture: noopAsync,
  isVoiceCaptureActive: noopFalse,
};

function setMusicBotHooks(next: Record<string, any> = {}) {
  hooks = { ...hooks, ...next };
  return hooks;
}

function getMusicBotHooks() {
  return hooks;
}

export = {
  setMusicBotHooks,
  getMusicBotHooks,
};
