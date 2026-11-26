const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getUserRanks } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { guildMemberDisplayAvatarUrlForSite, memberDisplayName } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");

const RECENT_DAYS = 90;
const LEVEL_MILESTONES = [10, 20, 30, 50, 70, 100, 125, 150, 200];

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function romeParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value),
      m: Number(parts.find((p) => p.type === "month")?.value),
      d: Number(parts.find((p) => p.type === "day")?.value),
      h: Number(parts.find((p) => p.type === "hour")?.value),
    };
  } catch {
    return {
      y: now.getFullYear(),
      m: now.getMonth() + 1,
      d: now.getDate(),
      h: now.getHours(),
    };
  }
}

/**
 * Anno Wrapped (Europe/Rome).
 * In gennaio (finestra 1–7 gen) resta l’anno appena concluso.
 */
function wrappedYear(date = new Date()) {
  const { y, m } = romeParts(date);
  const year = y || Number(String(romeDayKey(date)).slice(0, 4)) || date.getFullYear();
  if (m === 1) return year - 1;
  return year;
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

function summarizeRecentDaily(daily?, fromKey?, toKey?) {
  const bag = daily && typeof daily === "object" ? daily : {};
  const from = fromKey && /^\d{4}-\d{2}-\d{2}$/.test(String(fromKey)) ? String(fromKey) : null;
  const to = toKey && /^\d{4}-\d{2}-\d{2}$/.test(String(toKey)) ? String(toKey) : null;
  let messages = 0;
  let voiceSeconds = 0;
  let activeDays = 0;
  const textChannels: Record<string, any> = {};
  const voiceChannels: Record<string, any> = {};
  let peak = null;
  for (const [dateKey, row] of Object.entries(bag)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (from && dateKey < from) continue;
    if (to && dateKey > to) continue;
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

function summarizeHourlyOwl(hourly?, fromDayKey = null, toDayKey = null) {
  const bag = hourly && typeof hourly === "object" ? hourly : {};
  const byHour = Array.from({ length: 24 }, () => 0);
  let nightMessages = 0;
  const from = fromDayKey && /^\d{4}-\d{2}-\d{2}$/.test(String(fromDayKey)) ? String(fromDayKey) : null;
  const to = toDayKey && /^\d{4}-\d{2}-\d{2}$/.test(String(toDayKey)) ? String(toDayKey) : null;
  for (const [hourKey, row] of Object.entries(bag)) {
    const m = String(hourKey || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2})$/);
    if (!m) continue;
    const dayKey = m[1];
    if (from && dayKey < from) continue;
    if (to && dayKey > to) continue;
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

/**
 * Voti dell'anno: somma dei mesi di quell'anno.
 * Fonte: lo storico per mese (voteMonths); per il mese corrente e il precedente vale anche il contatore
 * mensile (prende il più alto: lo storico è nato dopo, il mese in corso può avere voti contati solo lì).
 */
function sumYearVotesFromLeaf(leaf?, year?) {
  const prefix = `${Math.floor(Number(year) || wrappedYear())}-`;
  const months: Record<string, number> = {};
  const raw = leaf?.voteMonths && typeof leaf.voteMonths === "object" ? leaf.voteMonths : {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^\d{4}-\d{2}$/.test(k) && k.startsWith(prefix)) months[k] = nInt(v);
  }
  const counter = (key?, n?) => {
    const k = String(key || "");
    if (!k.startsWith(prefix)) return;
    months[k] = Math.max(nInt(months[k]), nInt(n));
  };
  counter(leaf?.voteCountMonthKey, nInt(leaf?.voteCountTopgg) + nInt(leaf?.voteCountDiscadia) + nInt(leaf?.voteCount));
  counter(leaf?.prevVoteCountMonthKey, nInt(leaf?.prevVoteCountTopgg) + nInt(leaf?.prevVoteCountDiscadia));
  return Object.values(months).reduce((a, b) => a + b, 0);
}

/** Voti di un solo mese ("YYYY-MM"). */
function sumMonthVotesFromLeaf(leaf?, monthKey?) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) return 0;
  const raw = leaf?.voteMonths && typeof leaf.voteMonths === "object" ? leaf.voteMonths : {};
  let n = nInt(raw[mk]);
  if (String(leaf?.voteCountMonthKey || "") === mk) {
    n = Math.max(n, nInt(leaf?.voteCountTopgg) + nInt(leaf?.voteCountDiscadia) + nInt(leaf?.voteCount));
  }
  if (String(leaf?.prevVoteCountMonthKey || "") === mk) {
    n = Math.max(n, nInt(leaf?.prevVoteCountTopgg) + nInt(leaf?.prevVoteCountDiscadia));
  }
  return n;
}

/** Mese calendario precedente (Europe/Rome) → "YYYY-MM". */
function previousMonthKey(date = new Date()) {
  const { y, m } = romeParts(date);
  if (!y || !m) return "";
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function monthStartDayKey(monthKey?) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) return "";
  return `${mk}-01`;
}

function monthEndDayKey(monthKey?) {
  const mk = String(monthKey || "").trim();
  const m = mk.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  /* Date.UTC(y, mo, 0) con mo 1-based = ultimo giorno del mese */
  return romeDayKey(new Date(Date.UTC(y, mo, 0, 12, 0, 0)));
}

function formatMonthLabel(monthKey?) {
  const mk = String(monthKey || "").trim();
  const m = mk.match(/^(\d{4})-(\d{2})$/);
  if (!m) return mk;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  try {
    const raw = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(y, mo - 1, 15, 12, 0, 0)));
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return mk;
  }
}

/**
 * Il mensile non ha una stagione pubblica propria: si apre solo con l’annuale
 * (dal 10 dic). Fuori stagione → High Staff (preview).
 */
function isWrappedMonthlySeasonRome(now = new Date()) {
  return isWrappedSeasonRome(now);
}

function daysInMonthKey(monthKey?) {
  const from = monthStartDayKey(monthKey);
  const to = monthEndDayKey(monthKey);
  if (!from || !to) return 1;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
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

/** Finestra pubblica Wrapped annuale (Rome): 10 dic 12:00 → 7 gen 12:00. */
function isWrappedSeasonRome(now = new Date()) {
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 12 && (d > 10 || (d === 10 && h >= 12))) return true;
  if (m === 1 && (d < 7 || (d === 7 && h < 12))) return true;
  return false;
}

function isWrappedPublicEnabled(now = new Date()) {
  const env = String(process.env.WEBSITE_WRAPPED_HTTP || "").trim().toLowerCase();
  if (env === "0" || env === "false" || env === "off" || env === "no") return false;
  if (env === "1" || env === "true" || env === "yes" || env === "on") return true;
  /* Solo stagione annuale (10 dic 12:00 → 7 gen 12:00). Mensile = periodo, non unlock anticipato. */
  return isWrappedSeasonRome(now);
}

/**
 * period=yearly|monthly|auto, month=YYYY-MM.
 * Default sempre yearly (come prima del mensile). Monthly solo se chiesto esplicitamente.
 */
function resolveWrappedPeriodRequest(payload?, now = new Date()) {
  const rawPeriod = String(payload?.period || "").trim().toLowerCase();
  const rawMonth = String(payload?.month || "").trim();
  const prev = previousMonthKey(now);
  const wantMonth = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : "";

  if (rawPeriod === "monthly" || wantMonth) {
    const monthKey = wantMonth || prev;
    return {
      kind: "monthly",
      monthKey,
      year: Number(monthKey.slice(0, 4)) || wrappedYear(now),
      from: monthStartDayKey(monthKey),
      to: monthEndDayKey(monthKey),
      periodLabel: formatMonthLabel(monthKey),
    };
  }

  const year = wrappedYear(now);
  return {
    kind: "yearly",
    monthKey: null,
    year,
    from: yearStartDayKey(year),
    to: romeDayKey(now),
    periodLabel: String(year),
  };
}

function memberIsWrappedPreviewStaff(member?) {
  try {
    const { memberIsHighStaffEligible } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
    return Boolean(memberIsHighStaffEligible(member));
  } catch {
    return false;
  }
}

/** Pubblico in stagione; fuori stagione solo High Staff. Force: WEBSITE_WRAPPED_HTTP=1. */
function assertWrappedAccess(resolved?) {
  if (isWrappedPublicEnabled()) return null;
  if (memberIsWrappedPreviewStaff(resolved?.member)) return null;
  return {
    ok: false,
    status: 503,
    error: "wrapped_disabled",
    message: "Vinili Wrapped non è aperto in questo periodo.",
  };
}

function wrappedViewerRoleId() {
  return String(IDs.roles?.WrappedViewer || "1572319349501595728").trim();
}

/**
 * Fine slideshow Wrapped.
 * - yearly → ruolo commemorativo (una volta per anno).
 * - monthly → solo flag completedAt sul mese (niente ruolo).
 */
async function completeSiteWrapped(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const denied = assertWrappedAccess(resolved);
  if (denied) return denied;

  const guildId = resolveGuildId(client);
  const userId = String(resolved.userId || "").trim();
  const roleId = wrappedViewerRoleId();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild/user non risolti." };
  }

  const period = resolveWrappedPeriodRequest(payload);
  const nowIso = new Date().toISOString();

  /* Mensile: traccia completamento, nessun ruolo Discord. */
  if (period.kind === "monthly") {
    const mk = String(period.monthKey || previousMonthKey());
    const completedPath = `profile.events.wrapped.monthly.${mk}.completedAt`;
    await ActivityUserProfile.findOneAndUpdate(
      { guildId, userId },
      {
        $set: {
          [completedPath]: nowIso,
          "profile.events.wrapped.updatedAt": nowIso,
        },
        $setOnInsert: { guildId, userId },
      },
      { upsert: true },
    ).catch(() => null);
    return {
      ok: true,
      status: 200,
      period: "monthly",
      monthKey: mk,
      year: period.year,
      roleId: null,
      roleGranted: false,
      already: false,
    };
  }

  if (!roleId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Ruolo Wrapped non risolto." };
  }

  const year = period.year || wrappedYear();
  const completedPath = `profile.events.wrapped.${year}.completedAt`;
  const rolePath = `profile.events.wrapped.${year}.roleGranted`;

  const existing = await ActivityUserProfile.findOne({ guildId, userId })
    .select(`profile.events.wrapped.${year}`)
    .lean()
    .catch(() => null);
  const already =
    Boolean(existing?.profile?.events?.wrapped?.[String(year)]?.roleGranted) ||
    Boolean(existing?.profile?.events?.wrapped?.[year]?.roleGranted);

  let roleGranted = already;
  if (!already) {
    const guild =
      client?.guilds?.cache?.get(guildId) ||
      (await client?.guilds?.fetch?.(guildId).catch(() => null));
    const member =
      guild?.members?.cache?.get(userId) ||
      (await guild?.members?.fetch?.(userId).catch(() => null));
    if (member?.roles) {
      if (member.roles.cache.has(roleId)) {
        roleGranted = true;
      } else {
        roleGranted = await member.roles
          .add(roleId, `Vinili Wrapped ${year} completato`)
          .then(() => true)
          .catch(() => false);
      }
    }
  }

  await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $set: {
        [completedPath]: nowIso,
        [rolePath]: Boolean(roleGranted),
        "profile.events.wrapped.updatedAt": nowIso,
      },
      $setOnInsert: { guildId, userId },
    },
    { upsert: true },
  ).catch(() => null);

  return {
    ok: true,
    status: 200,
    period: "yearly",
    year,
    roleId,
    roleGranted: Boolean(roleGranted),
    already: Boolean(already),
  };
}

async function getSiteWrapped(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const denied = assertWrappedAccess(resolved);
  if (denied) return denied;

  const guildId = resolveGuildId(client);
  const userId = String(resolved.userId || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild/user non risolti." };
  }

  const member = resolved.member;
  const [docRaw, ranks, pool] = await Promise.all([
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

  /* compact: nested daily/hourly vuoti → idrata da ActivityGuildHourly */
  let doc = docRaw;
  try {
    const { hydrateProfileActivityBucketsFromGuild } = require("../../Community/services/activityBackfill") as typeof import("../../Community/services/activityBackfill");
    doc = await hydrateProfileActivityBucketsFromGuild(guildId, userId, docRaw);
  } catch (_) {
    doc = docRaw;
  }

  const totals = doc?.profile?.totals || {};
  const exp = totals.exp || {};
  const minigame = exp.minigame || {};
  const period = resolveWrappedPeriodRequest(payload);
  const isMonthly = period.kind === "monthly";
  const year = period.year;
  const windowFrom = period.from;
  const windowTo = period.to;

  /* Pubblico: mensile solo mese precedente. High staff può chiedere altri mesi. */
  if (isMonthly) {
    const prev = previousMonthKey();
    if (period.monthKey !== prev && !memberIsWrappedPreviewStaff(member)) {
      return {
        ok: false,
        status: 400,
        error: "month_not_available",
        message: "Il Wrapped mensile pubblico è solo quello del mese precedente.",
      };
    }
  }

  /* Activity Wrapped = finestra periodo (YTD oppure mese) dai daily/hourly. */
  const windowStats = summarizeRecentDaily(totals.daily, windowFrom, windowTo);
  const messagesLifetime = nInt(totals.messagesTotal);
  const voiceLifetime = nInt(totals.voiceTotalSeconds);
  const messagesTotal =
    windowStats.messages > 0 ? windowStats.messages : isMonthly ? 0 : messagesLifetime;
  const messagesWeekly = nInt(totals.messagesWeekly);
  const voiceTotalSeconds =
    windowStats.voiceSeconds > 0 ? windowStats.voiceSeconds : isMonthly ? 0 : voiceLifetime;
  const voiceWeeklySeconds = nInt(totals.voiceWeeklySeconds);
  const privateVoiceSeconds = nInt(doc?.profile?.stanzaVoiceTotalSeconds);
  const disconnects = nInt(totals.voiceDisconnectCount);
  const minigameTotalExp = nInt(minigame.totalExp);
  const bestStreak = nInt(minigame.bestStreak);
  const currentStreak = nInt(minigame.currentStreak);

  const cutoffKey = isMonthly
    ? windowFrom
    : addDaysToKey(romeDayKey(), -(RECENT_DAYS - 1));
  const recentTo = isMonthly ? windowTo : romeDayKey();
  const recent = isMonthly
    ? windowStats
    : summarizeRecentDaily(totals.daily, cutoffKey, recentTo);
  const hourSummary = summarizeHourlyOwl(totals.hourly, windowFrom, windowTo);
  const owl = hourSummary.owl;
  const nightMessages = nInt(hourSummary.nightMessages);
  const guild = client?.guilds?.cache?.get?.(guildId) || null;
  const channelBag = windowStats.messages > 0 || windowStats.voiceSeconds > 0 ? windowStats : recent;
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
    labelTopChannels(guild, topFromMap(channelBag.textChannels, 3), "count"),
    labelTopChannels(guild, topFromMap(channelBag.voiceChannels, 3), "seconds"),
  ]);

  const voteLeaf = exp?.bumpVoteRewards?.discadia_vote || {};
  const votesTotal = isMonthly
    ? sumMonthVotesFromLeaf(voteLeaf, period.monthKey)
    : sumYearVotesFromLeaf(voteLeaf, year);
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

  const stats: any = ranks?.stats || {};
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
  const periodMemberDays = isMonthly
    ? Math.max(1, windowStats.activeDays || daysInMonthKey(period.monthKey))
    : Math.max(
        1,
        Math.min(
          yearElapsedDays,
          joinedMs > 0
            ? Math.floor((Date.now() - Math.max(joinedMs, yearStartMsRome(year))) / 86400000) + 1
            : yearElapsedDays,
        ),
      );
  const avgMessagesPerDay =
    messagesTotal > 0 ? Math.round((messagesTotal / periodMemberDays) * 10) / 10 : null;
  const avgVoiceHoursPerWeek =
    voiceTotalSeconds > 0
      ? Math.round((voiceTotalSeconds / 3600 / (periodMemberDays / 7)) * 10) / 10
      : null;
  const coffeeCups = Math.max(0, Math.round(voiceTotalSeconds / 3600));
  const milestonesHit = LEVEL_MILESTONES.filter((m?) => level >= m);
  const nextMilestone = LEVEL_MILESTONES.find((m?) => m > level) || null;
  const balance = balanceSplit(messagesTotal, voiceTotalSeconds);

  const liveAvatar =
    guildMemberDisplayAvatarUrlForSite(member, { size: 512, preferAnimated: true }) || "";
  const avatarUrl = animatedDiscordCdnAvatarUrl(liveAvatar, { size: 512 }) || liveAvatar || null;

  const recentDays = isMonthly ? daysInMonthKey(period.monthKey) : RECENT_DAYS;

  return {
    ok: true,
    status: 200,
    period: isMonthly ? "monthly" : "yearly",
    monthKey: isMonthly ? period.monthKey : null,
    periodLabel: period.periodLabel,
    year,
    from: windowFrom,
    to: windowTo,
    generatedAt: new Date().toISOString(),
    recentDays,
    available: {
      /* Entrambi i periodi solo in stagione pubblica (o preview HS). */
      yearly: isWrappedSeasonRome() || memberIsWrappedPreviewStaff(member),
      monthly: isWrappedSeasonRome() || memberIsWrappedPreviewStaff(member),
      previousMonthKey: previousMonthKey(),
    },
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
      days: recentDays,
      from: cutoffKey,
      to: recentTo,
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

export = {
  getSiteWrapped,
  completeSiteWrapped,
  isWrappedSeasonRome,
  isWrappedMonthlySeasonRome,
  isWrappedPublicEnabled,
  previousMonthKey,
  resolveWrappedPeriodRequest,
};
