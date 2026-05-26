const { ActivityType } = require("discord.js");

function isDiscordStreamingUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "youtu.be") return true;
  if (host === "twitch.tv" || host === "www.twitch.tv") return true;
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") return true;
  if (host.endsWith(".youtube.com")) return true;
  return false;
}

function buildBotPresenceActivities(client) {
  const cfg = client?.config?.presence && typeof client.config.presence === "object" ? client.config.presence : {};
  let name = String(cfg.activityName || "Vinili & Caffè").trim() || "Vinili & Caffè";
  const forbiddenEvent = cfg.forbiddenSectionEvent && typeof cfg.forbiddenSectionEvent === "object" ? cfg.forbiddenSectionEvent : {};
  const { parseScheduleMs, parseScheduleEndMs } = require("../../Vinyls/Utils/Web/hogwartsEventSchedule");
  const forbiddenStartMs = parseScheduleMs(forbiddenEvent.startDate || "2026-06-20T12:00:00", "12:00:00");
  const forbiddenEndRaw = String(forbiddenEvent.endDate || "").trim();
  const forbiddenEndMs = forbiddenEndRaw
    ? (parseScheduleEndMs(forbiddenEndRaw, { endHour: 10 }) ?? parseScheduleMs(forbiddenEndRaw, "10:00:00"))
    : null;
  const now = Date.now();
  if (forbiddenEvent.enabled !== false && Number.isFinite(forbiddenStartMs) && now >= forbiddenStartMs && (!Number.isFinite(forbiddenEndMs) || now <= forbiddenEndMs)) {
    const bookEmoji = String(forbiddenEvent.bookEmoji || "📖").trim() || "📖";
    if (!name.includes(bookEmoji)) name = `${name} ${bookEmoji}`;
  }
  const streamUrl = String(process.env.BOT_PRESENCE_STREAM_URL || cfg.streamUrl || "").trim();
  if (streamUrl && isDiscordStreamingUrl(streamUrl)) {
    return [{ type: ActivityType.Streaming, name, url: streamUrl }];
  }
  return [{ type: ActivityType.Watching, name }];
}

module.exports = { isDiscordStreamingUrl, buildBotPresenceActivities };