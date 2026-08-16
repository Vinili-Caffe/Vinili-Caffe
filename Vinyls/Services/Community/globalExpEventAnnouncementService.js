const cron = require("node-cron");
const botConfig = require("../../config.json");
const IDs = require("../../Utils/Config/ids");
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
const { parseScheduleMs } = require("../../Utils/Web/hogwartsEventSchedule");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");

const TIME_ZONE = "Europe/Rome";
/** Cron alle 12:00 Rome (allineato a parseExpEventStartMs default). */
const START_ANNOUNCE_CRON = "0 12 * * *";
/** Finestra di recovery se il bot era offline alle 12. */
const ANNOUNCE_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;

let announceCronTask = null;
let announceSweepTimer = null;
let tickRunning = false;

function parseExpEventStartMs(value) {
  return parseScheduleMs(value, "12:00:00");
}

function listAnnounceableExpEvents(nowMs = Date.now()) {
  const events = Array.isArray(botConfig?.globalExpEvents) ? botConfig.globalExpEvents : [];
  const out = [];
  for (const event of events) {
    if (!event || event.enabled === false) continue;
    const announce = event.announce && typeof event.announce === "object" ? event.announce : null;
    if (!announce || announce.enabled === false) continue;
    const key = String(event.key || "").trim();
    const content = String(announce.content || "").trim();
    if (!key || !content) continue;
    const startMs = parseExpEventStartMs(event.startDate);
    if (!Number.isFinite(startMs)) continue;
    if (nowMs < startMs) continue;
    if (nowMs > startMs + ANNOUNCE_GRACE_MS) continue;
    const channelId =
      String(announce.channelId || "").trim() ||
      String(IDs.channels?.eventAnnouncements || "").trim();
    if (!/^\d{5,30}$/.test(channelId)) continue;
    const roleIds = [...String(content).matchAll(/<@&(\d{5,30})>/g)].map((m) => m[1]);
    out.push({ key, content, channelId, roleIds, startMs });
  }
  return out;
}

function extractAllowedMentions(content, roleIds) {
  const mentionsEveryone = /@everyone\b/.test(content) || /@here\b/.test(content);
  return {
    parse: mentionsEveryone ? ["everyone"] : [],
    roles: [...new Set(roleIds.filter((id) => /^\d{5,30}$/.test(id)))],
    users: [],
  };
}

async function claimAnnouncementSlot(guildId, eventKey) {
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  const key = String(eventKey || "").trim();
  if (!gid || !key) return false;

  // Assicura il doc senza reclamare lo slot.
  await GlobalSettings.findOneAndUpdate(
    { guildId: gid },
    { $setOnInsert: { guildId: gid, expEventStartAnnouncementsSent: [] } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const doc = await GlobalSettings.findOneAndUpdate(
    { guildId: gid, expEventStartAnnouncementsSent: { $nin: [key] } },
    { $addToSet: { expEventStartAnnouncementsSent: key } },
    { new: true },
  ).catch(() => null);
  return Boolean(doc);
}

async function releaseAnnouncementSlot(guildId, eventKey) {
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  const key = String(eventKey || "").trim();
  if (!gid || !key) return;
  await GlobalSettings.updateOne(
    { guildId: gid },
    { $pull: { expEventStartAnnouncementsSent: key } },
  ).catch(() => null);
}

async function sendOneExpEventStartAnnouncement(client, event) {
  const channel = await getClientChannelCached(client, event.channelId).catch(() => null);
  if (!channel?.send) {
    global.logger?.warn?.(
      `[EXP EVENT ANNOUNCE] Canale ${event.channelId} non disponibile per ${event.key}`,
    );
    return false;
  }
  await channel.send({
    content: event.content,
    allowedMentions: extractAllowedMentions(event.content, event.roleIds),
  });
  return true;
}

async function runGlobalExpEventStartAnnouncementCheck(client, nowMs = Date.now()) {
  if (!client || tickRunning) return { skipped: true };
  tickRunning = true;
  try {
    const due = listAnnounceableExpEvents(nowMs);
    const results = [];
    for (const event of due) {
      const claimed = await claimAnnouncementSlot(IDs.guilds?.main, event.key);
      if (!claimed) {
        results.push({ key: event.key, status: "already_sent" });
        continue;
      }
      try {
        const ok = await sendOneExpEventStartAnnouncement(client, event);
        if (!ok) {
          await releaseAnnouncementSlot(IDs.guilds?.main, event.key);
          results.push({ key: event.key, status: "channel_missing" });
          continue;
        }
        global.logger?.info?.(`[EXP EVENT ANNOUNCE] Inviato start per ${event.key}`);
        results.push({ key: event.key, status: "sent" });
      } catch (err) {
        await releaseAnnouncementSlot(IDs.guilds?.main, event.key);
        global.logger?.warn?.(
          `[EXP EVENT ANNOUNCE] Fail ${event.key}:`,
          err?.message || err,
        );
        results.push({ key: event.key, status: "error", error: err?.message || String(err) });
      }
    }
    return { results };
  } finally {
    tickRunning = false;
  }
}

function startGlobalExpEventAnnouncementLoop(client) {
  if (!client) return null;
  if (announceCronTask) return announceCronTask;

  const tick = () =>
    runGlobalExpEventStartAnnouncementCheck(client).catch((err) => {
      global.logger?.warn?.("[EXP EVENT ANNOUNCE] tick:", err?.message || err);
    });

  // Recovery immediato (restart dopo le 12).
  tick();

  announceCronTask = cron.schedule(
    START_ANNOUNCE_CRON,
    runCronDetached("[EXP EVENT ANNOUNCE]", () => runGlobalExpEventStartAnnouncementCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );

  announceSweepTimer = setInterval(tick, SWEEP_MS);
  if (typeof announceSweepTimer.unref === "function") announceSweepTimer.unref();

  return announceCronTask;
}

module.exports = {
  startGlobalExpEventAnnouncementLoop,
  runGlobalExpEventStartAnnouncementCheck,
  listAnnounceableExpEvents,
};
