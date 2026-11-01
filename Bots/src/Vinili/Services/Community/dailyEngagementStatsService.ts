const cron = require("node-cron") as typeof import("node-cron");
const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  addToSetDailyStatsValue,
  findDailyStats,
  getOrCreateDailyStats,
  getSeenUser,
  setSeenUser,
} = require("./dailyStatsStore") as typeof import("./dailyStatsStore");
const TIME_ZONE = "Europe/Rome";
const DAILY_ENGAGEMENT_CHANNEL_ID = "1502241673512620074";

let dailyEngagementCron = null;
let reportRunning = false;

function getMainGuildId() {
  return String(process.env.DAILY_ENGAGEMENT_GUILD_ID || IDs.guilds?.main || "").trim();
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

function getTrackedTextChannelIds() {
  return new Set(
    [
      IDs.channels?.chat,
      IDs.channels?.media,
      IDs.channels?.commands,
      IDs.channels?.selfieVerificati,
    ]
      .filter(Boolean)
      .map(String),
  );
}

function isTrackedTextMessage(message?) {
  if (!message?.guild || !message?.channel || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;
  const tracked = getTrackedTextChannelIds();
  const channelId = String(message.channelId || message.channel?.id || "");
  return tracked.has(channelId);
}

function hasTrackedTextInMap(guild?, textChannels?, trackedIds?) {
  if (!textChannels || typeof textChannels !== "object") return false;
  for (const [channelId, value] of Object.entries(textChannels)) {
    const cid = String(channelId || "");
    if (Number(value || 0) <= 0) continue;
    if (trackedIds.has(cid)) return true;
  }
  return false;
}

function isPublicVoiceChannel(channel?) {
  if (!channel?.guild) return false;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) return false;
  if (String(channel.parentId || "") === String(IDs.categories?.categoryPrivate || "")) return false;
  if (String(channel.parentId || "") === String(IDs.categories?.categoryPublics || "")) return true;

  const everyone = channel.guild.roles?.everyone;
  const perms = everyone ? channel.permissionsFor(everyone) : null;
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ViewChannel) &&
    perms.has(PermissionsBitField.Flags.Connect) &&
    perms.has(PermissionsBitField.Flags.Speak);
}

function hasTrackedVoiceInMap(guild?, voiceChannels?) {
  if (!voiceChannels || typeof voiceChannels !== "object") return false;
  for (const [channelId, value] of Object.entries(voiceChannels)) {
    if (Number(value || 0) <= 0) continue;
    const channel = guild?.channels?.cache?.get(String(channelId || ""));
    if (isPublicVoiceChannel(channel)) return true;
  }
  return false;
}

async function hasPriorEngagement(guild?, userId?, kind?, beforeDateKey?) {
  const guildId = String(guild?.id || "");
  const uid = String(userId || "");
  if (!guildId || !uid) return false;
  const doc = await ActivityUserProfile.findOne({ guildId, userId: uid })
    .select("profile.totals.daily")
    .lean()
    .catch(() => null);
  if (!doc) return false;

  const daily = doc?.profile?.totals?.daily;
  if (daily && typeof daily === "object") {
    const trackedText = getTrackedTextChannelIds();
    for (const [dateKey, value] of Object.entries(daily)) {
      if (!dateKey || String(dateKey) >= String(beforeDateKey)) continue;
      const row = value && typeof value === "object" ? value : {};
      if (kind === "chat" && hasTrackedTextInMap(guild, row.textChannels || {}, trackedText)) return true;
      if (kind === "voice" && hasTrackedVoiceInMap(guild, row.voiceChannels || {})) return true;
    }
  }

  return false;
}

async function markDailyEngagement({ guild, userId, kind, dateKey = getRomeDateKey() }) {
  const guildId = String(guild?.id || "");
  const uid = String(userId || "");
  if (!guildId || !uid || !["chat", "voice"].includes(kind)) return;
  if (guildId !== getMainGuildId()) return;

  let isNew = false;
  const now = new Date();
  try {
    const bucket = `${kind}Users`;
    const existing = await getSeenUser("engagementSeen", guildId, uid, bucket);
    isNew = !existing;
    await setSeenUser("engagementSeen", guildId, uid, {
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
    }, bucket);
    if (isNew && await hasPriorEngagement(guild, uid, kind, dateKey)) {
      isNew = false;
    }
  } catch (err) {
    global.logger?.warn?.("[DAILY ENGAGEMENT] seen upsert failed:", err?.message || err);
  }

  const addToSet = kind === "chat"
    ? { chatUserIds: uid, ...(isNew ? { newChatUserIds: uid } : {}) }
    : { voiceUserIds: uid, ...(isNew ? { newVoiceUserIds: uid } : {}) };

  await addToSetDailyStatsValue("engagementDaily", guildId, dateKey, addToSet, {
    chatUserIds: [],
    newChatUserIds: [],
    voiceUserIds: [],
    newVoiceUserIds: [],
  });
}

async function trackMessageEngagement(message?) {
  if (!isTrackedTextMessage(message)) return;
  await markDailyEngagement({
    guild: message.guild,
    userId: message.author.id,
    kind: "chat",
  });
}

async function trackVoiceEngagement(oldState?, newState?) {
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState?.channelId || "");
  const newChannel = newState?.channel || newState?.guild?.channels?.cache?.get(newState?.channelId || "");
  const wasPublic = isPublicVoiceChannel(oldChannel);
  const isPublic = isPublicVoiceChannel(newChannel);
  if (!isPublic || (wasPublic && String(oldState?.channelId || "") === String(newState?.channelId || ""))) return;

  await markDailyEngagement({
    guild: newState?.guild || oldState?.guild,
    userId: member.id,
    kind: "voice",
  });
}

async function trackCurrentPublicVoiceMembers(client?) {
  const guildId = getMainGuildId();
  if (!client || !guildId) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  for (const state of guild.voiceStates?.cache?.values?.() || []) {
    const member = state?.member;
    if (!member || member.user?.bot) continue;
    const channel = state.channel || guild.channels.cache.get(String(state.channelId || ""));
    if (!isPublicVoiceChannel(channel)) continue;
    await markDailyEngagement({ guild, userId: member.id, kind: "voice" });
  }
}

function countArray(value?) {
  return Array.isArray(value) ? value.length : 0;
}

function buildReportContent(stats?) {
  return [
    `\u{1F5E3}\uFE0F**Utenti attivi**: ${countArray(stats?.chatUserIds)}`,
    `\u{1F195}**Nuovi utenti in chat**: ${countArray(stats?.newChatUserIds)}`,
    `\u{1F399}\uFE0F**Utenti in vocale**: ${countArray(stats?.voiceUserIds)}`,
    `\u{1F195} **Nuovi utenti in vocale**: ${countArray(stats?.newVoiceUserIds)}`,
  ].join("\n");
}

async function resolveReportChannel(client?) {
  if (!client) return null;
  return (
    client.channels.cache.get(DAILY_ENGAGEMENT_CHANNEL_ID) ||
    (await getClientChannelCached(client, DAILY_ENGAGEMENT_CHANNEL_ID)) ||
    (await client.channels.fetch(DAILY_ENGAGEMENT_CHANNEL_ID).catch(() => null))
  );
}

async function sendDailyEngagementReport(client?, dateKey?, opts: Record<string, any> = {}) {
  const guildId = getMainGuildId();
  if (!client || !guildId || !dateKey || reportRunning) return null;
  const createIfMissing = opts.createIfMissing !== false;

  reportRunning = true;
  try {
    const doc = createIfMissing
      ? await getOrCreateDailyStats("engagementDaily", guildId, dateKey, {
          chatUserIds: [],
          newChatUserIds: [],
          voiceUserIds: [],
          newVoiceUserIds: [],
        })
      : await findDailyStats("engagementDaily", guildId, dateKey);
    if (!doc) return null;
    const stats = doc.value || {};
    if (stats.reportedAt || stats.reportMessageId) return doc;

    const channel = await resolveReportChannel(client);
    if (!channel?.isTextBased?.()) {
      global.logger?.warn?.("[DAILY ENGAGEMENT] report channel not found:", DAILY_ENGAGEMENT_CHANNEL_ID);
      return stats;
    }

    const sent = await channel.send({ content: buildReportContent(stats) }).catch((err?) => {
      global.logger?.error?.("[DAILY ENGAGEMENT] report send failed:", err?.message || err);
      return null;
    });
    if (!sent) return doc;

    doc.value = { ...(doc.value || {}), reportMessageId: sent.id, reportedAt: new Date() };
    doc.markModified("value");
    await doc.save().catch((err?) => {
      global.logger?.warn?.("[DAILY ENGAGEMENT] report mark failed:", err?.message || err);
    });
    return doc;
  } finally {
    reportRunning = false;
  }
}

function startDailyEngagementStatsLoop(client?) {
  if (!client || dailyEngagementCron) return dailyEngagementCron;

  dailyEngagementCron = cron.schedule(
    "0 0 * * *",
    () => {
      const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
      void sendDailyEngagementReport(client, yesterdayKey).catch((err?) => {
        global.logger?.error?.("[DAILY ENGAGEMENT] scheduled report failed:", err);
      });
    },
    { timezone: TIME_ZONE },
  );

  setImmediate(() => {
    trackCurrentPublicVoiceMembers(client).catch((err?) => {
      global.logger?.warn?.("[DAILY ENGAGEMENT] startup voice sync failed:", err?.message || err);
    });
    const yesterdayKey = addDaysToRomeKey(getRomeDateKey(new Date()), -1);
    sendDailyEngagementReport(client, yesterdayKey, { createIfMissing: false }).catch((err?) => {
      global.logger?.warn?.("[DAILY ENGAGEMENT] startup recovery failed:", err?.message || err);
    });
  });

  return dailyEngagementCron;
}

export = {
  startDailyEngagementStatsLoop,
  trackMessageEngagement,
  trackVoiceEngagement,
  trackCurrentPublicVoiceMembers,
};