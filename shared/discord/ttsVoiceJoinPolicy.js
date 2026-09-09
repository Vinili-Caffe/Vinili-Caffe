"use strict";

/**
 * Shared TTS voice join timing for cold boot / IP discovery races.
 */
function envInt(name, fallback, min = null) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return min;
  return Math.floor(n);
}

function getTtsVoiceJoinPolicy() {
  return {
    maxAttempts: envInt("TTS_VOICE_JOIN_MAX_ATTEMPTS", 4, 1),
    readyTimeoutMs: envInt("TTS_VOICE_JOIN_READY_TIMEOUT_MS", 15_000, 5_000),
    restoreBootDelayMs: envInt("TTS_RESTORE_BOOT_DELAY_MS", 4_500, 0),
    restoreConcurrency: envInt("TTS_RESTORE_CONCURRENCY", 1, 1),
    restoreGapMs: envInt("TTS_RESTORE_GAP_MS", 800, 0),
    destroySettleMs: envInt("TTS_VOICE_DESTROY_SETTLE_MS", 1_200, 0),
    emptyDestroySettleMs: envInt("TTS_VOICE_EMPTY_DESTROY_SETTLE_MS", 0, 0),
  };
}

function voiceJoinRetryWaitMs(attempt) {
  const n = Math.max(1, Number(attempt) || 1);
  return Math.min(2_500 * n, 10_000);
}

module.exports = {
  getTtsVoiceJoinPolicy,
  voiceJoinRetryWaitMs,
};
