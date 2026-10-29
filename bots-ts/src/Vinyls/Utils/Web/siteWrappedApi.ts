const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getUserRanks } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const { guildMemberDisplayAvatarUrlForSite, memberDisplayName } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");

const RECENT_DAYS = 90;
const LEVEL_MILESTONES = [10, 20, 30, 50, 70, 100, 125, 150, 200];

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

/** Anno Wrapped (Europe/Rome): 1° gennaio → oggi. */
function wrappedYear(date = new Date()) {
  return Number(String(romeDayKey(date)).slice(0, 4)) || date.getFullYear();
}

function yearStartDayKey(year?) {
  const y = Math.max(1970, Math.floor(Number(year) || wrappedYear()));
  return `${y}-01-01`;
}

/** Approx CET/CEST: 1 gen è sempre UTC+1 a Roma. */
function yearStartMsRome(year?) {
  return Date.parse(`${yearStartDayKey(year)}T00:00:00+01:00`);
}

function nInt(v?) {
  const n = Math.floor(Number(v) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function romeDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, any> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysToKey(dateKey?, delta?) {
  const [y, m, d] = String(dateKey || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return romeDayKey();
  return romeDayKey(new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0)));
}

function formatDayLabel(dateKey?) {
  const [y, m, d] = String(dateKey || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return dateKey;
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  } catch {
    return dateKey;
  }
}

async function resolveChannelName(guild?, channelId?) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  /* Solo cache: niente fetch Discord sul hot path Wrapped. */
  const ch = guild?.channels?.cache?.get?.(id) || null;
  const name = String(ch?.name || "").trim();
  return name || null;
}

async function labelTopChannels(guild?, rows?, valueKey?) {
  const list = Array.isArray(rows) ? rows : [];
  return Promise.all(
    list.map(async (r?) => {
      const name = await resolveChannelName(guild, r.id);
      return {
        id: r.id,
        name: name ? `#${name}` : null,
        resolved: Boolean(name),
        [valueKey]: r.value,
      };
    }),
  );
}

function topFromMap(mapLike?, limit = 3) {
  const obj =
    mapLike && typeof mapLike === "object"
      ? mapLike instanceof Map
        ? Object.fromEntries(mapLike)
        : mapLike
      : {};
  return Object.entries(obj)
    .map(([id, raw]) => ({ id: String(id), value: nInt(raw) }))
    .filter((r?) => r.value > 0)
    .sort((a?, b?) => b.value - a.value)
    .slice(0, limit);
}

function summarizeRecentDaily(daily?, cutoffKey?) {
  const bag = daily && typeof daily === "object" ? daily : {};
  let messages = 0;
  let voiceSeconds = 0;
  let activeDays = 0;
  const textChannels: Record<string, any> = {};
  const voiceChannels: Record<string, any> = {};
  let peak = null;
  for (const [dateKey, row] of Object.entries(bag)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < cutoffKey) continue;
    const text = nInt(row?.textCount);
    const voice = nInt(row?.voiceSeconds);
    if (text <= 0 && voice <= 0) continue;
    activeDays += 1;
    messages += text;
    voiceSeconds += voice;
    const score = text + Math.floor(voice / 60);
    if (!peak || score > peak.score) {
      peak = { dateKey, messages: text, voiceSeconds: voice, score };
    }
    const tc = row?.textChannels && typeof row.textChannels === "object" ? row.textChannels : {};
    const vc = row?.voiceChannels && typeof row.voiceChannels === "object" ? row.voiceChannels : {};
    for (const [cid, n] of Object.entries(tc)) textChannels[cid] = nInt(textChannels[cid]) + nInt(n);
    for (const [cid, n] of Object.entries(vc)) voiceChannels[cid] = nInt(voiceChannels[cid]) + nInt(n);
  }
  return { messages, voiceSeconds, activeDays, textChannels, voiceChannels, peak };
}

function summarizeHourlyOwl(hourly?, cutoffDayKey = null) {
  const bag = hourly && typeof hourly === "object" ? hourly : {};
  const byHour = Array.from({ length: 24 }, () => 0);
  let nightMessages = 0;
  const cutoff = cutoffDayKey && /^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDayKey)) ? String(cutoffDayKey) : null;
  for (const [hourKey, row] of Object.entries(bag)) {
    const m = String(hourKey || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2})$/);
    if (!m) continue;
    const dayKey = m[1];
    if (cutoff && dayKey < cutoff) continue;
    const h = Number(m[2]);
    if (!Number.isFinite(h) || h < 0 || h > 23) continue;
    const text = nInt(row?.textCount);
    byHour[h] += text + Math.floor(nInt(row?.voiceSeconds) / 60);
    /* notte fonda: 22:00–04:59 (ore 22,23,0,1,2,3,4) */
    if (h >= 22 || h <= 4) nightMessages += text;
  }
  let bestHour = 0;
  let bestVal = -1;
  for (let h = 0; h < 24; h += 1) {
    if (byHour[h] > bestVal) {
      bestVal = byHour[h];
      bestHour = h;
    }
  }
  if (bestVal <= 0) {
    return { owl: null, nightMessages };
  }
  let vibe = "pomeriggio";
  if (bestHour >= 5 && bestHour < 12) vibe = "mattina";
  else if (bestHour >= 12 && bestHour < 18) vibe = "pomeriggio";
  else if (bestHour >= 18 && bestHour < 22) vibe = "sera";
  else vibe = "notte";
  return {
    owl: {
      hour: bestHour,
      label: `${String(bestHour).padStart(2, "0")}:00`,
      vibe,
      score: bestVal,
    },
    nightMessages,
  };
}

function sumVotesFromLeaf(leaf?) {
  const cur =
    nInt(leaf?.voteCountTopgg) + nInt(leaf?.voteCountDiscadia) + nInt(leaf?.voteCount);
  const prev = nInt(leaf?.prevVoteCountTopgg) + nInt(leaf?.prevVoteCountDiscadia);
  return cur + prev;
}

/**
 * Boost count senza scan history Discord (era fino a 25 round-trip → Wrapped lentissimo).
 * Usa il counter persistito + premiumSince del member.
 */
function resolveYearBoostCount(member?, year?, storedSlotCount?) {
  const y = Math.max(1970, Math.floor(Number(year) || wrappedYear()));
  const sinceMs = yearStartMsRome(y);
  const fromStored = Math.max(0, Math.min(50, nInt(storedSlotCount)));
  const premiumTs = Number(member?.premiumSinceTimestamp || member?.premiumSince?.getTime?.() || 0);
  const isBoosting = premiumTs > 0 || Boolean(member?.premiumSince);
  const startedThisYear = premiumTs > 0 && premiumTs >= sinceMs;
  const boosts = Math.max(fromStored, startedThisYear ? 1 : 0);
  return { boosts, isBoosting, fromChannel: fromStored, startedThisYear };
}

const POOL_CACHE_TTL_MS = 10 * 60 * 1000;
let poolCache = { guildId: "", at: 0, value: 0 };

function pickArchetype({ messagesTotal, voiceSeconds, minigameExp, owlVibe }) {
  const msgScore = messagesTotal / 50;
  const voiceScore = voiceSeconds / 3600;
  const gameScore = minigameExp / 20;
  const max = Math.max(msgScore, voiceScore, gameScore);
  if (max <= 0) {
    return {
      id: "newcomer",
      label: "Vinile ancora da girare",
      blurb: "La community ti aspetta: chat, call e minigiochi.",
      palette: "amber",
    };
  }
  if (owlVibe === "notte" && voiceScore > msgScore * 0.4) {
    return {
      id: "night",
      label: "Creatura della notte",
      blurb: "Quando il server si spegne, tu stai ancora in call.",
      palette: "indigo",
    };
  }
  if (msgScore === max) {
    return {
      id: "chat",
      label: "Testa da bancone",
      blurb: "Messaggi a raffica: sei il rumore di fondo del server.",
      palette: "caramel",
    };
  }
  if (voiceScore === max) {
    return {
      id: "voice",
      label: "Anima da booth",
      blurb: "Ore in call: se c’è un microfono acceso, spesso sei tu.",
      palette: "ember",
    };
  }
  return {
    id: "games",
    label: "High score forever",
    blurb: "I minigiochi ti conoscono per nome. E per streak.",
    palette: "lime",
  };
}

function percentileBetter(rank?, pool?) {
  const r = Math.max(1, nInt(rank) || 1);
  const p = Math.max(1, nInt(pool) || 1);
  return Math.max(0, Math.min(99, Math.round((1 - r / p) * 100)));
}

function balanceSplit(messagesTotal?, voiceSeconds?) {
  const msgScore = messagesTotal;
  const voiceScore = Math.floor(voiceSeconds / 30);
  const sum = msgScore + voiceScore;
  if (sum <= 0) return { messagesPct: 50, voicePct: 50 };
  const messagesPct = Math.round((msgScore / sum) * 100);
  return { messagesPct, voicePct: 100 - messagesPct };
}

async function countActivePool(guildId?) {
  const gid = String(guildId || "");
  const now = Date.now();
  if (poolCache.guildId === gid && now - poolCache.at < POOL_CACHE_TTL_MS) {
    return poolCache.value;
  }
  const value = await ActivityUserProfile.countDocuments({
    guildId: gid,
    $or: [
      { "profile.totals.messagesTotal": { $gt: 0 } },
      { "profile.totals.voiceTotalSeconds": { $gt: 0 } },
      { "profile.totals.exp.totalExp": { $gt: 0 } },
    ],
  }).catch(() => 0);
  poolCache = { guildId: gid, at: now, value };
  return value;
}

function isWrappedPublicEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_WRAPPED_HTTP || "").trim().toLowerCase());
}

async function getSiteWrapped(client?, payload?) {
  if (!isWrappedPublicEnabled()) {
    return {
      ok: false,
      status: 503,
      error: "wrapped_disabled",
      message: "Vinili Wrapped non è ancora pubblico.",
    };
  }
  const accessToken = String(payload?.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const guildId = resolveGuildId(client);
  const userId = String(resolved.userId || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild/user non risolti." };
  }

  const member = resolved.member;
  const [doc, ranks, pool] = await Promise.all([
    ActivityUserProfile.findOne({ guildId, userId })
      .select(
        [
          "profile.totals.messagesTotal",
          "profile.totals.messagesWeekly",
          "profile.totals.voiceTotalSeconds",
          "profile.totals.voiceWeeklySeconds",
          "profile.totals.voiceDisconnectCount",
          "profile.totals.exp",
          "profile.totals.daily",
          "profile.totals.hourly",
          "profile.totals.gifsTotal",
          "profile.totals.imagesTotal",
          "profile.totals.mentionsMade",
          "profile.totals.mentionsReceived",
          "profile.totals.rolePings",
          "profile.totals.commandsTotal",
          "profile.totals.emojiUses",
          "profile.stanzaVoiceTotalSeconds",
          "profile.serverBoostAnnouncedSlotCount",
        ].join(" "),
      )
      .lean()
      .catch(() => null),
    getUserRanks(guildId, userId),
    countActivePool(guildId),
  ]);

  const totals = doc?.profile?.totals || {};
  const exp = totals.exp || {};
  const minigame = exp.minigame || {};
  const year = wrappedYear();
  const yearFromKey = yearStartDayKey(year);
  /* Activity Wrapped = YTD (1° gen → oggi) dai daily/hourly disponibili. */
  const ytd = summarizeRecentDaily(totals.daily, yearFromKey);
  const messagesLifetime = nInt(totals.messagesTotal);
  const voiceLifetime = nInt(totals.voiceTotalSeconds);
  const messagesTotal = ytd.messages > 0 ? ytd.messages : messagesLifetime;
  const messagesWeekly = nInt(totals.messagesWeekly);
  const voiceTotalSeconds = ytd.voiceSeconds > 0 ? ytd.voiceSeconds : voiceLifetime;
  const voiceWeeklySeconds = nInt(totals.voiceWeeklySeconds);
  const privateVoiceSeconds = nInt(doc?.profile?.stanzaVoiceTotalSeconds);
  const disconnects = nInt(totals.voiceDisconnectCount);
  const minigameTotalExp = nInt(minigame.totalExp);
  const bestStreak = nInt(minigame.bestStreak);
  const currentStreak = nInt(minigame.currentStreak);

  const cutoffKey = addDaysToKey(romeDayKey(), -(RECENT_DAYS - 1));
  const recent = summarizeRecentDaily(totals.daily, cutoffKey);
  const hourSummary = summarizeHourlyOwl(totals.hourly, yearFromKey);
  const owl = hourSummary.owl;
  const nightMessages = nInt(hourSummary.nightMessages);
  const guild = client?.guilds?.cache?.get?.(guildId) || null;
  const ytdChannels = ytd.messages > 0 || ytd.voiceSeconds > 0 ? ytd : recent;
  const [messagesHigher, voiceHigher, minigameHigher, topText, topVoice] = await Promise.all([
    ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.messagesTotal": { $gt: messagesLifetime },
    }).catch(() => 0),
    ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.voiceTotalSeconds": { $gt: voiceLifetime },
    }).catch(() => 0),
    ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.minigame.totalExp": { $gt: minigameTotalExp },
    }).catch(() => 0),
    labelTopChannels(guild, topFromMap(ytdChannels.textChannels, 3), "count"),
    labelTopChannels(guild, topFromMap(ytdChannels.voiceChannels, 3), "seconds"),
  ]);

  const voteLeaf = exp?.bumpVoteRewards?.discadia_vote || {};
  const votesTotal = sumVotesFromLeaf(voteLeaf);
  const boostYear = resolveYearBoostCount(member, year, doc?.profile?.serverBoostAnnouncedSlotCount);
  const boosts = nInt(boostYear.boosts);
  const isBoosting = Boolean(boostYear.isBoosting);

  const emojiUses = totals.emojiUses && typeof totals.emojiUses === "object" ? totals.emojiUses : {};
  const topEmoji = Object.entries(emojiUses)
    .map(([key, raw]) => {
      const [emojiName] = String(key).split(":");
      return { key, name: emojiName || key, count: nInt(raw) };
    })
    .filter((e?) => e.count > 0)
    .sort((a?, b?) => b.count - a.count)[0] || null;

  const stats = ranks?.stats || {};
  const level = nInt(stats.level);
  const totalExp = nInt(stats.totalExp);
  const weeklyExp = nInt(stats.weeklyExp);
  const allTimeRank = Math.max(1, nInt(ranks?.allTimeRank) || 1);
  const weeklyRank = Math.max(1, nInt(ranks?.weeklyRank) || 1);
  const messagesRank = messagesTotal > 0 ? messagesHigher + 1 : null;
  const voiceRank = voiceTotalSeconds > 0 ? voiceHigher + 1 : null;
  const minigameRank = minigameTotalExp > 0 ? minigameHigher + 1 : null;
  const activePool = Math.max(pool, allTimeRank);
  const archetype = pickArchetype({
    messagesTotal,
    voiceSeconds: voiceTotalSeconds,
    minigameExp: minigameTotalExp,
    owlVibe: owl?.vibe,
  });

  const joinedAt = member?.joinedAt ? new Date(member.joinedAt).toISOString() : null;
  const daysInServer = joinedAt
    ? Math.max(1, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000))
    : null;
  const yearElapsedDays = Math.max(
    1,
    Math.floor((Date.now() - yearStartMsRome(year)) / 86400000) + 1,
  );
  const joinedMs = joinedAt ? new Date(joinedAt).getTime() : 0;
  const ytdMemberDays = Math.max(
    1,
    Math.min(
      yearElapsedDays,
      joinedMs > 0 ? Math.floor((Date.now() - Math.max(joinedMs, yearStartMsRome(year))) / 86400000) + 1 : yearElapsedDays,
    ),
  );
  const avgMessagesPerDay =
    messagesTotal > 0 ? Math.round((messagesTotal / ytdMemberDays) * 10) / 10 : null;
  const avgVoiceHoursPerWeek =
    voiceTotalSeconds > 0
      ? Math.round((voiceTotalSeconds / 3600 / (ytdMemberDays / 7)) * 10) / 10
      : null;
  const coffeeCups = Math.max(0, Math.round(voiceTotalSeconds / 3600));
  const milestonesHit = LEVEL_MILESTONES.filter((m?) => level >= m);
  const nextMilestone = LEVEL_MILESTONES.find((m?) => m > level) || null;
  const balance = balanceSplit(messagesTotal, voiceTotalSeconds);

  const liveAvatar =
    guildMemberDisplayAvatarUrlForSite(member, { size: 512, preferAnimated: true }) || "";
  const avatarUrl = animatedDiscordCdnAvatarUrl(liveAvatar, { size: 512 }) || liveAvatar || null;

  return {
    ok: true,
    status: 200,
    year,
    from: yearFromKey,
    to: romeDayKey(),
    generatedAt: new Date().toISOString(),
    recentDays: RECENT_DAYS,
    user: {
      id: userId,
      username: String(member?.user?.username || "").trim(),
      displayName: memberDisplayName(member, member?.user),
      avatarUrl,
      joinedAt,
      daysInServer,
    },
    archetype,
    allTime: {
      level,
      totalExp,
      weeklyExp,
      allTimeRank,
      weeklyRank,
      pool: activePool,
      betterThanPct: percentileBetter(allTimeRank, activePool),
      messagesBetterThanPct: messagesRank ? percentileBetter(messagesRank, activePool) : 0,
      voiceBetterThanPct: voiceRank ? percentileBetter(voiceRank, activePool) : 0,
      minigameBetterThanPct: minigameRank ? percentileBetter(minigameRank, activePool) : 0,
      progressPercent: Math.max(0, Math.min(100, Number(stats.progressPercent) || 0)),
      messagesTotal,
      messagesWeekly,
      messagesRank,
      voiceTotalSeconds,
      voiceWeeklySeconds,
      voiceRank,
      privateVoiceSeconds,
      disconnects,
      minigameTotalExp,
      minigameRank,
      bestStreak,
      currentStreak,
      avgMessagesPerDay,
      avgVoiceHoursPerWeek,
      coffeeCups,
      milestonesHit,
      nextMilestone,
      balance,
      votesTotal,
      boosts,
      isBoosting,
      nightMessages,
      gifsTotal: nInt(totals.gifsTotal),
      imagesTotal: nInt(totals.imagesTotal),
      mentionsMade: nInt(totals.mentionsMade),
      mentionsReceived: nInt(totals.mentionsReceived),
      rolePings: nInt(totals.rolePings),
      commandsTotal: nInt(totals.commandsTotal),
      topEmoji,
    },
    recent: {
      days: RECENT_DAYS,
      from: cutoffKey,
      to: romeDayKey(),
      activeDays: recent.activeDays,
      messages: recent.messages,
      voiceSeconds: recent.voiceSeconds,
      avgMessagesPerActiveDay:
        recent.activeDays > 0 ? Math.round((recent.messages / recent.activeDays) * 10) / 10 : 0,
      peakDay: recent.peak
        ? {
            dateKey: recent.peak.dateKey,
            label: formatDayLabel(recent.peak.dateKey),
            messages: recent.peak.messages,
            voiceSeconds: recent.peak.voiceSeconds,
          }
        : null,
      owl,
      nightMessages,
      topTextChannels: topText,
      topVoiceChannels: topVoice,
    },
  };
}

export = { getSiteWrapped };
