async function resolveVoiceExpMultiplier(_channelLike?, _guild?, _client = null) {
  return 1;
}

function computeVoiceExpFromSeconds(seconds?, multiplier = 1, expPerMinute = 5) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const mult = Math.max(0, Number(multiplier) || 0);
  const rate = Math.max(0, Number(expPerMinute) || 0);
  return Math.floor((sec * rate * mult) / 60);
}

export = {
  resolveVoiceExpMultiplier,
  computeVoiceExpFromSeconds,
};