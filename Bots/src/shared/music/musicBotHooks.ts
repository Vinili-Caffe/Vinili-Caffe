"use strict";

/**
 * Hook TTS / voice-capture per lavalinkMusicService unico (Vinyls + Coffee + Groove).
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

/** Coffee twin style (Caffè / Groove): no always-on, twin copy, own Data folder. */
function isCoffeeStyleProfile(profile = hooks.profile) {
  const p = String(profile || "").trim().toLowerCase();
  return p === "coffee" || p === "groove";
}

/** Solo Vinili onora la radio 24/7 del config guild (condiviso con Caffè/Groove). */
function botHonorsMusicAlwaysOn(profile = hooks.profile) {
  return !isCoffeeStyleProfile(profile);
}

function resolveMusicBotFolder(profile = hooks.profile) {
  const p = String(profile || "").trim().toLowerCase();
  if (p === "groove") return "Groove";
  if (p === "coffee") return "Caffè";
  return "Vinili";
}

function resolveMusicSnapshotKey(profile = hooks.profile) {
  const p = String(profile || "").trim().toLowerCase();
  if (p === "groove") return "groove_voice_sessions";
  if (p === "coffee") return "coffee_voice_sessions";
  return "vinyls_voice_sessions";
}

function resolveMusicBotLabel(profile = hooks.profile) {
  const p = String(profile || "").trim().toLowerCase();
  if (p === "groove") return "Groove";
  if (p === "coffee") return "Caffè";
  return "Vinili";
}

export = {
  setMusicBotHooks,
  getMusicBotHooks,
  isCoffeeStyleProfile,
  botHonorsMusicAlwaysOn,
  resolveMusicBotFolder,
  resolveMusicSnapshotKey,
  resolveMusicBotLabel,
};
