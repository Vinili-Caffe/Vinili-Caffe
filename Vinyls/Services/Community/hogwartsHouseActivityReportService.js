const { EmbedBuilder } = require("discord.js");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { periodEndingOnDate } = require("../../Utils/Web/hogwartsHousePointPeriods");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");
const { collectHogwartsBiweeklyActivityRows, isHogwartsWeeklyTopReplaced, shouldPublishHogwartsBiweeklyToday } = require("./weeklyActivityWinnersService");
const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = String(IDs.channels?.hogwartsHouseActivityReport || "1507685351102353448").trim();
const REPORT_PUBLISH_DOC = "hogwarts_house_activity_report";
const REPORT_OWNER_ID = "__event__";

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit" });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDateTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
  };
}

function romeDateKeyFromMs(ms) {
  const p = getRomeDateTimeParts(new Date(ms));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function getLastSunday12BoundaryMsAtOrBefore(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(nowMs)) return Date.now();
  const p = getRomeDateTimeParts(new Date(nowMs));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[String(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(new Date(nowMs)))] ?? 0;
  if (weekday === 0) {
    const thisSunday12 = createUtcFromRomeLocal(p.year, p.month, p.day, 12, 0, 0).getTime();
    if (nowMs < thisSunday12) {
      return createUtcFromRomeLocal(p.year, p.month, p.day - 7, 12, 0, 0).getTime();
    }
    return thisSunday12;
  }
  return createUtcFromRomeLocal(p.year, p.month, p.day - weekday, 12, 0, 0).getTime();
}

function houseLabel(houseId, eventCfg) {
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

function formatVoiceHours(voiceMinutes) {
  const mins = Math.max(0, Math.floor(Number(voiceMinutes) || 0));
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function initHouseBuckets() {
  const out = {};
  for (const houseId of HOUSES) {
    out[houseId] = {
      messageMembers: 0,
      voiceMembers: 0,
      minigameMembers: 0,
      totalMessages: 0,
      totalVoiceMinutes: 0,
      totalMinigame: 0,
      mvpUserId: "",
      mvpScore: -1,
      mvpMessages: 0,
      mvpVoiceMinutes: 0,
      mvpMinigame: 0,
    };
  }
  return out;
}

function buildHouseActivityStats(users) {
  const buckets = initHouseBuckets();
  for (const row of Array.isArray(users) ? users : []) {
    const houseId = String(row?.houseId || "").trim();
    if (!buckets[houseId]) continue;
    const b = buckets[houseId];
    const messages = Math.max(0, Math.floor(Number(row.messages) || 0));
    const voiceMinutes = Math.max(0, Math.floor(Number(row.voiceMinutes) || 0));
    const minigame = Math.max(0, Math.floor(Number(row.minigame) || 0));
    if (messages > 0) {
      b.messageMembers += 1;
      b.totalMessages += messages;
    }
    if (voiceMinutes > 0) {
      b.voiceMembers += 1;
      b.totalVoiceMinutes += voiceMinutes;
    }
    if (minigame > 0) {
      b.minigameMembers += 1;
      b.totalMinigame += minigame;
    }
    const score = messages + voiceMinutes * 2 + minigame;
    if (score > b.mvpScore) {
      b.mvpScore = score;
      b.mvpUserId = String(row.userId || "");
      b.mvpMessages = messages;
      b.mvpVoiceMinutes = voiceMinutes;
      b.mvpMinigame = minigame;
    }
  }
  return buckets;
}

function pickTopHouse(buckets, metric) {
  let bestHouse = "";
  let bestVal = -1;
  for (const houseId of HOUSES) {
    const val = Math.max(0, Math.floor(Number(metric(buckets[houseId])) || 0));
    if (val > bestVal) {
      bestVal = val;
      bestHouse = houseId;
    }
  }
  return { houseId: bestHouse, value: Math.max(0, bestVal) };
}

function formatHouseWinner(houseId, value, suffix, eventCfg) {
  if (!houseId || value <= 0) return "—";
  return `**${houseLabel(houseId, eventCfg)}** (${value} ${suffix})`;
}

function formatMvpLine(houseId, bucket, eventCfg) {
  if (!bucket?.mvpUserId) return `**${houseLabel(houseId, eventCfg)}:** —`;
  return [
    `**${houseLabel(houseId, eventCfg)}:** <@${bucket.mvpUserId}>`,
    `↳ ${bucket.mvpMessages} msg · ${formatVoiceHours(bucket.mvpVoiceMinutes)} vocal · ${bucket.mvpMinigame} pt minigame`,
  ].join("\n");
}

function buildReportEmbed({ closingPeriod, buckets, eventCfg, guild }) {
  const chatMembers = pickTopHouse(buckets, (b) => b.messageMembers);
  const vocMembers = pickTopHouse(buckets, (b) => b.voiceMembers);
  const mgMembers = pickTopHouse(buckets, (b) => b.minigameMembers);
  const chatVol = pickTopHouse(buckets, (b) => b.totalMessages);
  const vocVol = pickTopHouse(buckets, (b) => b.totalVoiceMinutes);
  const mgVol = pickTopHouse(buckets, (b) => b.totalMinigame);
  const mvpLines = HOUSES.map((houseId) => formatMvpLine(houseId, buckets[houseId], eventCfg));
  const periodTitle = closingPeriod?.label ? `${closingPeriod.label} (${closingPeriod.rangeLabel || ""})` : "Periodo bisettimanale";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Attività per casa`)
    .setDescription(
      [
        `<:VC_Leaderboard:1482534806314287387> Riepilogo delle **ultime 2 settimane** per casa.`,
        "",
        "<a:VC_HeartsPink:1468685897389052008> **Casata con più membri attivi**",
        `• Chat testuale: ${formatHouseWinner(chatMembers.houseId, chatMembers.value, "membri", eventCfg)}`,
        `• Chat vocale: ${formatHouseWinner(vocMembers.houseId, vocMembers.value, "membri", eventCfg)}`,
        `• Minigames: ${formatHouseWinner(mgMembers.houseId, mgMembers.value, "membri", eventCfg)}`,
        "",
        "<a:VC_HeartsBlue:1468686100045369404> **Casata con volume più alto**",
        `• Messaggi: ${formatHouseWinner(chatVol.houseId, chatVol.value, "messaggi", eventCfg)}`,
        `• Ore vocali: ${vocVol.houseId && vocVol.value > 0 ? `**${houseLabel(vocVol.houseId, eventCfg)}** (${formatVoiceHours(vocVol.value)})` : "—"}`,
        `• Minigames vinti: ${formatHouseWinner(mgVol.houseId, mgVol.value, "pt", eventCfg)}`,
        "",
        "<a:VC_Events:1482706144953897223> **MVP per casa**",
        ...mvpLines,
      ].join("\n"),
    )
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
}

async function findReportMarker(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: REPORT_PUBLISH_DOC,
    guildId: String(guildId || "").trim(),
    userId: REPORT_OWNER_ID,
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

function resolveClosingSchoolPeriod(now = new Date()) {
  const boundaryMs = getLastSunday12BoundaryMsAtOrBefore(now);
  const todayKey = romeDateKeyFromMs(boundaryMs);
  return periodEndingOnDate(todayKey);
}

async function publishHogwartsHouseActivityReport(client, options = {}) {
  if (!isHogwartsWeeklyTopReplaced(client)) {
    global.logger?.info?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: evento non attivo.");
    return;
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const now = options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime()) ? options.anchorDate : new Date();
  if (!options.forcePublish && !shouldPublishHogwartsBiweeklyToday(now, eventCfg.startMs)) {
    global.logger?.info?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: non è domenica bisettimanale.");
    return;
  }
  const closingPeriod = resolveClosingSchoolPeriod(now);
  if (!closingPeriod && !options.forcePublish) {
    global.logger?.info?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: nessun anno scolastico in chiusura.");
    return;
  }
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  const channelId = String(options.targetChannelId || TARGET_CHANNEL_ID).trim();
  let channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId, { ttlMs: 60_000 }));
  if (!guild && channel?.guild) guild = channel.guild;
  if (!guild || !channel) {
    global.logger?.error?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: guild o canale non trovato.", channelId);
    return;
  }
  const dedupeKey = `${eventCfg.eventKey}_${closingPeriod?.key || "manual"}_activity_report`;
  const existing = await findReportMarker(guild.id, dedupeKey);
  if (existing?.status === "completed" && !options.forcePublish) {
    global.logger?.info?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: già pubblicato.", dedupeKey);
    return;
  }
  const collected = await collectHogwartsBiweeklyActivityRows(guild, now, eventCfg.eventKey);
  if (!collected.ok || !collected.users.length) {
    global.logger?.warn?.("[HOGWARTS HOUSE ACTIVITY] Publish skipped: nessun dato attività.", collected.code || "empty");
    return;
  }
  const buckets = buildHouseActivityStats(collected.users);
  const embed = buildReportEmbed({ closingPeriod, buckets, eventCfg, guild });
  const payload = {
    content: `
<a:VC_Winner:1482535294757507255> **Report attività casate**.

<a:VC_Arrow:1482706699365257397> Ecco quale casa è stata più attiva nelle ultime 2 settimane e chi ha spinto di più per ogni casa.
_ _`,
    embeds: [embed],
  };
  if (!options.skipDiscordSends) {
    try {
      await channel.send(payload);
    } catch (err) {
      global.logger?.error?.("[HOGWARTS HOUSE ACTIVITY] Invio fallito:", err);
    }
  }
  await SiteDocument.findOneAndUpdate(
    {
      docType: REPORT_PUBLISH_DOC,
      guildId: guild.id,
      userId: REPORT_OWNER_ID,
      dedupeKey,
    },
    {
      $setOnInsert: {
        docType: REPORT_PUBLISH_DOC,
        guildId: guild.id,
        userId: REPORT_OWNER_ID,
        dedupeKey,
        createdBy: "hogwarts_house_activity_report",
      },
      $set: {
        status: "completed",
        planKey: "hogwarts_house_activity_report",
        "rawWebhook.periodKey": closingPeriod?.key || "",
        "rawWebhook.activityPeriodKey": collected.periodKey,
        "rawWebhook.buckets": buckets,
        decidedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

module.exports = { publishHogwartsHouseActivityReport, buildHouseActivityStats, resolveClosingSchoolPeriod };