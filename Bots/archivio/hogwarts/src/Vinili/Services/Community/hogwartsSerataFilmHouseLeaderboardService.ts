const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { VOICE_EXP_PER_MINUTE } = require("./expService") as typeof import("./expService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { buildHouseActivityStats } = require("./hogwartsHouseActivityReportService") as typeof import("./hogwartsHouseActivityReportService");
const { isHogwartsWeeklyTopReplaced, loadSortedHouseByUserId, loadRowsFromHourlyWindowByHourKeys, awardHogwartsBiweeklyHousePoints, buildHourKeysBetweenMs, createUtcFromRomeLocal } = require("./weeklyActivityWinnersService") as typeof import("./weeklyActivityWinnersService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const SERATA_FILM_MIN_VOICE_MS = 30_000;
const attendanceSessions = new Map();
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const SERATA_FILM_VOICE_CHANNEL_ID = String(IDs.channels?.serataFilm || "1497535199813042306").trim();
const TARGET_CHANNEL_ID = String(IDs.channels?.hogwartsHouseActivityReport || "1507685351102353448").trim();
const PUBLISH_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SERATA_FILM_LB_PUBLISH;
const PUBLISH_OWNER_ID = "__event__";
const HOUSE_POINTS_BY_RANK = [200, 150, 100, 50];
const SERATA_FALLBACK_WINDOW_MS = 3 * 60 * 60 * 1000;
const MOVIE_NIGHT_FILM_HOUR = 21;
const MOVIE_NIGHT_FILM_MINUTE = 0;
const MOVIE_NIGHT_EVENT_ADVANCE_MINUTES = 15;
const PODIUM_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>", "4°"];

function houseLabel(houseId?, eventCfg?) {
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

function resolveHouseRoleId(houseId?, eventCfg?) {
  return String(eventCfg?.houses?.[houseId]?.roleId || "").trim();
}

function getAttendanceSession(guildId?) {
  return attendanceSessions.get(String(guildId || "").trim()) || null;
}

function closeHouseAttendance(session?, userId?, now = Date.now()) {
  const uid = String(userId || "").trim();
  const started = Number(session?.presentSince?.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
}

async function startSerataFilmHouseAttendanceSession(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || getAttendanceSession(guildId)) return;
  const session = {
    guildId,
    startedAt: Date.now(),
    presentSince: new Map(),
    attendanceMs: new Map(),
  };
  attendanceSessions.set(guildId, session);
  const channel = guild.channels.cache.get(SERATA_FILM_VOICE_CHANNEL_ID)
    || (await getGuildChannelCached(guild, SERATA_FILM_VOICE_CHANNEL_ID).catch(() => null));
  if (!channel?.members?.size) return;
  const now = Date.now();
  for (const member of channel.members.values()) {
    if (member?.user?.bot) continue;
    session.presentSince.set(String(member.id), now);
  }
}

function handleSerataFilmHouseAttendanceVoiceState(oldState?, newState?) {
  if (!attendanceSessions.size) return;
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "").trim();
  const userId = String(newState?.id || oldState?.id || "").trim();
  if (!guildId || !userId || newState?.member?.user?.bot || oldState?.member?.user?.bot) return;
  const session = getAttendanceSession(guildId);
  if (!session) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_VOICE_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_VOICE_CHANNEL_ID;
  if (!oldInChannel && newInChannel) session.presentSince.set(userId, now);
  if (oldInChannel && !newInChannel) closeHouseAttendance(session, userId, now);
}

function snapshotSerataFilmHouseAttendance(guildId?, nowMs = Date.now()) {
  const session = getAttendanceSession(guildId);
  if (!session) return new Map();
  const out = new Map();
  for (const [uid, ms] of session.attendanceMs.entries()) {
    const key = String(uid || "").trim();
    if (!key) continue;
    out.set(key, Math.max(0, Number(ms) || 0));
  }
  for (const [uid, started] of session.presentSince.entries()) {
    const key = String(uid || "").trim();
    if (!key) continue;
    const pending = Math.max(0, nowMs - Number(started || 0));
    out.set(key, (out.get(key) || 0) + pending);
  }
  return out;
}

function clearSerataFilmHouseAttendanceSession(guildId?) {
  attendanceSessions.delete(String(guildId || "").trim());
}

async function restoreSerataFilmHouseAttendanceSession(guild?) {
  if (!guild?.id || getAttendanceSession(guild.id)) return;
  const channel = guild.channels.cache.get(SERATA_FILM_VOICE_CHANNEL_ID)
    || (await getGuildChannelCached(guild, SERATA_FILM_VOICE_CHANNEL_ID).catch(() => null));
  if (!channel?.stageInstance) return;
  await startSerataFilmHouseAttendanceSession(guild);
}

async function resolveHouseIdForUser(guild?, userId?, sortedHouseByUserId?, eventCfg?) {
  const uid = String(userId || "").trim();
  if (!uid) return "";
  const fromSort = sortedHouseByUserId.get(uid);
  if (fromSort) return fromSort;
  let member = guild.members.cache.get(uid) || null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  if (!member) return "";
  for (const houseId of HOUSES) {
    const roleId = resolveHouseRoleId(houseId, eventCfg);
    if (roleId && member.roles.cache.has(roleId)) return houseId;
  }
  return "";
}

function houseDisplayLabel(houseId?, eventCfg?) {
  const roleId = resolveHouseRoleId(houseId, eventCfg);
  if (roleId) return `<@&${roleId}>`;
  return `**${houseLabel(houseId, eventCfg)}**`;
}

function collectHouseRoleIdsFromRanked(ranked?, eventCfg?) {
  if (!Array.isArray(ranked)) return [];
  return [...new Set(
    ranked.slice(0, 4).map((row?) => resolveHouseRoleId(row.houseId, eventCfg)).filter(Boolean),
  )];
}

function formatVoiceHours(voiceMinutes?) {
  const mins = Math.max(0, Math.floor(Number(voiceMinutes) || 0));
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseIsoMs(value?) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function getSaturdayKeyFromRomeWeekKey(weekKey?) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekKey || "").trim());
  if (!match) return "";
  const mondayUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const saturday = new Date(mondayUtc + 5 * 24 * 60 * 60 * 1000);
  return `${saturday.getUTCFullYear()}-${String(saturday.getUTCMonth() + 1).padStart(2, "0")}-${String(saturday.getUTCDate()).padStart(2, "0")}`;
}

function resolveScheduledSerataStartMs(weekKey?) {
  const satKey = getSaturdayKeyFromRomeWeekKey(weekKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(satKey);
  if (!match) return 0;
  const filmTotal = MOVIE_NIGHT_FILM_HOUR * 60 + MOVIE_NIGHT_FILM_MINUTE;
  const eventTotal = ((filmTotal - MOVIE_NIGHT_EVENT_ADVANCE_MINUTES) % (24 * 60) + 24 * 60) % (24 * 60);
  const start = createUtcFromRomeLocal(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Math.floor(eventTotal / 60),
    eventTotal % 60,
    0,
  );
  return start.getTime();
}

function resolveSerataFilmWindowMs(weekKey?, state?, endMsOverride?) {
  const endMs = parseIsoMs(endMsOverride || state?.stageClosedAt) || Date.now();
  const scheduledStartMs = resolveScheduledSerataStartMs(weekKey);
  let startMs = parseIsoMs(state?.stagePermissionsOpenedAt);
  if (!startMs) startMs = parseIsoMs(state?.eventStartAnnouncedAt);
  if (scheduledStartMs > 0) {
    if (!startMs || startMs < scheduledStartMs) startMs = scheduledStartMs;
  }
  if (!startMs || startMs >= endMs) {
    const fallbackStart = endMs - SERATA_FALLBACK_WINDOW_MS;
    startMs = scheduledStartMs > 0 ? Math.max(scheduledStartMs, fallbackStart) : fallbackStart;
  }
  return { startMs, endMs };
}

function rankHousesByMetric(buckets?, metricFn?) {
  return HOUSES
    .map((houseId?) => ({
      houseId,
      value: Math.max(0, Math.floor(Number(metricFn(buckets[houseId] || {})) || 0)),
    }))
    .filter((row?) => row.value > 0)
    .sort((a?, b?) => b.value - a.value);
}

function rankHousesByCombinedVoice(buckets?) {
  return HOUSES
    .map((houseId?) => {
      const b = buckets[houseId] || {};
      return {
        houseId,
        voiceMembers: Math.max(0, Math.floor(Number(b.voiceMembers) || 0)),
        totalVoiceMinutes: Math.max(0, Math.floor(Number(b.totalVoiceMinutes) || 0)),
      };
    })
    .filter((row?) => row.voiceMembers > 0 || row.totalVoiceMinutes > 0)
    .sort((a?, b?) => {
      if (b.voiceMembers !== a.voiceMembers) return b.voiceMembers - a.voiceMembers;
      return b.totalVoiceMinutes - a.totalVoiceMinutes;
    });
}

function formatCombinedRankingLines(ranked?, eventCfg?) {
  if (!Array.isArray(ranked) || !ranked.length) return ["—"];
  const lines = [];
  for (let i = 0; i < Math.min(4, ranked.length); i += 1) {
    const row = ranked[i];
    const pts = HOUSE_POINTS_BY_RANK[i] || 0;
    const label = PODIUM_LABELS[i] || `${i + 1}°`;
    const members = `${row.voiceMembers} ${row.voiceMembers === 1 ? "membro" : "membri"}`;
    const avgMinutes = row.voiceMembers > 0
      ? Math.round(row.totalVoiceMinutes / row.voiceMembers)
      : 0;
    const time = formatVoiceHours(avgMinutes);
    lines.push(`${label} ${houseDisplayLabel(row.houseId, eventCfg)} — ${members} · media ${time} · **+${pts} pt**`);
  }
  return lines;
}

async function findPublishMarker(guildId?, dedupeKey?) {
  return SiteDocument.findOne({
    docType: PUBLISH_DOC,
    guildId: String(guildId || "").trim(),
    userId: PUBLISH_OWNER_ID,
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function collectSerataFilmHouseVoiceRows(guild?, startMs?, endMs?, eventKey?, options: Record<string, any> = {}) {
  const ek = String(eventKey || "").trim();
  const eventCfg = options.eventCfg || null;
  const sortedHouseByUserId = await loadSortedHouseByUserId(guild.id, ek);
  const attendanceSnapshot = options.attendanceSnapshot instanceof Map ? options.attendanceSnapshot : null;
  if (attendanceSnapshot?.size) {
    const users = [];
    for (const [userId, ms] of attendanceSnapshot.entries()) {
      const attendanceMs = Math.max(0, Number(ms) || 0);
      if (attendanceMs < SERATA_FILM_MIN_VOICE_MS) continue;
      const houseId = await resolveHouseIdForUser(guild, userId, sortedHouseByUserId, eventCfg);
      if (!houseId) continue;
      const voiceMinutes = Math.max(1, Math.round(attendanceMs / 60_000));
      users.push({
        userId: String(userId),
        houseId,
        messages: 0,
        voiceMinutes,
        minigame: 0,
      });
    }
    if (users.length) {
      return { ok: true, code: "ok_attendance", users, startMs, endMs, source: "attendance" };
    }
  }
  if (!sortedHouseByUserId.size) {
    return { ok: false, code: "no_sorted", users: [] };
  }
  const hourKeys = buildHourKeysBetweenMs(startMs, endMs);
  if (!hourKeys.length) {
    return { ok: false, code: "no_window", users: [] };
  }
  const eligible = {
    text: new Set(),
    voice: new Set([SERATA_FILM_VOICE_CHANNEL_ID]),
  };
  const rowsSource = await loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys, { startMs, endMs });
  const users = [];
  for (const row of rowsSource) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    const houseId = await resolveHouseIdForUser(guild, userId, sortedHouseByUserId, eventCfg);
    if (!houseId) continue;
    const voiceMinutes = Math.max(0, Math.floor((Math.max(0, Number(row?.voiceExp) || 0)) / Math.max(1, VOICE_EXP_PER_MINUTE)));
    if (voiceMinutes <= 0) continue;
    users.push({
      userId,
      houseId,
      messages: 0,
      voiceMinutes,
      minigame: 0,
    });
  }
  return { ok: users.length > 0, code: users.length ? "ok_hourly" : "empty", users, startMs, endMs, hourKeys, source: "hourly" };
}

async function awardSerataFilmHouseRankings(guildId?, eventKey?, weekKey?, ranked?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  const wk = String(weekKey || "").trim();
  const awarded = [];
  for (let i = 0; i < Math.min(4, ranked.length); i += 1) {
    const row = ranked[i];
    const pts = HOUSE_POINTS_BY_RANK[i] || 0;
    if (!row?.houseId || pts <= 0) continue;
    if (row.voiceMembers <= 0 && row.totalVoiceMinutes <= 0) continue;
    const gameKey = `serata_film_${wk}_voice_combined_r${i + 1}`;
    const ok = await awardHogwartsBiweeklyHousePoints(gid, row.houseId, ek, pts, gameKey);
    if (ok) {
      awarded.push({ rank: i + 1, houseId: row.houseId, points: pts });
    }
  }
  return awarded;
}

function buildLeaderboardEmbed({ movieTitle, rankedCombined, eventCfg, guild, startMs, endMs }) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Serata Film — Classifica casate")
    .setDescription(
      [
        `<a:VC_Events:1482706144953897223> **${String(movieTitle || "Serata Film").trim()}**`,
        "",
        "<a:VC_HeartsPink:1468685897389052008> **Classifica casate più attive**",
        ...formatCombinedRankingLines(rankedCombined, eventCfg),
      ].join("\n"),
    )
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
}

async function resolveSerataFilmHouseLeaderboard(client?, options: Record<string, any> = {}) {
  if (!isHogwartsWeeklyTopReplaced(client)) {
    return { ok: false, skipped: true, reason: "hogwarts_event_inactive" };
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim();
  if (!eventKey) return { ok: false, skipped: true, reason: "missing_event_key" };
  const weekKey = String(options.weekKey || "").trim();
  if (!weekKey) return { ok: false, skipped: true, reason: "missing_week_key" };
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  let guild = options.guild || null;
  if (!guild && mainGuildId) {
    guild = client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null));
  }
  if (!guild) return { ok: false, skipped: true, reason: "guild_unavailable" };
  const dedupeKey = `${eventKey}_${weekKey}`;
  if (!options.forcePublish) {
    const existing = await findPublishMarker(guild.id, dedupeKey);
    if (existing?.status === "completed") {
      const rankedCombined = Array.isArray(existing?.rawWebhook?.rankedCombined) ? existing.rawWebhook.rankedCombined : [];
      const movieTitle = String(existing?.rawWebhook?.movieTitle || options.movieTitle || "Serata Film").trim();
      const startMs = parseIsoMs(existing?.rawWebhook?.startMs);
      const endMs = parseIsoMs(existing?.rawWebhook?.endMs);
      const embed = rankedCombined.length
        ? buildLeaderboardEmbed({ movieTitle, rankedCombined, eventCfg, guild, startMs, endMs })
        : null;
      return {
        ok: rankedCombined.length > 0,
        skipped: true,
        reason: "already_published",
        dedupeKey,
        weekKey,
        eventCfg,
        guild,
        rankedCombined,
        awarded: Array.isArray(existing?.rawWebhook?.awarded) ? existing.rawWebhook.awarded : [],
        embed,
        movieTitle,
        startMs,
        endMs,
      };
    }
  }
  const { startMs, endMs } = resolveSerataFilmWindowMs(weekKey, options.state, options.endMs);
  const collected = await collectSerataFilmHouseVoiceRows(guild, startMs, endMs, eventKey, {
    eventCfg,
    attendanceSnapshot: options.attendanceSnapshot,
  });
  if (!collected.ok || !collected.users?.length) {
    global.logger?.info?.("[HOGWARTS SERATA FILM LB] Skipped: no voice activity.", collected.code || "empty", weekKey);
    return { ok: false, skipped: true, reason: collected.code || "empty", weekKey, eventCfg, guild };
  }
  const buckets = buildHouseActivityStats(collected.users);
  const rankedCombined = rankHousesByCombinedVoice(buckets);
  const awarded = await awardSerataFilmHouseRankings(guild.id, eventKey, weekKey, rankedCombined);
  const movieTitle =
    String(options.movieTitle || options.state?.stageCloseMovieTitle || options.state?.eventStartMovieTitle || options.state?.finalMovieTitle || "Serata Film").trim();
  const embed = buildLeaderboardEmbed({
    movieTitle,
    rankedCombined,
    eventCfg,
    guild,
    startMs: collected.startMs,
    endMs: collected.endMs,
  });
  await SiteDocument.findOneAndUpdate(
    {
      docType: PUBLISH_DOC,
      guildId: guild.id,
      userId: PUBLISH_OWNER_ID,
      dedupeKey,
    },
    {
      $setOnInsert: {
        docType: PUBLISH_DOC,
        guildId: guild.id,
        userId: PUBLISH_OWNER_ID,
        dedupeKey,
        createdBy: "hogwarts_serata_film_lb",
      },
      $set: {
        status: "completed",
        planKey: "hogwarts_serata_film_lb",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.weekKey": weekKey,
        "rawWebhook.movieTitle": movieTitle,
        "rawWebhook.startMs": collected.startMs,
        "rawWebhook.endMs": collected.endMs,
        "rawWebhook.buckets": buckets,
        "rawWebhook.rankedCombined": rankedCombined,
        "rawWebhook.awarded": awarded,
        decidedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return {
    ok: true,
    skipped: false,
    weekKey,
    dedupeKey,
    eventCfg,
    guild,
    rankedCombined,
    awarded,
    embed,
    movieTitle,
    startMs: collected.startMs,
    endMs: collected.endMs,
  };
}

async function sendSerataFilmHouseLeaderboardToReportChannel(client?, result?, options: Record<string, any> = {}) {
  const embed = result?.embed || null;
  if (!embed) return "";
  if (options.skipIfPublished && result.dedupeKey && result.guild?.id) {
    const existing = await findPublishMarker(result.guild.id, result.dedupeKey);
    if (String(existing?.rawWebhook?.messageId || "").trim()) {
      return String(existing.rawWebhook.messageId);
    }
  }
  const channelId = String(options.targetChannelId || TARGET_CHANNEL_ID).trim();
  const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId, { ttlMs: 60_000 }));
  if (!channel?.isTextBased?.()) return "";
  try {
    const houseRoleIds = collectHouseRoleIdsFromRanked(result.rankedCombined, result.eventCfg);
    const sent = await channel.send({
      content: "<a:VC_Winner:1482535294757507255> **Classifica casate Serata Film**",
      embeds: [embed],
      allowedMentions: houseRoleIds.length ? { roles: houseRoleIds } : { parse: [] },
    });
    const messageId = String(sent?.id || "");
    if (messageId && result.dedupeKey && result.guild?.id) {
      await SiteDocument.findOneAndUpdate(
        {
          docType: PUBLISH_DOC,
          guildId: result.guild.id,
          userId: PUBLISH_OWNER_ID,
          dedupeKey: result.dedupeKey,
        },
        { $set: { "rawWebhook.messageId": messageId } },
      ).catch(() => null);
    }
    return messageId;
  } catch (err) {
    global.logger?.error?.("[HOGWARTS SERATA FILM LB] Send failed:", err?.message || err);
    return "";
  }
}

async function publishHogwartsSerataFilmHouseLeaderboard(client?, options: Record<string, any> = {}) {
  const result = await resolveSerataFilmHouseLeaderboard(client, options);
  if (!result.ok || options.skipDiscordSends) return result;
  const messageId = await sendSerataFilmHouseLeaderboardToReportChannel(client, result, options);
  return { ...result, messageId };
}

export = { publishHogwartsSerataFilmHouseLeaderboard, resolveSerataFilmHouseLeaderboard, sendSerataFilmHouseLeaderboardToReportChannel, collectSerataFilmHouseVoiceRows, rankHousesByMetric, rankHousesByCombinedVoice, formatCombinedRankingLines, collectHouseRoleIdsFromRanked, startSerataFilmHouseAttendanceSession, handleSerataFilmHouseAttendanceVoiceState, snapshotSerataFilmHouseAttendance, clearSerataFilmHouseAttendanceSession, restoreSerataFilmHouseAttendanceSession, HOUSE_POINTS_BY_RANK };