function voiceTransportErrorMessage(err?) {
  return String(err?.message || err || "");
}

function isVoiceTransportError(err?) {
  const msg = voiceTransportErrorMessage(err).toLowerCase();
  if (
    msg.includes("ip discovery") ||
    msg.includes("socket closed") ||
    msg.includes("signalling") ||
    msg.includes("signaling") ||
    (msg.includes("destroyed") && msg.includes("connection"))
  ) {
    return true;
  }
  // entersState / Networking AbortError on cold join — retryable
  if (err?.name === "AbortError" || msg.includes("aborted")) return true;
  if (msg.includes("timed out") || msg.includes("timeout")) return true;
  return false;
}

/** Shoukaku/Lavalink: voice update dopo restart/sessione scaduta (sendServerUpdate). */
function isLavalinkSessionError(err?) {
  const msg = voiceTransportErrorMessage(err).toLowerCase();
  const name = String(err?.name || "");
  if (name === "RestError" && msg.includes("session not found")) return true;
  if (msg.includes("session not found")) return true;
  if (msg.includes("session is not found")) return true;
  return false;
}

function isRecoverableVoiceOrMusicError(err?) {
  return isVoiceTransportError(err) || isLavalinkSessionError(err);
}

export = {
  isVoiceTransportError,
  isLavalinkSessionError,
  isRecoverableVoiceOrMusicError,
  voiceTransportErrorMessage,
};