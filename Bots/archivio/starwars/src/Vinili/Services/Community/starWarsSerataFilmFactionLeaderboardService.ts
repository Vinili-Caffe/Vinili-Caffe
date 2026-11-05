/**
 * Classifica unica fazioni serata film SW (stile Hogwarts):
 * ordina per più utenti, poi media tempo in vocale.
 * Premi: 1° 200k / 2° 100k crediti banca; 5k exp a chi ha guardato ≥30 min (1° e 2°).
 * Il testo va nell'annuncio di fine serata (non in un canale a parte).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { getClientGuildCached } = require(__eventCoreVinili("../shared/discord/interactionEntityCache"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { EPOCHS, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { getRuntimeFlags } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const { FACTION_SLOT_NAMES } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
const { remapFactionId } = require("./starWarsTransversalService") as typeof import("./starWarsTransversalService");
const { getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { addFactionBankCredits } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
const { grantStarWarsReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
const {
  isStarWarsMovieNightWeek,
  getStarWarsMovieNightScheduleForWeek,
  getRomeSaturdayKeyForWeek,
} = require(__eventCoreVinili("Community/services/movieNightSchedule"));

const PUBLISH_DOC = SITE_DOCUMENT_TYPE.STARWARS_SERATA_FILM_LB_PUBLISH;
const PUBLISH_OWNER_ID = "__event__";
const MIN_COUNT_MS = 30_000;
const MIN_EXP_MS = 30 * 60 * 1000;
const CREDITS_BY_RANK = Object.freeze([200_000, 100_000]);
const PERSONAL_EXP = 5_000;
const PODIUM = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>"];
const CREDITI = "<a:VC_crediti:1567852561543733338>";

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function factionDisplayName(epoch?, factionId?) {
  const names = FACTION_SLOT_NAMES[epoch] || FACTION_SLOT_NAMES[EPOCHS.CLONE_WARS];
  const fid = normalizeId(factionId).toLowerCase();
  const leftIds = ["repubblica", "ribellione", "nuova_repubblica"];
  const rightIds = ["separatisti", "impero", "nuovo_ordine"];
  if (leftIds.includes(fid)) return String(names.left || fid).replace(/^༄\s*/u, "").trim();
  if (rightIds.includes(fid)) return String(names.right || fid).replace(/^༄\s*/u, "").trim();
  return fid || "Fazione";
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

function formatCreditsLabel() {
  return CREDITS_BY_RANK.map((c) => `+${c.toLocaleString("it-IT")}`).join(" · ");
}

async function resolveUserFactionId(client?, guildId?, userId?, epoch?) {
  const wallet = await getStarWarsWallet(guildId, userId);
  const raw = normalizeId(wallet?.factionId).toLowerCase();
  if (!raw) return "";
  return normalizeId(remapFactionId(raw, epoch)).toLowerCase();
}

function emptyBucket(factionId?) {
  return {
    factionId: normalizeId(factionId),
    voiceMembers: 0,
    totalVoiceMinutes: 0,
    avgVoiceMinutes: 0,
    viewers30m: [] as string[],
  };
}

function buildFactionBuckets(users?, factionIds = []) {
  const buckets: Record<string, any> = {};
  for (const fid of factionIds) buckets[fid] = emptyBucket(fid);
  for (const u of users || []) {
    const fid = normalizeId(u.factionId).toLowerCase();
    if (!fid || !buckets[fid]) continue;
    const b = buckets[fid];
    b.voiceMembers += 1;
    b.totalVoiceMinutes += Math.max(0, safeInt(u.voiceMinutes));
    if (u.eligibleExp) b.viewers30m.push(String(u.userId));
  }
  for (const b of Object.values(buckets)) {
    const row = b as any;
    row.avgVoiceMinutes = row.voiceMembers > 0 ? Math.round(row.totalVoiceMinutes / row.voiceMembers) : 0;
  }
  return buckets;
}

/** Una sola classifica: più utenti, poi media tempo. */
function rankFactionsCombined(buckets?, factionIds = []) {
  return factionIds
    .map((factionId?) => {
      const b = buckets[factionId] || emptyBucket(factionId);
      return {
        factionId,
        voiceMembers: safeInt(b.voiceMembers),
        avgVoiceMinutes: safeInt(b.avgVoiceMinutes),
        totalVoiceMinutes: safeInt(b.totalVoiceMinutes),
        viewers30m: Array.isArray(b.viewers30m) ? b.viewers30m.slice() : [],
      };
    })
    .filter((r?) => r.voiceMembers > 0)
    .sort((a?, b?) => {
      if (b.voiceMembers !== a.voiceMembers) return b.voiceMembers - a.voiceMembers;
      return b.avgVoiceMinutes - a.avgVoiceMinutes;
    });
}

function formatCombinedRankingLines(ranked?, epoch?) {
  if (!Array.isArray(ranked) || !ranked.length) return ["—"];
  const lines = [];
  for (let i = 0; i < Math.min(2, ranked.length); i += 1) {
    const row = ranked[i];
    const label = PODIUM[i] || `${i + 1}°`;
    const credits = CREDITS_BY_RANK[i] || 0;
    const name = `**${factionDisplayName(epoch, row.factionId)}**`;
    const members = `${row.voiceMembers} ${row.voiceMembers === 1 ? "utente" : "utenti"}`;
    const avg = `media ${formatVoiceHours(row.avgVoiceMinutes)}`;
    const prize = credits ? ` · ${CREDITI} **+${credits.toLocaleString("it-IT")}** banca` : "";
    lines.push(`${label} ${name} — ${members} · ${avg}${prize}`);
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

async function collectAttendanceUsers(client?, guildId?, attendanceSnapshot?, epoch?) {
  const users = [];
  if (!(attendanceSnapshot instanceof Map) || !attendanceSnapshot.size) return users;
  const gid = normalizeId(guildId) || walletGuildId(client);
  for (const [userId, msRaw] of attendanceSnapshot.entries()) {
    const attendanceMs = Math.max(0, Number(msRaw) || 0);
    if (attendanceMs < MIN_COUNT_MS) continue;
    const factionId = await resolveUserFactionId(client, gid, userId, epoch);
    if (!factionId) continue;
    users.push({
      userId: normalizeId(userId),
      factionId,
      voiceMinutes: Math.max(1, Math.round(attendanceMs / 60_000)),
      eligibleExp: attendanceMs >= MIN_EXP_MS,
    });
  }
  return users;
}

async function awardFactionCredits(client?, ranked?, weekKey?) {
  const awarded = [];
  for (let i = 0; i < Math.min(2, ranked.length); i += 1) {
    const row = ranked[i];
    const credits = CREDITS_BY_RANK[i] || 0;
    if (!row?.factionId || credits <= 0) continue;
    const out = await addFactionBankCredits(client, row.factionId, credits, {});
    if (out?.ok) {
      awarded.push({ rank: i + 1, factionId: row.factionId, credits, weekKey: String(weekKey || "") });
    }
  }
  return awarded;
}

async function awardPersonalExp(client?, guildId?, ranked?, weekKey?) {
  const gid = normalizeId(guildId);
  const seen = new Set();
  const granted = [];
  for (let i = 0; i < Math.min(2, (ranked || []).length); i += 1) {
    const row = ranked[i];
    for (const userId of row?.viewers30m || []) {
      const uid = normalizeId(userId);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const out = await grantStarWarsReward(client, {
        guildId: gid,
        userId: uid,
        grant: { exp: PERSONAL_EXP },
        reason: `serata_film_lb_${weekKey}`.slice(0, 80),
      });
      if (out?.ok) granted.push({ userId: uid, factionId: row.factionId, exp: PERSONAL_EXP });
    }
  }
  return granted;
}

async function resolveSerataFilmFactionLeaderboard(client?, options: Record<string, any> = {}) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return { ok: false, skipped: true, reason: "starwars_disabled" };
  const now = options.now instanceof Date ? options.now : new Date();
  if (!options.forcePublish && !isStarWarsMovieNightWeek(now)) {
    return { ok: false, skipped: true, reason: "not_starwars_film_week" };
  }
  const schedule = getStarWarsMovieNightScheduleForWeek(now);
  const weekKey = String(options.weekKey || "").trim() || getRomeSaturdayKeyForWeek(now);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const epoch = resolveFeatureStateNow(now).epoch || EPOCHS.CLONE_WARS;
  const factionIds = EPOCH_FACTIONS[epoch] || EPOCH_FACTIONS[EPOCHS.CLONE_WARS];
  const mainGuildId = walletGuildId(client);
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
      return {
        ok: rankedCombined.length > 0,
        skipped: true,
        reason: "already_published",
        dedupeKey,
        weekKey,
        guild,
        epoch,
        rankedCombined,
        awardedCredits: existing?.rawWebhook?.awardedCredits || [],
        awardedExp: existing?.rawWebhook?.awardedExp || [],
        movieTitle: String(existing?.rawWebhook?.movieTitle || schedule?.title || "Serata Film"),
      };
    }
  }

  const users = await collectAttendanceUsers(client, guild.id, options.attendanceSnapshot, epoch);
  if (!users.length) {
    global.logger?.info?.("[SW SERATA FILM LB] empty attendance", weekKey);
    return { ok: false, skipped: true, reason: "empty", weekKey, guild, epoch };
  }

  const buckets = buildFactionBuckets(users, factionIds);
  const rankedCombined = rankFactionsCombined(buckets, factionIds);
  const awardedCredits = await awardFactionCredits(client, rankedCombined, weekKey);
  const awardedExp = await awardPersonalExp(client, guild.id, rankedCombined, weekKey);
  const movieTitle = String(
    options.movieTitle || options.state?.stageCloseMovieTitle || options.state?.eventStartMovieTitle || schedule?.title || "Serata Film",
  ).trim();

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
        createdBy: "starwars_serata_film_lb",
      },
      $set: {
        status: "completed",
        planKey: "starwars_serata_film_lb",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.weekKey": weekKey,
        "rawWebhook.epoch": epoch,
        "rawWebhook.movieTitle": movieTitle,
        "rawWebhook.buckets": buckets,
        "rawWebhook.rankedCombined": rankedCombined,
        "rawWebhook.awardedCredits": awardedCredits,
        "rawWebhook.awardedExp": awardedExp,
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
    guild,
    epoch,
    rankedCombined,
    awardedCredits,
    awardedExp,
    movieTitle,
  };
}

export = {
  resolveSerataFilmFactionLeaderboard,
  formatCombinedRankingLines,
  formatCreditsLabel,
  rankFactionsCombined,
  CREDITS_BY_RANK,
  PERSONAL_EXP,
};
