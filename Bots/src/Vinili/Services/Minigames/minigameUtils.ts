/** Minigiochi: ora di Roma, canali in cache e piccole utilità. */
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { randomBetween } = require("./minigameSources") as typeof import("./minigameSources");

const MINIGAME_FIXED_TIMEZONE = "Europe/Rome";

function getMinigameRomeTime(date?, client?) {
  const tz = client ? (client?.config?.minigames?.timeZone || MINIGAME_FIXED_TIMEZONE) : MINIGAME_FIXED_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getChannelSafe(client?, channelId?) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || null;
}

async function getChannelCached(client?, channelId?) {
  return getChannelSafe(client, channelId) ||
    (await getClientChannelCached(client, channelId, { ttlMs: 30_000 }));
}

function pickRandomItem(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[randomBetween(0, list.length - 1)] || null;
}

function isWithinAllowedWindow(now?, start?, end?) {
  const startMinutes = (start?.hour ?? 9) * 60 + (start?.minute ?? 0);
  const endMinutes = (end?.hour ?? 23) * 60 + (end?.minute ?? 45);
  const parts = getRomeParts(now);
  const current = parts.hour * 60 + parts.minute;
  return current >= startMinutes && current <= endMinutes;
}

function getRomeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function getRomeDateKey(date?) {
  const parts = getRomeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function sleepMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export = { getMinigameRomeTime, getChannelSafe, getChannelCached, pickRandomItem, isWithinAllowedWindow, getRomeDateKey, sleepMs };
