const cron = require("node-cron") as typeof import("node-cron");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile, UserLeaveBackup } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const {
  claimDailyStatsReport,
  findDailyStats,
  getOrCreateDailyStats,
  getSeenUser,
  incrementDailyStatsValue,
} = require("./dailyStatsStore") as typeof import("./dailyStatsStore");
const {
  recordEffectiveMemberJoin,
  recordEffectiveMemberLeave,
} = require("./effectiveMemberJoinService") as typeof import("./effectiveMemberJoinService");
const TIME_ZONE = "Europe/Rome";
const DAILY_STATS_CHANNEL_ID = "1502241331295031326";

let dailyMemberStatsCron = null;
let reportRunning = false;

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

function getMainGuildId() {
  return String(process.env.DAILY_MEMBER_STATS_GUILD_ID || IDs.guilds?.main || "").trim();
}

async function incrementDailyStats(guildId?, dateKey?, increment?) {
  await incrementDailyStatsValue("memberDaily", guildId, dateKey, increment, {
    newUsers: 0,
    joinedUsers: 0,
    leftUsers: 0,
  });
}

async function wasKnownBeforeStatsTracker(guildId?, userId?) {
  const [profile, backup] = await Promise.all([
    ActivityUserProfile.exists({ guildId, userId }).catch(() => null),
    UserLeaveBackup.exists({ guildId, userId }).catch(() => null),
  ]);
  return Boolean(profile || backup);
}

async function trackMemberJoin(member?) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) return;
  const guildId = getMainGuildId();
  if (!guildId || String(member.guild.id) !== guildId) return;

  const now = new Date();
  const dateKey = getRomeDateKey(now);
  const userId = String(member.id);
  let isNewUser = false;

  try {
    const existing = await getSeenUser("memberSeen", guildId, userId);
    const knownBefore = await wasKnownBeforeStatsTracker(guildId, userId);
    isNewUser = !existing?.firstJoinedAt && !knownBefore;
    await recordEffectiveMemberJoin(member);
  } catch (err) {
    global.logger?.warn?.("[DAILY MEMBER STATS] seen user upsert failed:", err?.message || err);
  }

  await incrementDailyStats(guildId, dateKey, {
    joinedUsers: 1,
    newUsers: isNewUser ? 1 : 0,
  });
}

async function trackMemberLeave(member?) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) return;
  const guildId = getMainGuildId();
  if (!guildId || String(member.guild.id) !== guildId) return;

  await recordEffectiveMemberLeave(member).catch((err?) => {
    global.logger?.warn?.("[DAILY MEMBER STATS] effective join leave failed:", err?.message || err);
  });
  await incrementDailyStats(guildId, getRomeDateKey(new Date()), { leftUsers: 1 });
}

function buildReportContent(stats?) {
  return [
    `\u{1F195}**Nuovi utenti**: ${Math.max(0, Number(stats?.newUsers || 0))}`,
    `\u27A1\uFE0F**Utenti entrati**: ${Math.max(0, Number(stats?.joinedUsers || 0))}`,
    `\u2B05\uFE0F**Utenti usciti**: ${Math.max(0, Number(stats?.leftUsers || 0))}`,
  ].join("\n");
}

async function resolveReportChannel(client?) {
  if (!client) return null;
  return (
    client.channels.cache.get(DAILY_STATS_CHANNEL_ID) ||
    (await getClientChannelCached(client, DAILY_STATS_CHANNEL_ID)) ||
    (await client.channels.fetch(DAILY_STATS_CHANNEL_ID).catch(() => null))
  );
}

async function sendDailyMemberStatsReport(client?, dateKey?, opts: Record<string, any> = {}) {
  const guildId = getMainGuildId();
  if (!client || !guildId || !dateKey || reportRunning) return null;
  const createIfMissing = opts.createIfMissing !== false;

  reportRunning = true;
  try {
    const doc = createIfMissing
      ? await getOrCreateDailyStats("memberDaily", guildId, dateKey, {
          newUsers: 0,
          joinedUsers: 0,
          leftUsers: 0,
        })
      : await findDailyStats("memberDaily", guildId, dateKey);
    if (!doc) return null;
    const stats = doc.value || {};
    if (stats.reportedAt || stats.reportMessageId || stats.reportClaimAt) return doc;

    const claimed = await claimDailyStatsReport("memberDaily", guildId, dateKey);
    if (!claimed) return doc;
    const claimedStats = claimed.value || stats;

    const channel = await resolveReportChannel(client);
    if (!channel?.isTextBased?.()) {
      global.logger?.warn?.("[DAILY MEMBER STATS] report channel not found:", DAILY_STATS_CHANNEL_ID);
      return claimedStats;
    }

    const sent = await channel.send({ content: buildReportContent(claimedStats) }).catch((err?) => {
      global.logger?.error?.("[DAILY MEMBER STATS] report send failed:", err?.message || err);
      return null;
    });
    if (!sent) return claimed;

    claimed.value = { ...(claimed.value || {}), reportMessageId: sent.id, reportedAt: new Date() };
    claimed.markModified("value");
    await claimed.save().catch((err?) => {
      global.logger?.warn?.("[DAILY MEMBER STATS] report mark failed:", err?.message || err);
    });
    return claimed;
  } finally {
    reportRunning = false;
  }
}

function startDailyMemberStatsLoop(client?) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (!client || dailyMemberStatsCron) return dailyMemberStatsCron;

  dailyMemberStatsCron = cron.schedule(
    "0 0 * * *",
    () => {
      const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
      void sendDailyMemberStatsReport(client, yesterdayKey).catch((err?) => {
        global.logger?.error?.("[DAILY MEMBER STATS] scheduled report failed:", err);
      });
    },
    { timezone: TIME_ZONE, noOverlap: true },
  );

  setImmediate(() => {
    const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
    sendDailyMemberStatsReport(client, yesterdayKey, { createIfMissing: false }).catch((err?) => {
      global.logger?.warn?.("[DAILY MEMBER STATS] startup recovery failed:", err?.message || err);
    });
  });

  return dailyMemberStatsCron;
}

export = {
  startDailyMemberStatsLoop,
  trackMemberJoin,
  trackMemberLeave,
  getRomeDateKey,
};