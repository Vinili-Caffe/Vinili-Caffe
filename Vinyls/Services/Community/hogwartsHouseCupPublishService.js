const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig, isEventWindowOpen } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank");
const { periodEndingOnDate, nextPeriodAfter, rankHousesForPeriod } = require("../../Utils/Web/hogwartsHousePointPeriods");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");
const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const CUP_PUBLISH_DOC = "hogwarts_house_cup_publish";
const EVENT_OWNER_ID = "__event__";
const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>", "4."];
const COPPA_URL = "https://viniliecaffe.it/evento/coppa";

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
    weekday: "short",
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
    hour: Number(parts.hour || 0),
  };
}

function romeDateKeyFromMs(ms) {
  const p = getRomeDateTimeParts(new Date(ms));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function getLastSunday21BoundaryMsAtOrBefore(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(nowMs)) return Date.now();
  const p = getRomeDateTimeParts(new Date(nowMs));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[String(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(new Date(nowMs)))] ?? 0;
  if (weekday === 0) {
    const thisSunday21 = createUtcFromRomeLocal(p.year, p.month, p.day, 21, 0, 0).getTime();
    if (nowMs < thisSunday21) {
      return createUtcFromRomeLocal(p.year, p.month, p.day - 7, 21, 0, 0).getTime();
    }
    return thisSunday21;
  }
  return createUtcFromRomeLocal(p.year, p.month, p.day - weekday, 21, 0, 0).getTime();
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

function isHogwartsEventLive(client) {
  const cfg = resolveHogwartsEventConfig(client);
  if (!cfg?.enabled) return false;
  return Boolean(isEventWindowOpen(cfg, Date.now())?.open);
}

function shouldPublishHogwartsBiweeklySunday(now = new Date(), eventStartMs) {
  const start = Number(eventStartMs);
  if (!Number.isFinite(start)) return false;
  const endMs = getLastSunday12BoundaryMsAtOrBefore(now);
  const anchorMs = getLastSunday12BoundaryMsAtOrBefore(new Date(start));
  const daysSince = Math.floor((endMs - anchorMs) / (24 * 60 * 60 * 1000));
  if (daysSince < 14) return false;
  return daysSince % 14 === 0;
}

async function loadHousePointsDoc(guildId, eventKey) {
  return SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: String(guildId || "").trim(),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: String(eventKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function findCupPublishMarker(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: CUP_PUBLISH_DOC,
    guildId: String(guildId || "").trim(),
    userId: EVENT_OWNER_ID,
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

function formatHouseRankLine(index, houseId, points, eventCfg) {
  const medal = TROPHY_LABELS[index] || `${index + 1}.`;
  const meta = getHouseMeta(houseId, eventCfg?.houses?.[houseId]?.crestUrl);
  const label = meta?.label || houseId;
  const roleId = String(eventCfg?.houses?.[houseId]?.roleId || "").trim();
  const mention = roleId ? `<@&${roleId}>` : `**${label}**`;
  return `${medal} ${mention} <a:VC_Arrow:1482706699365257397> **${points}** *punti*`;
}

function buildHouseCupEmbed(period, ranked, eventCfg, guild) {
  const lines = ranked.length
    ? ranked.map((row, index) => formatHouseRankLine(index, row.houseId, row.points, eventCfg))
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun punto registrato in questo periodo."];
  const winner = ranked[0];
  const winnerMeta = winner ? getHouseMeta(winner.houseId, eventCfg?.houses?.[winner.houseId]?.crestUrl) : null;
  const winnerLine = winner?.points > 0 && winnerMeta?.label
    ? `\n<a:VC_Star:1482706774372253788> In testa: **${winnerMeta.label}** con **${winner.points}** punti.`
    : "";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Coppa delle Case`)
    .setDescription(
      [
        `<:VC_Leaderboard:1482534806314287387> Classifica **${period.rangeLabel}**.`,
        "",
        ...lines,
        winnerLine,
        "",
        `<:VC_Dot:1482532364222595303> Dettaglio completo sul [sito](${COPPA_URL}).`,
      ].join("\n"),
    )
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
}

async function resolvePublishGuildAndChannel(client, targetChannelId = TARGET_CHANNEL_ID) {
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  const channel =
    client.channels.cache.get(targetChannelId) || (await getClientChannelCached(client, targetChannelId, { ttlMs: 60_000 }));
  if (!guild && channel?.guild) guild = channel.guild;
  return { guild, channel };
}

async function publishHogwartsHouseCupClose(client, options = {}) {
  if (!isHogwartsEventLive(client)) {
    global.logger?.info?.("[HOGWARTS HOUSE CUP] Publish skipped: evento non attivo.");
    return;
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const now = options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime()) ? options.anchorDate : new Date();
  if (!options.forcePublish && !shouldPublishHogwartsBiweeklySunday(now, eventCfg.startMs)) {
    global.logger?.info?.("[HOGWARTS HOUSE CUP] Publish skipped: non è domenica bisettimanale.");
    return;
  }
  const boundaryMs = getLastSunday21BoundaryMsAtOrBefore(now);
  const todayKey = romeDateKeyFromMs(boundaryMs);
  const closingPeriod = periodEndingOnDate(todayKey);
  if (!closingPeriod) {
    global.logger?.info?.("[HOGWARTS HOUSE CUP] Publish skipped: nessun anno in chiusura oggi.", todayKey);
    return;
  }
  const { guild, channel } = await resolvePublishGuildAndChannel(client, options.targetChannelId || TARGET_CHANNEL_ID);
  if (!guild || !channel) {
    global.logger?.error?.("[HOGWARTS HOUSE CUP] Publish skipped: guild o canale non trovato.");
    return;
  }
  const dedupeKey = `${eventCfg.eventKey}_${closingPeriod.key}_close`;
  const existing = await findCupPublishMarker(guild.id, dedupeKey);
  if (existing?.status === "completed" && !options.forcePublish) {
    global.logger?.info?.("[HOGWARTS HOUSE CUP] Publish skipped: già pubblicato.", dedupeKey);
    return;
  }
  const pointsDoc = await loadHousePointsDoc(guild.id, eventCfg.eventKey);
  const ranked = rankHousesForPeriod(pointsDoc, closingPeriod.key);
  const embed = buildHouseCupEmbed(closingPeriod, ranked, eventCfg, guild);
  const winner = ranked[0];
  const winnerRoleId = winner ? String(eventCfg?.houses?.[winner.houseId]?.roleId || "").trim() : "";
  const winnerMention = winnerRoleId && winner?.points > 0 ? `<@&${winnerRoleId}>` : "nessuna casa in testa";
  const nextPeriod = nextPeriodAfter(closingPeriod);
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Coppa sul sito").setStyle(ButtonStyle.Link).setEmoji("<:VC_FrogCute:1331620415185096746>").setURL(COPPA_URL),
  );
  const payload = {
    content: `<@&1442568949605597264>
<a:VC_Winner:1482535294757507255> **Coppa delle Case**.

<a:VC_Arrow:1482706699365257397> ${winnerMention} chiude in testa con **${Number(winner?.points || 0)}** punti.
_ _`,
    embeds: [embed],
    components: [button],
  };
  if (!options.skipDiscordSends) {
    try {
      await channel.send(payload);
    } catch (err) {
      global.logger?.error?.("[HOGWARTS HOUSE CUP] Invio fallito:", err);
    }
  }
  await SiteDocument.findOneAndUpdate(
    {
      docType: CUP_PUBLISH_DOC,
      guildId: guild.id,
      userId: EVENT_OWNER_ID,
      dedupeKey,
    },
    {
      $setOnInsert: {
        docType: CUP_PUBLISH_DOC,
        guildId: guild.id,
        userId: EVENT_OWNER_ID,
        dedupeKey,
        createdBy: "hogwarts_house_cup",
      },
      $set: {
        status: "completed",
        planKey: "hogwarts_house_cup_close",
        "rawWebhook.periodKey": closingPeriod.key,
        "rawWebhook.ranked": ranked,
        "rawWebhook.nextPeriodKey": nextPeriod?.key || "",
        decidedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

let hogwartsHouseCupLoopStarted = false;
function startHogwartsHouseCupLoop(client) {
  if (hogwartsHouseCupLoopStarted) return;
  hogwartsHouseCupLoopStarted = true;
  cron.schedule(
    "0 21 * * 0",
    runCronDetached("[HOGWARTS HOUSE CUP]", async () => {
      if (!isHogwartsEventLive(client)) return;
      await publishHogwartsHouseCupClose(client);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
}

module.exports = { startHogwartsHouseCupLoop, publishHogwartsHouseCupClose, isHogwartsEventLive, shouldPublishHogwartsBiweeklySunday };