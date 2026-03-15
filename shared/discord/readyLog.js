function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60000) % 60;
  const parts = [];
  if (min > 0) parts.push(`${min}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function logBotReady(client, startedAt) {
  const name = client?.user?.username || "Bot";
  if (startedAt != null && Number.isFinite(startedAt)) {
    const duration = formatDurationMs(Date.now() - startedAt);
    global.logger?.info?.(`[BOT] ${name} has been launched! Ready in ${duration}.`);
  } else {
    global.logger?.info?.(`[BOT] ${name} has been launched!`);
  }
}

module.exports = { logBotReady, formatDurationMs };