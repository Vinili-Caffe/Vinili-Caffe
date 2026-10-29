const cron = require("node-cron") as typeof import("node-cron");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  findDailyStats,
  getOrCreateDailyStats,
  incrementDailyStatsValue,
} = require("./dailyStatsStore") as typeof import("./dailyStatsStore");
const TIME_ZONE = "Europe/Rome";
const DEFAULT_DAILY_CHANNEL_MESSAGE_REPORT_CHANNEL_ID = "1502241464724361256";

const TRACKED_CHANNELS = {
  counting: String(IDs.channels?.counting || "1442569179743125554"),
  poketwo: String(IDs.channels?.poketwo || "1442569184281362552"),
  ship: String(IDs.channels?.ship || "1469685688814407726"),
};

let dailyChannelMessageCron = null;
let reportRunning = false;

function readDailyChannelMessageStatsCfg(client?) {
  const raw = client?.config?.dailyChannelMessageStats;
  return raw && typeof raw === "object" ? raw : {};
}

function resolveDailyChannelMessageReportChannelId(client?) {
  const fromCfg = String(readDailyChannelMessageStatsCfg(client).reportChannelId || "").trim();
  return fromCfg || DEFAULT_DAILY_CHANNEL_MESSAGE_REPORT_CHANNEL_ID;
}

function isFalsyEnvFlag(value?) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

function resolveDisabledScheduleGuildIds(client?) {
  const cfg = readDailyChannelMessageStatsCfg(client);
  const ids = new Set(
    (Array.isArray(cfg.disabledScheduleGuildIds) ? cfg.disabledScheduleGuildIds : [])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const reportGuildId = String(cfg.reportGuildId || IDs.guilds?.test || "").trim();
  if (reportGuildId) ids.add(reportGuildId);
  return ids;
}

function isDailyChannelMessageStatsScheduleEnabled(client?, reportGuildId = "") {
  const cfg = readDailyChannelMessageStatsCfg(client);
  if (cfg.enabled === false || cfg.scheduleEnabled === false) return false;
  if (isFalsyEnvFlag(process.env.DAILY_CHANNEL_MESSAGE_STATS_SCHEDULE_ENABLED)) return false;
  const gid = String(reportGuildId || cfg.reportGuildId || "").trim();
  if (gid && resolveDisabledScheduleGuildIds(client).has(gid)) return false;
  return true;
}

function getMainGuildId() {
  return String(process.env.DAILY_CHANNEL_MESSAGE_STATS_GUILD_ID || IDs.guilds?.main || "").trim();
}

function getRomeDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const out: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function formatDateKey(parts?) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getRomeDateKey(date = new Date()) {
  return formatDateKey(getRomeDateParts(date));
}

function addDaysToRomeKey(dateKey?, deltaDays?) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return getRomeDateKey();
  const noonUtc = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  return getRomeDateKey(noonUtc);
}

function resolveMetricForChannel(channelId?) {
  const id = String(channelId || "");
  if (id === TRACKED_CHANNELS.counting) return "countingMessages";
  if (id === TRACKED_CHANNELS.poketwo) return "poketwoMessages";
  if (id === TRACKED_CHANNELS.ship) return "shipMessages";
  return null;
}

async function trackChannelMessage(message?) {
  if (!message?.guild || !message?.author || message.author.bot) return;
  if (message.system || message.webhookId || message.applicationId) return;

  const guildId = getMainGuildId();
  if (!guildId || String(message.guild.id) !== guildId) return;

  const metric = resolveMetricForChannel(message.channelId || message.channel?.id);
  if (!metric) return;
  const dateKey = getRomeDateKey(new Date());

  await incrementDailyStatsValue("channelMessagesDaily", guildId, dateKey, { [metric]: 1 }, {
    countingMessages: 0,
    poketwoMessages: 0,
    shipMessages: 0,
  });
}

function buildReportContent(stats?) {
  return [
    `\u{1F522}**Messaggi in Counting**: ${Math.max(0, Number(stats?.countingMessages || 0))}`,
    `\u26E9\uFE0F**Messaggi in Pok\u00e9Two**: ${Math.max(0, Number(stats?.poketwoMessages || 0))}`,
    `\u{1F49E}**Messaggi in Ship**: ${Math.max(0, Number(stats?.shipMessages || 0))}`,
  ].join("\n");
}

async function resolveReportChannel(client?) {
  if (!client) return null;
  const channelId = resolveDailyChannelMessageReportChannelId(client);
  return (
    client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, channelId)) ||
    (await client.channels.fetch(channelId).catch(() => null))
  );
}

async function sendDailyChannelMessageReport(client?, dateKey?, opts: Record<string, any> = {}) {
  const guildId = getMainGuildId();
  if (!client || !guildId || !dateKey || reportRunning) return null;
  const reportChannel = await resolveReportChannel(client);
  const reportGuildId = String(reportChannel?.guildId || reportChannel?.guild?.id || "").trim();
  if (!isDailyChannelMessageStatsScheduleEnabled(client, reportGuildId)) return null;
  const createIfMissing = opts.createIfMissing !== false;

  reportRunning = true;
  try {
    const doc = createIfMissing
      ? await getOrCreateDailyStats("channelMessagesDaily", guildId, dateKey, {
          countingMessages: 0,
          poketwoMessages: 0,
          shipMessages: 0,
        })
      : await findDailyStats("channelMessagesDaily", guildId, dateKey);
    if (!doc) return null;
    const stats = doc.value || {};
    if (stats.reportedAt || stats.reportMessageId) return doc;

    if (!reportChannel?.isTextBased?.()) {
      global.logger?.warn?.(
        "[DAILY CHANNEL MESSAGE STATS] report channel not found:",
        resolveDailyChannelMessageReportChannelId(client),
      );
      return stats;
    }

    const sent = await reportChannel.send({ content: buildReportContent(stats) }).catch((err?) => {
      global.logger?.error?.("[DAILY CHANNEL MESSAGE STATS] report send failed:", err?.message || err);
      return null;
    });
    if (!sent) return doc;

    doc.value = { ...(doc.value || {}), reportMessageId: sent.id, reportedAt: new Date() };
    doc.markModified("value");
    await doc.save().catch((err?) => {
      global.logger?.warn?.("[DAILY CHANNEL MESSAGE STATS] report mark failed:", err?.message || err);
    });
    return doc;
  } finally {
    reportRunning = false;
  }
}

function startDailyChannelMessageStatsLoop(client?) {
  if (!client || dailyChannelMessageCron) return dailyChannelMessageCron;
  const cfg = readDailyChannelMessageStatsCfg(client);
  const reportGuildId = String(cfg.reportGuildId || IDs.guilds?.test || "").trim();
  if (!isDailyChannelMessageStatsScheduleEnabled(client, reportGuildId)) {
    return null;
  }

  dailyChannelMessageCron = cron.schedule(
    "0 0 * * *",
    () => {
      const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
      void sendDailyChannelMessageReport(client, yesterdayKey).catch((err?) => {
        global.logger?.error?.("[DAILY CHANNEL MESSAGE STATS] scheduled report failed:", err);
      });
    },
    { timezone: TIME_ZONE },
  );

  setImmediate(() => {
    const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
    sendDailyChannelMessageReport(client, yesterdayKey, { createIfMissing: false }).catch((err?) => {
      global.logger?.warn?.("[DAILY CHANNEL MESSAGE STATS] startup recovery failed:", err?.message || err);
    });
  });

  return dailyChannelMessageCron;
}

export = {
  DAILY_CHANNEL_MESSAGE_REPORT_CHANNEL_ID: DEFAULT_DAILY_CHANNEL_MESSAGE_REPORT_CHANNEL_ID,
  TRACKED_CHANNELS,
  startDailyChannelMessageStatsLoop,
  sendDailyChannelMessageReport,
  trackChannelMessage,
};