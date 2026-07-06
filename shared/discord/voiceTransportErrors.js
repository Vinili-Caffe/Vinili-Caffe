function voiceTransportErrorMessage(err) {
  return String(err?.message || err || "");
}

function isVoiceTransportError(err) {
  const msg = voiceTransportErrorMessage(err).toLowerCase();
  return (
    msg.includes("ip discovery") ||
    msg.includes("socket closed") ||
    msg.includes("signalling") ||
    msg.includes("signaling") ||
    msg.includes("aborted") ||
    (msg.includes("destroyed") && msg.includes("connection"))
  );
}

module.exports = { isVoiceTransportError, voiceTransportErrorMessage };