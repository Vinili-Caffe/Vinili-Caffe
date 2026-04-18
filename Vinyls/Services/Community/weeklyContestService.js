const cron = require("node-cron");
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ThreadAutoArchiveDuration } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { loadHourlyRows } = require("./activityService");
const { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, sumExpDeltaFromLevelHistoryForRomeDay } = require("./expService");
const { WeeklyContestBundle, WeeklyContestMeta } = require("../../Schemas/Community/weeklyContestSchemas");
const { getClientChannelCached, getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const TIME_ZONE = "Europe/Rome";
const MAIN_GUILD_ID = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();

function parseEnvFlag(raw, defaultWhenEmpty = false) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultWhenEmpty;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** `sfondi` (default) = due canali mobile/pc. `disegni` = un solo canale submission (categoria `mobile` in DB). */
const ACTIVE_CONTEST_PROFILE = String(process.env.WEEKLY_CONTEST_ACTIVE_PROFILE || "sfondi").trim().toLowerCase();
const IS_DISEGNI_CONTEST = ACTIVE_CONTEST_PROFILE === "disegni";

const SFONDI_EVENT_KEY_PRODUCTION = String(process.env.WEEKLY_CONTEST_SFONDI_EVENT_KEY || "sfondi-2026-04-13").trim();
const DISEGNI_EVENT_KEY_PRODUCTION = String(process.env.WEEKLY_CONTEST_DISEGNI_EVENT_KEY || "disegni-2026-04-20").trim();
const EVENT_KEY_PRODUCTION = IS_DISEGNI_CONTEST ? DISEGNI_EVENT_KEY_PRODUCTION : SFONDI_EVENT_KEY_PRODUCTION;
const CONTEST_TEST_MODE = parseEnvFlag(process.env.WEEKLY_CONTEST_SFONDI_TEST_MODE, false);
const EVENT_KEY_TEST = String(process.env.WEEKLY_CONTEST_SFONDI_TEST_EVENT_KEY || "sfondi-sandbox").trim();
const EVENT_KEY = CONTEST_TEST_MODE ? EVENT_KEY_TEST : EVENT_KEY_PRODUCTION;
const CONTEST_TEST_IGNORE_TIME_WINDOW =
  CONTEST_TEST_MODE && parseEnvFlag(process.env.WEEKLY_CONTEST_SFONDI_TEST_IGNORE_TIME_WINDOW, true);

const SFONDI_FIRST_DAY = String(process.env.WEEKLY_CONTEST_SFONDI_FIRST_DAY || "2026-04-13").trim();
const SFONDI_LAST_DAY = String(process.env.WEEKLY_CONTEST_SFONDI_LAST_DAY || "2026-04-19").trim();
const DISEGNI_FIRST_DAY = String(process.env.WEEKLY_CONTEST_DISEGNI_FIRST_DAY || "2026-04-20").trim();
const DISEGNI_LAST_DAY = String(process.env.WEEKLY_CONTEST_DISEGNI_LAST_DAY || "2026-04-26").trim();
const CONTEST_FIRST_DAY = IS_DISEGNI_CONTEST ? DISEGNI_FIRST_DAY : SFONDI_FIRST_DAY;
const CONTEST_LAST_DAY = IS_DISEGNI_CONTEST ? DISEGNI_LAST_DAY : SFONDI_LAST_DAY;

function parseOptionalContestEpochMs(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1e12 ? n : null;
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
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

// Sfondi default: lunedì 13 aprile 2026, 12:00 Europe/Rome → domenica 19, 21:00 Roma
const SFONDI_WINDOW_START_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_SFONDI_START_MS) ??
  createUtcFromRomeLocal(2026, 4, 13, 12, 0, 0).getTime();
const SFONDI_WINDOW_END_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_SFONDI_END_MS) ??
  createUtcFromRomeLocal(2026, 4, 19, 21, 0, 0).getTime();
// Disegni: come sfondi — lunedì 20 aprile 12:00 Europe/Rome → domenica 26, 21:00 Roma
const DISEGNI_WINDOW_START_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_DISEGNI_START_MS) ??
  createUtcFromRomeLocal(2026, 4, 20, 12, 0, 0).getTime();
const DISEGNI_WINDOW_END_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_DISEGNI_END_MS) ??
  createUtcFromRomeLocal(2026, 4, 26, 21, 0, 0).getTime();

function getContestWindowMs() {
  return IS_DISEGNI_CONTEST
    ? { start: DISEGNI_WINDOW_START_MS, end: DISEGNI_WINDOW_END_MS }
    : { start: SFONDI_WINDOW_START_MS, end: SFONDI_WINDOW_END_MS };
}

const CHANNEL_MOBILE_ID = String(
  IS_DISEGNI_CONTEST
    ? process.env.WEEKLY_CONTEST_DISEGNI_CHANNEL_ID || IDs.channels?.contestDisegni || ""
    : process.env.WEEKLY_CONTEST_SFONDI_MOBILE_CHANNEL_ID || IDs.channels?.contestSfondiMobile || "",
).trim();
const CHANNEL_PC_ID = String(
  IS_DISEGNI_CONTEST ? "" : process.env.WEEKLY_CONTEST_SFONDI_PC_CHANNEL_ID || IDs.channels?.contestSfondiPc || "",
).trim();
const CHANNEL_BONUS_ANNOUNCE_ID = String(IDs.channels?.contestBonusVotesAnnounce || "").trim();
const INFO_CHANNEL_ID = String(IDs.channels?.info || "").trim();

const MEMBER_ROLE_ID = String(IDs.roles?.Member || "").trim();
const TROPHY_LABELS_BONUS = [
  "<:VC_Podio1:1482694399283433582>",
  "<:VC_Podio2:1482694424411635712>",
  "<:VC_Podio3:1482694450806259744>",
];

const PRIZE_ROLE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const CONTEST_PRIZE_VIP_ROLE_ID = String(IDs.roles?.VIP || "").trim();
const CONTEST_PRIZE_DONATOR_ROLE_ID = String(IDs.roles?.Donator || "").trim();

const STAFF_ROLE_IDS = new Set(
  [
    IDs.roles?.Staff,
    IDs.roles?.HighStaff,
    IDs.roles?.Mod,
    IDs.roles?.Helper,
    IDs.roles?.Supervisor,
    IDs.roles?.Coordinator,
    IDs.roles?.Admin,
    IDs.roles?.CoFounder,
    IDs.roles?.Founder,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);

const PREMIUM_ROLE_IDS = new Set(
  [IDs.roles?.VIP, IDs.roles?.Donator, IDs.roles?.ServerBooster, IDs.roles?.DoubleBooster].filter(Boolean).map((id) => String(id)),
);

const CHANNEL_TO_CATEGORY = new Map(
  [
    [CHANNEL_MOBILE_ID, "mobile"],
    ...(CHANNEL_PC_ID ? [[CHANNEL_PC_ID, "pc"]] : []),
  ].filter(([id]) => id),
);

const CONTEST_SUBMISSION_KIND_LABEL = IS_DISEGNI_CONTEST ? "disegno" : "sfondo";

function normalizeSubmissionsCategoryMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

async function getContestBundleLean(guildId, eventKey) {
  const gid = String(guildId || "");
  const ek = String(eventKey || "").trim();
  if (!gid || !ek) return null;
  return WeeklyContestBundle.findOne({ guildId: gid, eventKey: ek }).lean().catch(() => null);
}

function findSubmissionByMessageId(bundleLean, messageId) {
  const mid = String(messageId || "");
  if (!mid || !bundleLean) return null;
  const idx = bundleLean.submissionMessageIndex?.[mid];
  if (idx && idx.category && idx.userId) {
    return { category: String(idx.category), userId: String(idx.userId), messageId: mid };
  }
  for (const cat of ["mobile", "pc"]) {
    const m = normalizeSubmissionsCategoryMap(bundleLean.submissions?.[cat]);
    for (const [uid, mmsg] of Object.entries(m)) {
      if (String(mmsg) === mid) return { category: cat, userId: String(uid), messageId: mid };
    }
  }
  return null;
}

function getContestDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getRomeHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hour12: false });
  const n = Number(formatter.format(date));
  return Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : 0;
}

function addRomeDays(dateKey, deltaDays) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays);
  return getContestDayKey(new Date(utc));
}

function isRomeSunday(date = new Date()) {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
  return w === "Sun";
}

function isContestRomeDayKey(dayKey) {
  const k = String(dayKey || "");
  return k >= CONTEST_FIRST_DAY && k <= CONTEST_LAST_DAY;
}

function isContestActiveNow(date = new Date()) {
  if (CONTEST_TEST_IGNORE_TIME_WINDOW) return true;
  const t = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(t)) return false;
  const { start, end } = getContestWindowMs();
  return t >= start && t < end;
}

function contestGuildId() {
  return MAIN_GUILD_ID;
}

function categoryForChannelId(channelId) {
  return CHANNEL_TO_CATEGORY.get(String(channelId || "")) || null;
}

function attachmentIsContestImage(attachment) {
  const ct = String(attachment?.contentType || "");
  if (ct.startsWith("image/")) return true;
  if (ct.startsWith("video/") || ct.startsWith("audio/")) return false;
  if (ct) return false;
  const name = String(attachment?.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name);
}

function firstContestImageAttachment(message) {
  const attachments = [...(message.attachments?.values?.() || [])];
  return attachments.find(attachmentIsContestImage) || null;
}

function messageHasContestMediaAttachment(message) {
  return Boolean(firstContestImageAttachment(message));
}

function maxAttachmentUploadBytesForGuild(guild) {
  const tier = Number(guild?.premiumTier ?? 0);
  if (tier >= 3) return 100 * 1024 * 1024;
  if (tier >= 2) return 50 * 1024 * 1024;
  return 8 * 1024 * 1024;
}

function safeContestAttachmentFileName(attachment) {
  let n = String(attachment?.name || "sfondo.png").replace(/[\r\n\0]/g, "").trim() || "sfondo.png";
  n = n.replace(/\s+/g, "_").slice(0, 80);
  if (!/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(n)) {
    const base = n.replace(/\.+$/u, "") || "sfondo";
    n = `${base}.png`;
  }
  return n.slice(0, 80) || "sfondo.png";
}

async function fetchDiscordAttachmentBuffer(attachment, maxBytes) {
  const urls = [attachment?.url, attachment?.proxyURL].filter(Boolean).map((u) => String(u).trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  timer.unref?.();
  try {
    for (const url of urls) {
      if (!url) continue;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) continue;
        const cl = Number(res.headers.get("content-length") || 0);
        if (Number.isFinite(cl) && cl > maxBytes) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes) continue;
        return buf;
      } catch (_) {}
    }
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function buildWeeklyContestSubmissionPayload(message, client) {
  const att = firstContestImageAttachment(message);
  const display = String(message.author?.globalName || message.author?.username || "utente").trim() || "utente";
  const avatarUrl = message.author?.displayAvatarURL?.({ extension: "png", size: 256 });
  const embed = new EmbedBuilder()
    .setColor(client?.config?.embedInfo || "#6f4e37")
    .setAuthor({
      name: `${CONTEST_SUBMISSION_KIND_LABEL === "disegno" ? "Disegno" : "Sfondo"} di ${display}`,
      ...(avatarUrl ? { iconURL: avatarUrl } : {}),
    });
  const files = [];
  if (att) {
    const maxBytes = maxAttachmentUploadBytesForGuild(message.guild);
    const declared = Number(att.size || 0);
    if (!declared || declared <= maxBytes) {
      const buf = await fetchDiscordAttachmentBuffer(att, maxBytes);
      const name = safeContestAttachmentFileName(att);
      if (buf?.length) {
        embed.setImage(`attachment://${name}`);
        files.push(new AttachmentBuilder(buf, { name }));
      }
    }
    if (!files.length) {
      if (declared > maxBytes) {
        global.logger?.warn?.(
          "[WEEKLY_CONTEST] allegato oltre il limite upload server: embed con URL (può non reggere se Discord invalida il link).",
          { bytes: declared, maxBytes },
        );
      }
      const url = String(att.proxyURL || att.url || "").trim();
      if (url) embed.setImage(url);
    }
  }
  return { embed, files };
}

function hasAnyRole(member, idSet) {
  if (!member?.roles?.cache) return false;
  for (const id of idSet) {
    if (member.roles.cache.has(id)) return true;
  }
  return false;
}

function resolveBaseVoteCap(member) {
  if (!member) return 1;
  let cap = 1;
  if (hasAnyRole(member, STAFF_ROLE_IDS)) cap += 1;
  if (hasAnyRole(member, PREMIUM_ROLE_IDS)) cap += 1;
  return cap;
}

function bonusSlotsForDay(voterDoc, dayKey) {
  const raw = voterDoc?.bonusSlots;
  if (!raw) return 0;
  if (raw instanceof Map) return Math.max(0, Number(raw.get(dayKey) || 0));
  return Math.max(0, Number(raw[dayKey] || 0));
}

function iterContestCalendarDayKeys() {
  const out = [];
  let k = CONTEST_FIRST_DAY;
  const guard = 40;
  for (let n = 0; n < guard && k && k <= CONTEST_LAST_DAY; n += 1) {
    out.push(k);
    k = addRomeDays(k, 1);
  }
  return out;
}

function totalBonusSlotsForContest(voterLean) {
  let s = 0;
  for (const d of iterContestCalendarDayKeys()) {
    s += bonusSlotsForDay(voterLean, d);
  }
  return s;
}

function clampPairToBaseAndBonus(mRaw, pRaw, base, bonusTotal) {
  let m = Math.max(0, Math.floor(Number(mRaw)));
  let p = Math.max(0, Math.floor(Number(pRaw)));
  const cap = Math.max(0, Math.floor(Number(bonusTotal)));
  while (extraVotesUsed(m, p, base) > cap) {
    if (m >= p && m > 0) m -= 1;
    else if (p > 0) p -= 1;
    else break;
  }
  return { m, p };
}

function extraVotesUsed(mobileCount, pcCount, baseMax) {
  return Math.max(0, mobileCount - baseMax) + Math.max(0, pcCount - baseMax);
}

function sumCountsMap(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return 0;
  let s = 0;
  for (const v of Object.values(o)) {
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > 0) s += n;
  }
  return s;
}

function mapHasKeys(o) {
  return Boolean(o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length > 0);
}

function mobileVoteCountUnified(voterLean) {
  const mapSum = sumCountsMap(voterLean?.votesMobileCounts);
  if (mapSum > 0 || mapHasKeys(voterLean?.votesMobileCounts)) return mapSum;
  return (
    (Array.isArray(voterLean?.votesMobile) ? voterLean.votesMobile.length : 0) +
    (Array.isArray(voterLean?.votesMobileSparkle) ? voterLean.votesMobileSparkle.length : 0)
  );
}

function pcVoteCountUnified(voterLean) {
  const mapSum = sumCountsMap(voterLean?.votesPcCounts);
  if (mapSum > 0 || mapHasKeys(voterLean?.votesPcCounts)) return mapSum;
  return (
    (Array.isArray(voterLean?.votesPc) ? voterLean.votesPc.length : 0) +
    (Array.isArray(voterLean?.votesPcSparkle) ? voterLean.votesPcSparkle.length : 0)
  );
}

function canAddVoteToCategory(voterLean, category, baseMax) {
  const m = mobileVoteCountUnified(voterLean);
  const p = pcVoteCountUnified(voterLean);
  const bonusTotal = totalBonusSlotsForContest(voterLean);
  const nextM = category === "mobile" ? m + 1 : m;
  const nextP = category === "pc" ? p + 1 : p;
  return extraVotesUsed(nextM, nextP, baseMax) <= bonusTotal;
}

function buildWeeklyContestVoteRow(messageId) {
  const mid = String(messageId || "");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wcVote:inc:${mid}`)
      .setEmoji("<:thumbsup:1471292172145004768>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wcVote:dec:${mid}`)
      .setEmoji("<:thumbsdown:1471292163957457013>")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function ensureContestChannelsHideReactionCounts(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild?.roles?.everyone?.id) return;
  const everyoneId = guild.roles.everyone.id;
  for (const cid of [CHANNEL_MOBILE_ID, CHANNEL_PC_ID].filter(Boolean)) {
    if (!cid) continue;
    const ch =
      guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
    if (!ch?.permissionOverwrites?.edit) continue;
    await ch.permissionOverwrites.edit(everyoneId, { AddReactions: false }).catch((err) => {
      global.logger?.warn?.(
        "[WEEKLY_CONTEST] impossibile negare AddReactions a @everyone:",
        cid,
        err?.message || err,
      );
    });
  }
}

/** Il primo giorno del contest (CONTEST_FIRST_DAY), da mezzogiorno Roma: consente a Member di inviare messaggi nei due canali submission. */
async function runContestMemberSendChannelsOpenJob(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  const memberRoleId = MEMBER_ROLE_ID;
  if (!memberRoleId || !CHANNEL_MOBILE_ID) return;
  if (!IS_DISEGNI_CONTEST && !CHANNEL_PC_ID) return;

  const firstDay = String(CONTEST_FIRST_DAY || "").trim();
  if (!firstDay) return;
  const todayKey = getContestDayKey();
  if (String(todayKey) !== firstDay) return;
  if (getRomeHour() < 12) return;

  const metaLean = await WeeklyContestMeta.findOne({ guildId: gid, eventKey: EVENT_KEY_PRODUCTION })
    .select("contestMemberSendOpenedDayKey")
    .lean()
    .catch(() => null);
  if (String(metaLean?.contestMemberSendOpenedDayKey || "") === firstDay) return;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;

  const openIds = [CHANNEL_MOBILE_ID, CHANNEL_PC_ID].filter(Boolean);
  for (const cid of openIds) {
    const ch = guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
    if (!ch?.permissionOverwrites?.edit) {
      global.logger?.warn?.("[WEEKLY_CONTEST] apertura Member SendMessages: canale non editabile:", cid);
      return;
    }
    const ok = await ch.permissionOverwrites
      .edit(memberRoleId, { SendMessages: true })
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[WEEKLY_CONTEST] Member SendMessages:", cid, err?.message || err);
        return false;
      });
    if (!ok) return;
  }

  await WeeklyContestMeta.findOneAndUpdate(
    { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
    { $set: { contestMemberSendOpenedDayKey: firstDay } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] meta contestMemberSendOpenedDayKey:", err));

  global.logger?.info?.(`[WEEKLY_CONTEST] Member → SendMessages su canali contest (inizio ${firstDay}, ${TIME_ZONE}).`);
}

async function denySendInContestChannel(channel, userId) {
  const uid = String(userId || "");
  if (!channel?.permissionOverwrites?.edit || !uid) return;
  await channel.permissionOverwrites.edit(uid, { SendMessages: false }).catch((err) => {
    global.logger?.warn?.("[WEEKLY_CONTEST] deny SendMessages:", err?.message || err);
  });
}

async function migrateVoterLeafInBundleIfNeeded(guildId, eventKey, voterId, doc) {
  const gid = String(guildId || "");
  const ek = String(eventKey || "").trim();
  const vid = String(voterId || "");
  if (!gid || !ek || !vid || !doc) return;
  const lm = (doc.votesMobile?.length || 0) + (doc.votesMobileSparkle?.length || 0);
  const lp = (doc.votesPc?.length || 0) + (doc.votesPcSparkle?.length || 0);
  if (!lm && !lp) return;
  const mMap = {
    ...(doc.votesMobileCounts && typeof doc.votesMobileCounts === "object" && !Array.isArray(doc.votesMobileCounts)
      ? doc.votesMobileCounts
      : {}),
  };
  const pMap = {
    ...(doc.votesPcCounts && typeof doc.votesPcCounts === "object" && !Array.isArray(doc.votesPcCounts)
      ? doc.votesPcCounts
      : {}),
  };
  for (const id of doc.votesMobile || []) {
    const k = String(id);
    mMap[k] = (Number(mMap[k]) || 0) + 1;
  }
  for (const id of doc.votesMobileSparkle || []) {
    const k = String(id);
    mMap[k] = (Number(mMap[k]) || 0) + 1;
  }
  for (const id of doc.votesPc || []) {
    const k = String(id);
    pMap[k] = (Number(pMap[k]) || 0) + 1;
  }
  for (const id of doc.votesPcSparkle || []) {
    const k = String(id);
    pMap[k] = (Number(pMap[k]) || 0) + 1;
  }
  const base = `voters.${vid}`;
  await WeeklyContestBundle.updateOne(
    { guildId: gid, eventKey: ek },
    {
      $set: {
        [`${base}.votesMobileCounts`]: mMap,
        [`${base}.votesPcCounts`]: pMap,
      },
      $unset: {
        [`${base}.votesMobile`]: "",
        [`${base}.votesMobileSparkle`]: "",
        [`${base}.votesPc`]: "",
        [`${base}.votesPcSparkle`]: "",
      },
    },
  ).catch(() => null);
}

function parseWeeklyContestButtonCustomId(customId) {
  const m = String(customId || "").match(/^wcVote:(inc|dec):(\d{17,21})$/);
  if (!m) return null;
  return { dir: m[1], messageId: m[2] };
}

function countsPathForCategory(category) {
  return category === "mobile" ? "votesMobileCounts" : "votesPcCounts";
}

async function tryStripContestSubmissionReaction(reaction, user) {
  try {
    if (user?.bot) return false;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message?.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!msg?.guild) return false;
    if (String(msg.guild.id) !== contestGuildId()) return false;
    if (!isContestActiveNow()) return false;
    if (!categoryForChannelId(msg.channelId)) return false;
    const guildId = String(msg.guild.id);
    const messageId = String(msg.id);
    const q = { guildId, eventKey: EVENT_KEY };
    q[`submissionMessageIndex.${messageId}`] = { $exists: true };
    const sub = await WeeklyContestBundle.findOne(q).select("_id").lean().catch(() => null);
    if (!sub) return false;
    await reaction.users.remove(user.id).catch(() => {});
    return true;
  } catch (err) {
    global.logger?.error?.("[WEEKLY_CONTEST] strip reaction:", err);
    return false;
  }
}

async function handleWeeklyContestVoteButton(interaction) {
  if (!interaction?.isButton?.() || !interaction.guild || !interaction.message) return false;
  const parsed = parseWeeklyContestButtonCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.guild.id) !== contestGuildId()) return false;

  const category = categoryForChannelId(interaction.channelId);
  if (!category) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  try {
  const botId = String(interaction.client?.user?.id || "");
  const hostAuthorId = String(interaction.message.author?.id || "");
  if (!botId || hostAuthorId !== botId) {
    await safeEditReply(interaction, {
      content: "<:VC_Attention:1482534443632558151> Pulsante non valido per questo messaggio.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const hostMessageId = String(interaction.message.id || "");
  if (hostMessageId !== parsed.messageId) {
    await safeEditReply(interaction, {
      content: "<:VC_Attention:1482534443632558151> Pulsante non valido per questo messaggio.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  if (!isContestActiveNow()) {
    await safeEditReply(interaction, {
      content: "Il contest non è attivo.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const guildId = String(interaction.guild.id);
  const voterId = String(interaction.user.id);
  if (!isValidGuildUserId(guildId, voterId)) {
    await safeEditReply(interaction, {
      content: "<:VC_Attention:1482534443632558151> Richiesta non valida.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const bundlePre = await getContestBundleLean(guildId, EVENT_KEY);
  const submission = findSubmissionByMessageId(bundlePre, hostMessageId);
  if (!submission || String(submission.category) !== category) {
    await safeEditReply(interaction, {
      content: "Questo messaggio non è una submission del contest.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  if (String(submission.userId || "").trim() === voterId) {
    await safeEditReply(interaction, {
      content:
        `<:VC_Attention:1482534443632558151> **Non puoi votare per te stesso:** non si possono dare o togliere voti sul **proprio** ${CONTEST_SUBMISSION_KIND_LABEL}.`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const member = await getGuildMemberCached(interaction.guild, voterId);
  const baseMax = resolveBaseVoteCap(member);
  const countPath = countsPathForCategory(category);
  const incPath = `voters.${voterId}.${countPath}.${hostMessageId}`;

  const voterDocLeaf = (await getContestBundleLean(guildId, EVENT_KEY))?.voters?.[voterId];
  if (voterDocLeaf) {
    await migrateVoterLeafInBundleIfNeeded(guildId, EVENT_KEY, voterId, voterDocLeaf);
  }

  const bundleForLean = await getContestBundleLean(guildId, EVENT_KEY);
  const voterLean = bundleForLean?.voters?.[voterId]
    ? { guildId, eventKey: EVENT_KEY, voterId, ...bundleForLean.voters[voterId] }
    : null;

  if (parsed.dir === "dec") {
    const res = await WeeklyContestBundle.updateOne(
      { guildId, eventKey: EVENT_KEY, [incPath]: { $gt: 0 } },
      { $inc: { [incPath]: -1 } },
    ).catch(() => ({ modifiedCount: 0 }));
    if (!res?.modifiedCount) {
      await safeEditReply(interaction, {
        content: "Non hai nulla da togliere qui.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return true;
    }
    await safeEditReply(interaction, {
      content: "Aggiornamento registrato.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const leanForCheck = voterLean || {
    guildId,
    eventKey: EVENT_KEY,
    voterId,
    votesMobileCounts: {},
    votesPcCounts: {},
    bonusSlots: {},
  };
  if (!canAddVoteToCategory(leanForCheck, category, baseMax)) {
    await safeEditReply(interaction, {
      content: "Hai esaurito i voti disponibili in questa categoria.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  await WeeklyContestBundle.findOneAndUpdate(
    { guildId, eventKey: EVENT_KEY },
    { $inc: { [incPath]: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const freshBundle = await getContestBundleLean(guildId, EVENT_KEY);
  const freshLeaf = freshBundle?.voters?.[voterId];
  const fresh = freshLeaf
    ? { guildId, eventKey: EVENT_KEY, voterId, ...freshLeaf }
    : null;
  const fm = mobileVoteCountUnified(fresh);
  const fp = pcVoteCountUnified(fresh);
  if (extraVotesUsed(fm, fp, baseMax) > totalBonusSlotsForContest(fresh)) {
    await WeeklyContestBundle.updateOne(
      { guildId, eventKey: EVENT_KEY, [incPath]: { $gt: 0 } },
      { $inc: { [incPath]: -1 } },
    ).catch(() => null);
    await safeEditReply(interaction, {
      content: "Hai esaurito i voti disponibili in questa categoria.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  await safeEditReply(interaction, {
    content:
      "Aggiornamento registrato.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return true;
  } catch (err) {
    global.logger?.error?.("[WEEKLY_CONTEST] vote button:", err?.message || err);
    await safeEditReply(interaction, {
      content: "<:VC_Attention:1482534443632558151> Errore durante il voto. Riprova tra poco.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }
}

async function handleWeeklyContestSubmissionMessage(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return false;
    if (String(message.guild.id) !== contestGuildId()) return false;
    const category = categoryForChannelId(message.channelId);
    if (!category) return false;
    if (!isContestActiveNow(message.createdAt || new Date())) return false;

    const guildId = String(message.guild.id);
    const userId = String(message.author.id);
    if (!isValidGuildUserId(guildId, userId)) return false;

    if (!messageHasContestMediaAttachment(message)) {
      await message.delete().catch(() => {});
      return true;
    }

    const bundleExisting = await getContestBundleLean(guildId, EVENT_KEY);
    const catMap = normalizeSubmissionsCategoryMap(bundleExisting?.submissions?.[category]);
    const existingMid = catMap[userId] ? String(catMap[userId]) : null;

    if (existingMid && existingMid !== String(message.id)) {
      const oldAlive = await message.channel.messages.fetch(existingMid).catch(() => null);
      if (oldAlive) {
        const warn = await message.channel
          .send({
            content: `${message.author} Hai già inviato **un ${CONTEST_SUBMISSION_KIND_LABEL}** in questa categoria.`,
            allowedMentions: { users: [message.author.id] },
          })
          .catch(() => null);
        await message.delete().catch(() => {});
        if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
        return true;
      }
    }

    const { embed, files } = await buildWeeklyContestSubmissionPayload(message, client);
    const posted = await message.channel
      .send({
        embeds: [embed],
        ...(files.length ? { files } : {}),
        allowedMentions: { parse: [] },
      })
      .catch((err) => {
        global.logger?.warn?.("[WEEKLY_CONTEST] impossibile pubblicare submission:", err?.message || err);
        return null;
      });
    if (!posted?.id) return false;

    const row = buildWeeklyContestVoteRow(posted.id);
    let voteRowOk = true;
    await posted.edit({ components: [row] }).catch((err) => {
      voteRowOk = false;
      global.logger?.warn?.("[WEEKLY_CONTEST] impossibile aggiungere pulsanti voto:", err?.message || err);
    });
    if (!voteRowOk) {
      await posted.delete().catch(() => {});
      return false;
    }

    const newMsgId = String(posted.id);
    const update = {
      $set: {
        [`submissions.${category}.${userId}`]: newMsgId,
        [`submissionMessageIndex.${newMsgId}`]: { category, userId },
      },
    };
    if (existingMid && existingMid !== newMsgId) {
      update.$unset = { [`submissionMessageIndex.${existingMid}`]: "" };
    }
    await WeeklyContestBundle.findOneAndUpdate({ guildId, eventKey: EVENT_KEY }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).catch((err) => {
      global.logger?.error?.("[WEEKLY_CONTEST] submission upsert:", err);
    });

    await message.delete().catch((err) => {
      global.logger?.warn?.("[WEEKLY_CONTEST] impossibile eliminare messaggio utente:", err?.message || err);
    });

    await posted.reactions.removeAll().catch(() => {});

    if (!posted.hasThread) {
      const label = String(message.author?.globalName || message.author?.username || "autore").trim() || "autore";
      const name = `Commenti · ${label}`.slice(0, 100);
      await posted.startThread({
        name,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: "Contest sfondi: commenti allo sfondo",
      }).catch((err) => global.logger?.warn?.("[WEEKLY_CONTEST] thread commenti:", err?.message || err));
    }

    const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (member) await denySendInContestChannel(message.channel, member.id);

    return false;
  } catch (err) {
    global.logger?.error?.("[WEEKLY_CONTEST] submission:", err);
    return false;
  }
}

async function runWeeklyContestNonMemberVoterPrune(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;

  const bundle = await getContestBundleLean(gid, EVENT_KEY_PRODUCTION);
  const voters = bundle?.voters && typeof bundle.voters === "object" ? bundle.voters : {};
  for (const [voterId, doc] of Object.entries(voters)) {
    if (!voterId) continue;
    const stillIn = await guild.members.fetch(voterId).catch(() => null);
    if (stillIn) continue;

    const w =
      sumCountsMap(doc.votesMobileCounts) +
      sumCountsMap(doc.votesPcCounts) +
      (doc.votesMobile?.length || 0) +
      (doc.votesMobileSparkle?.length || 0) +
      (doc.votesPc?.length || 0) +
      (doc.votesPcSparkle?.length || 0);
    if (!w) continue;

    const base = `voters.${voterId}`;
    await WeeklyContestBundle.updateOne(
      { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
      {
        $set: {
          [`${base}.votesMobileCounts`]: {},
          [`${base}.votesPcCounts`]: {},
        },
        $unset: {
          [`${base}.votesMobile`]: "",
          [`${base}.votesMobileSparkle`]: "",
          [`${base}.votesPc`]: "",
          [`${base}.votesPcSparkle`]: "",
        },
      },
    ).catch(() => null);
  }
}

function isEligibleDailyBonusMember(member) {
  if (!member?.user || member.user.bot) return false;
  if (MEMBER_ROLE_ID && !member.roles.cache.has(MEMBER_ROLE_ID)) return false;
  if (hasAnyRole(member, STAFF_ROLE_IDS)) return false;
  return true;
}

function combinedDailyActivityParts(row) {
  const textCount = Math.max(0, Math.floor(Number(row?.textCount || 0)));
  const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));
  const voiceExp = Math.floor(voiceSeconds / 60) * VOICE_EXP_PER_MINUTE;
  return { textCount, voiceSeconds, voiceExp, combined: textCount + voiceExp };
}

const BACKFILL_HOUR_SUFFIX = "T12";

function contestBonusHourKeysUntil21(activityDayKey) {
  const d = String(activityDayKey || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];
  const keys = [];
  for (let h = 0; h <= 20; h += 1) {
    keys.push(`${d}T${String(h).padStart(2, "0")}`);
  }
  return keys;
}

function mergeContestBonusHourlyRows(rawRows, activityDayKey) {
  const wanted = new Set(contestBonusHourKeysUntil21(activityDayKey));
  const byUser = new Map();
  for (const r of rawRows || []) {
    const hk = String(r?.hourKey || "");
    if (!wanted.has(hk)) continue;
    const uid = String(r?.userId || "");
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(r);
  }
  const out = [];
  for (const [userId, urows] of byUser) {
    const hasNonBackfill = urows.some((row) => !String(row?.hourKey || "").endsWith(BACKFILL_HOUR_SUFFIX));
    let textCount = 0;
    let voiceSeconds = 0;
    for (const row of urows) {
      const hk = String(row?.hourKey || "");
      if (hk.endsWith(BACKFILL_HOUR_SUFFIX) && hasNonBackfill) continue;
      textCount += Math.max(0, Math.floor(Number(row?.textCount || 0)));
      voiceSeconds += Math.max(0, Number(row?.voiceSeconds || 0));
    }
    out.push({ userId, textCount, voiceSeconds });
  }
  return out;
}

function formatDailyBonusRankLine(index, userId, expWindow) {
  const medal = TROPHY_LABELS_BONUS[index] || "[#]";
  const n = Math.max(0, Math.floor(Number(expWindow || 0)));
  return `${medal} <@${userId}> <a:VC_Arrow:1482706699365257397> **${n}** exp`;
}

async function sendContestDailyBonusAnnounce(client, guild, { activityDayKey, todayKey, winners }) {
  if (!CHANNEL_BONUS_ANNOUNCE_ID || !winners?.length) return;
  const channel =
    client.channels.cache.get(CHANNEL_BONUS_ANNOUNCE_ID) ||
    (await getClientChannelCached(client, CHANNEL_BONUS_ANNOUNCE_ID, { ttlMs: 60_000 }).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[WEEKLY_CONTEST] canale annuncio bonus non trovato:", CHANNEL_BONUS_ANNOUNCE_ID);
    return;
  }
  const lines = winners.map((w, i) => formatDailyBonusRankLine(i, w.userId, w.expWindow));
  const infoLine = `<:VC_Leaderboard:1482534806314287387> // I più attivi di oggi.`;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        infoLine,
        "",
        `<a:VC_HeartsPink:1468685897389052008> • **Top 3 attività:**`,
        ...lines,
        "",
        `<a:VC_Winner:1482535294757507255> Avete **+1 voto** extra potete spenderlo **in qualsiasi giorno** del contest fino alla fine.`,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null);
  const buttons = CHANNEL_PC_ID
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Sfondi Mobile")
          .setStyle(ButtonStyle.Link)
          .setEmoji("<:VC_FrogCute:1331620415185096746>")
          .setURL(`https://discord.com/channels/${guild.id}/${CHANNEL_MOBILE_ID}`),
        new ButtonBuilder()
          .setLabel("Sfondi PC")
          .setStyle(ButtonStyle.Link)
          .setEmoji("<:VC_FrogJuice:1331620486517358613>")
          .setURL(`https://discord.com/channels/${guild.id}/${CHANNEL_PC_ID}`),
      )
    : new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Canale contest")
          .setStyle(ButtonStyle.Link)
          .setEmoji("🎨")
          .setURL(`https://discord.com/channels/${guild.id}/${CHANNEL_MOBILE_ID}`),
      );
  try {
    await channel.send({ embeds: [embed], components: [buttons] });
  } catch (err) {
    global.logger?.error?.("[WEEKLY_CONTEST] annuncio bonus:", err?.message || err);
  }
}

async function computeDailyBonusTopThreeWinners(guild, activityDayKey) {
  const gid = String(guild?.id || contestGuildId() || "").trim();
  const dayKey = String(activityDayKey || "").trim();
  if (!gid || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return [];

  const hourKeys = contestBonusHourKeysUntil21(dayKey);
  const rawHourly = hourKeys.length ? await loadHourlyRows(gid, hourKeys).catch(() => []) : [];
  const mergedRows = mergeContestBonusHourlyRows(rawHourly, dayKey);
  const scored = mergedRows.map((r) => {
    const userId = String(r?.userId || "");
    const parts = combinedDailyActivityParts(r);
    return { userId, ...parts };
  });
  const sorted = scored
    .filter((r) => r.userId && r.combined > 0)
    .sort((a, b) => {
      if (b.combined !== a.combined) return b.combined - a.combined;
      if (b.textCount !== a.textCount) return b.textCount - a.textCount;
      return b.voiceSeconds - a.voiceSeconds;
    });

  const winners = [];
  for (const row of sorted) {
    const mem = await guild.members.fetch(row.userId).catch(() => null);
    if (!mem || !isEligibleDailyBonusMember(mem)) continue;
    const textCount = Math.max(0, Math.floor(Number(row.textCount || 0)));
    const voiceExp = Math.max(0, Math.floor(Number(row.voiceExp || 0)));
    const baseExpFromActivity = textCount * MESSAGE_EXP + voiceExp;
    winners.push({
      userId: row.userId,
      baseExpFromActivity,
      activityCombined: Math.max(0, Math.floor(Number(row.combined || 0))),
      textCount,
      voiceSeconds: Math.max(0, Number(row.voiceSeconds || 0)),
    });
    if (winners.length >= 3) break;
  }

  const expByUser = await sumExpDeltaFromLevelHistoryForRomeDay(gid, dayKey, winners.map((w) => w.userId), {
    until21: true,
  }).catch(() => new Map());
  for (const w of winners) {
    const hist = Math.max(0, Math.floor(Number(expByUser.get(w.userId) || 0)));
    const base = Math.max(0, Math.floor(Number(w.baseExpFromActivity || 0)));
    w.expWindow = hist > 0 ? hist : base;
  }
  winners.sort((a, b) => {
    const ea = Math.max(0, Math.floor(Number(a.expWindow || 0)));
    const eb = Math.max(0, Math.floor(Number(b.expWindow || 0)));
    if (eb !== ea) return eb - ea;
    const ca = Math.max(0, Math.floor(Number(a.activityCombined || 0)));
    const cb = Math.max(0, Math.floor(Number(b.activityCombined || 0)));
    if (cb !== ca) return cb - ca;
    if (b.textCount !== a.textCount) return b.textCount - a.textCount;
    if (b.voiceSeconds !== a.voiceSeconds) return b.voiceSeconds - a.voiceSeconds;
    return String(a.userId).localeCompare(String(b.userId));
  });
  return winners;
}

async function replayContestDailyBonusAnnounce(client, opts = {}) {
  const gid = contestGuildId();
  if (!gid || !client) return { ok: false, reason: "missing_client_or_guild" };
  const activityDayKey = String(opts.activityDayKey || "").trim() || getContestDayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDayKey)) return { ok: false, reason: "bad_activity_day_key" };
  const accreditDayKey = String(opts.accreditDayKey || "").trim() || activityDayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(accreditDayKey)) return { ok: false, reason: "bad_accredit_day_key" };
  const slotDayKey = String(opts.slotDayKey || "").trim() || accreditDayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDayKey)) return { ok: false, reason: "bad_slot_day_key" };
  const syncDb = opts.syncDb !== false;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_fetch" };

  const winners = await computeDailyBonusTopThreeWinners(guild, activityDayKey);
  if (!winners.length) return { ok: false, reason: "no_winners" };

  const out = {
    ok: true,
    winners: winners.length,
    activityDayKey,
    accreditDayKey,
    slotDayKey,
    syncDb,
    removedSlots: 0,
    addedSlots: 0,
    clampedVoters: 0,
  };

  if (syncDb) {
    const bundle = await getContestBundleLean(gid, EVENT_KEY_PRODUCTION).catch(() => null);
    const votersObj = bundle?.voters && typeof bundle.voters === "object" && !Array.isArray(bundle.voters) ? bundle.voters : {};
    const oldSlotHolders = Object.keys(votersObj).filter((vid) => bonusSlotsForDay(votersObj[vid], slotDayKey) > 0);
    const newIds = new Set(winners.map((w) => String(w.userId)));
    const oldSet = new Set(oldSlotHolders.map((x) => String(x)));

    for (const vid of oldSlotHolders) {
      const v = String(vid);
      if (!newIds.has(v)) {
        await WeeklyContestBundle.updateOne(
          { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
          { $unset: { [`voters.${v}.bonusSlots.${slotDayKey}`]: "" } },
        ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] replay unset bonus slot:", err));
        out.removedSlots += 1;
      }
    }
    for (const w of winners) {
      const uid = String(w.userId);
      if (!oldSet.has(uid)) {
        if (!isValidGuildUserId(gid, uid)) continue;
        await WeeklyContestBundle.updateOne(
          { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
          { $set: { [`voters.${uid}.bonusSlots.${slotDayKey}`]: 1 } },
          { upsert: true, setDefaultsOnInsert: true },
        ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] replay set bonus slot:", err));
        out.addedSlots += 1;
      }
    }

    const clampIds = oldSlotHolders.filter((vid) => !newIds.has(String(vid)));
    for (const vid of clampIds) {
      await clampVoterLeafVotesToCap(guild, gid, EVENT_KEY_PRODUCTION, vid);
      out.clampedVoters += 1;
    }
  }

  await sendContestDailyBonusAnnounce(client, guild, { activityDayKey, todayKey: accreditDayKey, winners });
  return out;
}

async function runDailyTopThreeBonusJob(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  if (CONTEST_TEST_MODE) return;
  if (!CHANNEL_MOBILE_ID) return;
  if (!IS_DISEGNI_CONTEST && !CHANNEL_PC_ID) return;
  if (isRomeSunday()) return;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;

  if (getRomeHour(new Date()) !== 21) return;

  const todayKey = getContestDayKey();
  const activityDayKey = todayKey;
  if (!activityDayKey || !isContestRomeDayKey(todayKey)) return;

  const grantPath = `dailyBonusGrantLog.${todayKey}`;
  const already = await WeeklyContestMeta.findOne({ guildId: gid, eventKey: EVENT_KEY_PRODUCTION })
    .select("dailyBonusGrantLog")
    .lean()
    .catch(() => null);
  if (already?.dailyBonusGrantLog?.[todayKey] === true) return;

  await WeeklyContestMeta.findOneAndUpdate(
    { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
    { $set: { [grantPath]: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const winners = await computeDailyBonusTopThreeWinners(guild, activityDayKey);

  const topIds = winners.map((w) => w.userId);
  for (const voterId of topIds) {
    if (!isValidGuildUserId(gid, voterId)) continue;
    await WeeklyContestBundle.findOneAndUpdate(
      { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
      { $set: { [`voters.${voterId}.bonusSlots.${todayKey}`]: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] bonus grant:", err));
  }

  global.logger?.info?.(
    `[WEEKLY_CONTEST] Bonus giornaliero ${todayKey}: ${topIds.length} utenti (attività ${activityDayKey} 00–21, combinata).`,
  );

  if (winners.length) {
    await sendContestDailyBonusAnnounce(client, guild, { activityDayKey, todayKey, winners });
  }
}

function rawMobileMessageMapFromVoterLean(lean) {
  const out = {};
  const mobileMap = lean?.votesMobileCounts;
  const useMobileMap = mapHasKeys(mobileMap) || sumCountsMap(mobileMap) > 0;
  if (useMobileMap && mobileMap && typeof mobileMap === "object" && !Array.isArray(mobileMap)) {
    for (const [mid, raw] of Object.entries(mobileMap)) {
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n <= 0) continue;
      const k = String(mid);
      out[k] = (out[k] || 0) + n;
    }
  } else {
    for (const id of lean?.votesMobile || []) {
      const k = String(id);
      out[k] = (out[k] || 0) + 1;
    }
    for (const id of lean?.votesMobileSparkle || []) {
      const k = String(id);
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}

function rawPcMessageMapFromVoterLean(lean) {
  const out = {};
  const pcMap = lean?.votesPcCounts;
  const usePcMap = mapHasKeys(pcMap) || sumCountsMap(pcMap) > 0;
  if (usePcMap && pcMap && typeof pcMap === "object" && !Array.isArray(pcMap)) {
    for (const [mid, raw] of Object.entries(pcMap)) {
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n <= 0) continue;
      const k = String(mid);
      out[k] = (out[k] || 0) + n;
    }
  } else {
    for (const id of lean?.votesPc || []) {
      const k = String(id);
      out[k] = (out[k] || 0) + 1;
    }
    for (const id of lean?.votesPcSparkle || []) {
      const k = String(id);
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}

function scaleRawVoteMapToTotal(rawObj, targetTotal) {
  const entries = Object.entries(rawObj || {})
    .map(([mid, v]) => [String(mid), Math.max(0, Math.floor(Number(v)))])
    .filter(([, n]) => n > 0);
  const sum = entries.reduce((a, [, n]) => a + n, 0);
  const out = new Map();
  if (targetTotal <= 0 || sum <= 0) return out;
  if (targetTotal >= sum) {
    for (const [mid, n] of entries) out.set(mid, n);
    return out;
  }
  const floors = entries.map(([mid, n]) => ({
    mid,
    n,
    f: Math.floor((n * targetTotal) / sum),
  }));
  let allocated = 0;
  for (const w of floors) {
    out.set(w.mid, w.f);
    allocated += w.f;
  }
  let rem = targetTotal - allocated;
  floors.sort((a, b) => b.n - a.n || a.mid.localeCompare(b.mid));
  let i = 0;
  while (rem > 0 && floors.length) {
    const w = floors[i % floors.length];
    out.set(w.mid, (out.get(w.mid) || 0) + 1);
    rem -= 1;
    i += 1;
  }
  return out;
}

function mergeVoteMapInto(target, sourceMap) {
  for (const [k, v] of sourceMap) {
    target.set(k, (target.get(k) || 0) + v);
  }
}

async function clampVoterLeafVotesToCap(guild, guildId, eventKey, voterId) {
  const gid = String(guildId || "");
  const ek = String(eventKey || "").trim();
  const vid = String(voterId || "");
  if (!gid || !ek || !vid) return;
  const bundleForLean = await getContestBundleLean(gid, ek);
  const leaf = bundleForLean?.voters?.[vid];
  if (!leaf) return;
  await migrateVoterLeafInBundleIfNeeded(gid, ek, vid, leaf);
  const bundle2 = await getContestBundleLean(gid, ek);
  const v = bundle2?.voters?.[vid];
  if (!v) return;
  const member = await guild.members.fetch(vid).catch(() => null);
  const baseNow = resolveBaseVoteCap(member);
  const bonusTotal = totalBonusSlotsForContest(v);
  const mRaw = mobileVoteCountUnified(v);
  const pRaw = pcVoteCountUnified(v);
  const { m: mOk, p: pOk } = clampPairToBaseAndBonus(mRaw, pRaw, baseNow, bonusTotal);
  const mScaled = scaleRawVoteMapToTotal(rawMobileMessageMapFromVoterLean(v), mOk);
  const pScaled = scaleRawVoteMapToTotal(rawPcMessageMapFromVoterLean(v), pOk);
  const mObj = Object.fromEntries(mScaled);
  const pObj = Object.fromEntries(pScaled);
  await WeeklyContestBundle.updateOne(
    { guildId: gid, eventKey: ek },
    {
      $set: {
        [`voters.${vid}.votesMobileCounts`]: mObj,
        [`voters.${vid}.votesPcCounts`]: pObj,
      },
    },
  ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] clamp voti dopo correzione bonus:", err));
}

async function aggregateFinaleCategoryVoteTotalsValid(guild, guildId) {
  const gid = String(guildId || "");
  const mobileMerged = new Map();
  const pcMerged = new Map();
  const bundle = await getContestBundleLean(gid, EVENT_KEY);
  const votersObj = bundle?.voters && typeof bundle.voters === "object" ? bundle.voters : {};
  for (const [voterId, leaf] of Object.entries(votersObj)) {
    if (!voterId) continue;
    const v = { voterId, ...leaf };
    const member = await guild.members.fetch(voterId).catch(() => null);
    const baseNow = resolveBaseVoteCap(member);
    const bonusTotal = totalBonusSlotsForContest(v);
    const mRaw = mobileVoteCountUnified(v);
    const pRaw = pcVoteCountUnified(v);
    const { m: mOk, p: pOk } = clampPairToBaseAndBonus(mRaw, pRaw, baseNow, bonusTotal);
    const mScaled = scaleRawVoteMapToTotal(rawMobileMessageMapFromVoterLean(v), mOk);
    const pScaled = scaleRawVoteMapToTotal(rawPcMessageMapFromVoterLean(v), pOk);
    mergeVoteMapInto(mobileMerged, mScaled);
    mergeVoteMapInto(pcMerged, pScaled);
  }
  return { mobile: mobileMerged, pc: pcMerged };
}

async function computeContestFinaleRankingForCategory(guildId, category, msgVoteMap) {
  const gid = String(guildId || "");
  const cat = String(category || "");
  const bundle = await getContestBundleLean(gid, EVENT_KEY);
  const m = normalizeSubmissionsCategoryMap(bundle?.submissions?.[cat]);
  const subs = Object.entries(m).map(([userId, messageId]) => ({ userId, messageId }));
  const byAuthor = new Map();
  for (const s of subs) {
    const uid = String(s?.userId || "");
    if (!uid) continue;
    const mid = String(s?.messageId || "");
    const add = Math.max(0, Math.floor(Number(msgVoteMap?.get(mid) || 0)));
    byAuthor.set(uid, (byAuthor.get(uid) || 0) + add);
  }
  return [...byAuthor.entries()]
    .map(([userId, votes]) => ({ userId, votes }))
    .sort((a, b) => b.votes - a.votes || a.userId.localeCompare(b.userId));
}

function rankInFinaleRanking(ranking, userId) {
  const uid = String(userId || "");
  const i = ranking.findIndex((r) => String(r.userId) === uid);
  return i >= 0 ? i + 1 : Infinity;
}

function buildFinalePrimaryCategoryMap(rankingMobile, rankingPc) {
  const mobileSet = new Set(rankingMobile.map((r) => String(r.userId)));
  const pcSet = new Set(rankingPc.map((r) => String(r.userId)));
  const primary = new Map();
  for (const uid of mobileSet) {
    if (!pcSet.has(uid)) {
      primary.set(uid, "mobile");
      continue;
    }
    const rm = rankInFinaleRanking(rankingMobile, uid);
    const rp = rankInFinaleRanking(rankingPc, uid);
    if (rp < rm) primary.set(uid, "pc");
    else if (rm < rp) primary.set(uid, "mobile");
    else primary.set(uid, "pc");
  }
  for (const uid of pcSet) {
    if (!primary.has(uid)) primary.set(uid, "pc");
  }
  return primary;
}

function filterFinaleRankingForCategory(ranking, category, primaryMap) {
  const cat = String(category || "");
  return ranking.filter((r) => primaryMap.get(String(r.userId)) === cat);
}

function isFinaleCategoryResolved(meta, category) {
  const c = String(category || "");
  if (meta?.finalePrizesResolvedCategories?.[c]) return true;
  if (meta?.contestFinaleResolved) return true;
  return false;
}

async function tryGrantContestFinaleTempRole(guild, userId, roleId, durationMs) {
  const uid = String(userId || "");
  const rid = String(roleId || "");
  if (!uid || !rid || !guild) return null;
  const member =
    (await getGuildMemberCached(guild, uid, { preferFresh: true })) || (await guild.members.fetch(uid).catch(() => null));
  if (!member) {
    global.logger?.warn?.("[WEEKLY_CONTEST] finale premio: membro assente", uid);
    return null;
  }
  const hadRoleBefore = member.roles.cache.has(rid);
  await member.roles.add(rid).catch((err) => {
    global.logger?.warn?.("[WEEKLY_CONTEST] finale premio add ruolo:", uid, rid, err?.message || err);
  });
  const after = await getGuildMemberCached(guild, uid, { preferFresh: true });
  if (!after?.roles?.cache?.has(rid)) return null;
  return {
    userId: uid,
    roleId: rid,
    removeAt: new Date(Date.now() + durationMs),
    hadRoleBefore,
  };
}

async function processContestFinalePrizeRoleRemovals(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;
  const metas = await WeeklyContestMeta.find({ guildId: gid }).lean().catch(() => []);
  const now = Date.now();
  for (const meta of metas) {
    const raw = meta.finalePrizeRoleRemovals;
    if (!Array.isArray(raw) || !raw.length) continue;
    const keep = [];
    for (const entry of raw) {
      const removeAt = new Date(entry?.removeAt || 0).getTime();
      if (!Number.isFinite(removeAt)) {
        keep.push(entry);
        continue;
      }
      if (removeAt > now) {
        keep.push(entry);
        continue;
      }
      if (entry?.hadRoleBefore) continue;
      const uid = String(entry?.userId || "");
      const rid = String(entry?.roleId || "");
      if (!uid || !rid) continue;
      const member =
        (await getGuildMemberCached(guild, uid, { preferFresh: true })) || (await guild.members.fetch(uid).catch(() => null));
      if (!member) continue;
      if (!member.roles.cache.has(rid)) continue;
      let ok = true;
      await member.roles.remove(rid, "Contest sfondi: premio 30 giorni scaduto").catch((err) => {
        ok = false;
        global.logger?.warn?.("[WEEKLY_CONTEST] rimozione premio:", err?.message || err);
      });
      if (!ok) keep.push(entry);
    }
    if (keep.length !== raw.length) {
      await WeeklyContestMeta.updateOne({ _id: meta._id }, { $set: { finalePrizeRoleRemovals: keep } }).catch(() => null);
    }
  }
}

async function runContestFinalePrizeGrantJob(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  if (CONTEST_TEST_MODE) return;
  if (Date.now() <= getContestWindowMs().end) return;

  const meta0 = await WeeklyContestMeta.findOne({ guildId: gid, eventKey: EVENT_KEY_PRODUCTION }).lean().catch(() => null);
  if (isFinaleCategoryResolved(meta0, "mobile") && isFinaleCategoryResolved(meta0, "pc")) return;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;

  const totals = await aggregateFinaleCategoryVoteTotalsValid(guild, gid);

  const rankingMobile = await computeContestFinaleRankingForCategory(gid, "mobile", totals.mobile);
  const rankingPc = await computeContestFinaleRankingForCategory(gid, "pc", totals.pc);
  const primaryMap = buildFinalePrimaryCategoryMap(rankingMobile, rankingPc);
  const effectiveByCategory = {
    mobile: filterFinaleRankingForCategory(rankingMobile, "mobile", primaryMap),
    pc: filterFinaleRankingForCategory(rankingPc, "pc", primaryMap),
  };

  for (const category of ["mobile", "pc"]) {
    const metaFresh = await WeeklyContestMeta.findOne({ guildId: gid, eventKey: EVENT_KEY_PRODUCTION }).lean().catch(() => null);
    if (isFinaleCategoryResolved(metaFresh, category)) continue;

    const ranking = effectiveByCategory[category] || [];
    const catRemovals = [];
    const second = ranking[1];
    const third = ranking[2];

    if (second?.userId && isValidGuildUserId(gid, second.userId) && CONTEST_PRIZE_VIP_ROLE_ID) {
      const entry = await tryGrantContestFinaleTempRole(guild, second.userId, CONTEST_PRIZE_VIP_ROLE_ID, PRIZE_ROLE_DURATION_MS);
      if (entry) catRemovals.push(entry);
    }
    if (third?.userId && isValidGuildUserId(gid, third.userId) && CONTEST_PRIZE_DONATOR_ROLE_ID) {
      const entry = await tryGrantContestFinaleTempRole(
        guild,
        third.userId,
        CONTEST_PRIZE_DONATOR_ROLE_ID,
        PRIZE_ROLE_DURATION_MS,
      );
      if (entry) catRemovals.push(entry);
    }

    const metaUpdate = { $set: { [`finalePrizesResolvedCategories.${category}`]: true } };
    if (catRemovals.length) metaUpdate.$push = { finalePrizeRoleRemovals: { $each: catRemovals } };
    await WeeklyContestMeta.findOneAndUpdate(
      { guildId: gid, eventKey: EVENT_KEY_PRODUCTION },
      metaUpdate,
      { upsert: true, setDefaultsOnInsert: true },
    ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] finale meta:", err));

    global.logger?.info?.(
      `[WEEKLY_CONTEST] Finale ${EVENT_KEY_PRODUCTION} [${category}] (dedup): 2°=${second?.userId || "-"} (VIP), 3°=${third?.userId || "-"} (Donator), schedulati ${catRemovals.length} rollback ruolo.`,
    );
  }
}

let contestCronEveningTask = null;
let contestCronNoonTask = null;

function startWeeklyContestCron(client) {
  if (contestCronEveningTask) return { evening: contestCronEveningTask, noon: contestCronNoonTask };
  if (!MAIN_GUILD_ID || !CHANNEL_MOBILE_ID) return null;
  if (!IS_DISEGNI_CONTEST && !CHANNEL_PC_ID) return null;
  if (CONTEST_TEST_MODE) {
    global.logger?.warn?.(
      `[WEEKLY_CONTEST] TEST MODE attivo: scrivo su eventKey="${EVENT_KEY}" (sandbox), evento reale="${EVENT_KEY_PRODUCTION}". Finestre ignorate=${CONTEST_TEST_IGNORE_TIME_WINDOW}. Cron 21:00 ${TIME_ZONE}: bonus top-3 (attività 00–21 giorno corrente) disattivo in test; altri job attivi; prune votanti solo su evento reale.`,
    );
  }
  ensureContestChannelsHideReactionCounts(client).catch((err) =>
    global.logger?.warn?.("[WEEKLY_CONTEST] hide reaction counts:", err?.message || err),
  );
  contestCronEveningTask = cron.schedule(
    "0 21 * * *",
    () => {
      processContestFinalePrizeRoleRemovals(client).catch((err) =>
        global.logger?.error?.("[WEEKLY_CONTEST] cron rimozioni premio:", err),
      );
      runWeeklyContestNonMemberVoterPrune(client).catch((err) =>
        global.logger?.error?.("[WEEKLY_CONTEST] prune non membri:", err),
      );
      runDailyTopThreeBonusJob(client).catch((err) =>
        global.logger?.error?.("[WEEKLY_CONTEST] cron bonus:", err),
      );
      runContestFinalePrizeGrantJob(client).catch((err) =>
        global.logger?.error?.("[WEEKLY_CONTEST] cron finale premi:", err),
      );
    },
    { timezone: TIME_ZONE },
  );
  contestCronNoonTask = cron.schedule(
    "0 12 * * *",
    () => {
      runContestMemberSendChannelsOpenJob(client).catch((err) =>
        global.logger?.error?.("[WEEKLY_CONTEST] cron apertura Member contest:", err),
      );
    },
    { timezone: TIME_ZONE },
  );
  contestCronEveningTask.unref?.();
  contestCronNoonTask.unref?.();
  void runContestMemberSendChannelsOpenJob(client).catch((err) =>
    global.logger?.warn?.("[WEEKLY_CONTEST] apertura Member contest (catch-up avvio):", err?.message || err),
  );
  return { evening: contestCronEveningTask, noon: contestCronNoonTask };
}

const EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX = "evtSfondiLb:";

function sfondiRankLabel(index) {
  if (index === 0) return "<:VC_Podio1:1482694399283433582>";
  if (index === 1) return "<:VC_Podio2:1482694424411635712>";
  if (index === 2) return "<:VC_Podio3:1482694450806259744>";
  return `${index + 1}°`;
}

function addLegacyVotesFromArrays(totals, arr) {
  if (!Array.isArray(arr)) return;
  for (const id of arr) {
    const k = String(id);
    if (!/^\d{17,22}$/.test(k)) continue;
    totals[k] = (Number(totals[k]) || 0) + 1;
  }
}

async function getSfondiVoteTotalsForCategory(guildId, eventKey, category) {
  const isMobile = category === "mobile";
  const countField = isMobile ? "votesMobileCounts" : "votesPcCounts";
  const bundle = await getContestBundleLean(guildId, eventKey);
  const votersObj = bundle?.voters && typeof bundle.voters === "object" ? bundle.voters : {};
  const docs = Object.values(votersObj);
  const totals = Object.create(null);
  for (const doc of docs) {
    const bag = doc[countField];
    if (bag && typeof bag === "object" && !Array.isArray(bag)) {
      for (const [k, v] of Object.entries(bag)) {
        const n = Math.floor(Number(v));
        if (!Number.isFinite(n) || n <= 0) continue;
        totals[k] = (Number(totals[k]) || 0) + n;
      }
    }
    if (isMobile) {
      addLegacyVotesFromArrays(totals, doc.votesMobile);
      addLegacyVotesFromArrays(totals, doc.votesMobileSparkle);
    } else {
      addLegacyVotesFromArrays(totals, doc.votesPc);
      addLegacyVotesFromArrays(totals, doc.votesPcSparkle);
    }
  }
  return totals;
}

function buildSfondiClassificaButtonRow(activeCategory, guildIdForLink) {
  const gid = String(guildIdForLink || IDs.guilds?.main || "").trim();
  if (!CHANNEL_PC_ID) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Canale submission")
        .setEmoji("🎨")
        .setURL(`https://discord.com/channels/${gid}/${CHANNEL_MOBILE_ID}`),
    );
  }
  const mobileOn = activeCategory !== "pc";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX}mobile`)
      .setLabel("Mobile")
      .setEmoji("📱")
      .setStyle(mobileOn ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX}pc`)
      .setLabel("PC")
      .setEmoji("🖥️")
      .setStyle(!mobileOn ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

async function buildSfondiClassificaPayload(guild, categoryMode, eventKeyOverride = null) {
  const guildId = String(guild?.id || "");
  const eventKey = String(eventKeyOverride != null ? eventKeyOverride : EVENT_KEY).trim();
  const cat = !CHANNEL_PC_ID ? "mobile" : categoryMode === "pc" ? "pc" : "mobile";
  const rowButtons = buildSfondiClassificaButtonRow(cat, guildId);

  if (!guildId) {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription("Impossibile mostrare la classifica (guild mancante).");
    return { embeds: [embed], components: [rowButtons] };
  }

  const totals = await getSfondiVoteTotalsForCategory(guildId, eventKey, cat);
  const bundleLb = await getContestBundleLean(guildId, eventKey);
  const subMap = normalizeSubmissionsCategoryMap(bundleLb?.submissions?.[cat]);
  const subsRaw = Object.entries(subMap).map(([userId, messageId]) => ({
    userId: String(userId || ""),
    messageId: String(messageId || ""),
  }));
  const presenceRows = await Promise.all(
    subsRaw.map(async (s) => {
      const uid = String(s.userId || "").trim();
      if (!/^\d{17,22}$/.test(uid)) return { ok: false, s: null, uid: "" };
      const mem = await getGuildMemberCached(guild, uid);
      return { ok: Boolean(mem), s, uid };
    }),
  );
  const subs = presenceRows.filter((r) => r.ok && r.s).map((r) => r.s);
  const leaverIds = [
    ...new Set(presenceRows.filter((r) => !r.ok && r.uid && r.s).map((r) => String(r.uid))),
  ];
  if (leaverIds.length && guild?.client && String(guild.id) === contestGuildId()) {
    void Promise.all(
      leaverIds.map((uid) => removeContestSfondiSubmissionsOnMemberLeave(guild.client, guildId, uid).catch(() => {})),
    ).catch(() => {});
  }

  const channelId = cat === "mobile" ? CHANNEL_MOBILE_ID : CHANNEL_PC_ID;
  const rows = subs
    .map((s) => {
      const messageId = String(s.messageId);
      return {
        messageId,
        userId: String(s.userId || ""),
        votes: Math.max(0, Math.floor(Number(totals[messageId] || 0))),
      };
    })
    .sort((a, b) => b.votes - a.votes || a.messageId.localeCompare(b.messageId))
    .slice(0, 10);

  const lines = [];
  rows.forEach((row, index) => {
    const author = row.userId ? `<@${row.userId}>` : "—";
    const jump =
      channelId && row.messageId
        ? `[messaggio](https://discord.com/channels/${guildId}/${channelId}/${row.messageId})`
        : "—";
    lines.push(`${sfondiRankLabel(index)} ${author} — **${row.votes}** · ${jump}`);
  });
  if (!lines.length) {
    lines.push("Nessun voto in questa categoria (o submission ancora assenti).");
  }

  const titleSuffix = !CHANNEL_PC_ID ? "Contest disegni" : cat === "mobile" ? "Sfondi mobile" : "Sfondi PC";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL?.({ size: 128 }) || undefined,
    })
    .setTitle(`Classifica evento · ${titleSuffix}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Chiave evento: ${eventKey}` });

  return { embeds: [embed], components: [rowButtons] };
}

function legacyVoteArrayContainsMid(arr, mid) {
  const m = String(mid || "");
  if (!m || !Array.isArray(arr)) return false;
  return arr.some((x) => String(x) === m);
}

const THREAD_DELETE_REASON = "Contest sfondi: autore uscito dal server";

async function deleteContestSubmissionMessageAndThread(guild, channel, msgId) {
  const mid = String(msgId || "");
  if (!guild || !channel?.messages?.fetch || !/^\d{17,22}$/.test(mid)) return;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (msg) {
    const fromMessage = msg.thread;
    const fromFlag =
      !fromMessage && msg.hasThread ? await guild.channels.fetch(mid).catch(() => null) : null;
    const thread = fromMessage || (fromFlag?.isThread?.() ? fromFlag : null);
    if (thread?.isThread?.()) await thread.delete(THREAD_DELETE_REASON).catch(() => {});
    await msg.delete().catch(() => {});
    return;
  }
  const orphan = await guild.channels.fetch(mid).catch(() => null);
  if (orphan?.isThread?.()) await orphan.delete(THREAD_DELETE_REASON).catch(() => {});
}

async function deleteContestSubmissionMessages(guild, mobileMid, pcMid) {
  if (!guild) return;
  const pairs = [];
  if (CHANNEL_MOBILE_ID && mobileMid) pairs.push([CHANNEL_MOBILE_ID, String(mobileMid)]);
  if (CHANNEL_PC_ID && pcMid) pairs.push([CHANNEL_PC_ID, String(pcMid)]);
  for (const [chId, msgId] of pairs) {
    if (!/^\d{17,22}$/.test(String(msgId))) continue;
    const ch = await getGuildChannelCached(guild, chId).catch(() => null);
    await deleteContestSubmissionMessageAndThread(guild, ch, msgId);
  }
}

async function removeContestSfondiSubmissionsOnMemberLeave(client, guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!client || !gid || !uid || gid !== contestGuildId()) return;
  if (!isValidGuildUserId(gid, uid)) return;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  const eventKeys = Array.from(
    new Set(
      [EVENT_KEY_PRODUCTION, EVENT_KEY_TEST, SFONDI_EVENT_KEY_PRODUCTION, DISEGNI_EVENT_KEY_PRODUCTION]
        .map((k) => String(k || "").trim())
        .filter(Boolean),
    ),
  );

  for (const eventKey of eventKeys) {
    const bundle = await getContestBundleLean(gid, eventKey);
    if (!bundle) continue;

    const mobMap = normalizeSubmissionsCategoryMap(bundle.submissions?.mobile);
    const pcMap = normalizeSubmissionsCategoryMap(bundle.submissions?.pc);
    const hadMobile = Object.prototype.hasOwnProperty.call(mobMap, uid);
    const hadPc = Object.prototype.hasOwnProperty.call(pcMap, uid);
    const mobileMid = hadMobile ? String(mobMap[uid] || "").trim() : "";
    const pcMid = hadPc ? String(pcMap[uid] || "").trim() : "";
    const midOk = (m) => /^\d{17,22}$/.test(String(m || ""));
    const mids = Array.from(new Set([mobileMid, pcMid].filter(midOk)));

    const votersObj = bundle.voters && typeof bundle.voters === "object" && !Array.isArray(bundle.voters) ? bundle.voters : {};
    const voterIds = Object.keys(votersObj);

    const $unset = {};
    if (hadMobile) $unset[`submissions.mobile.${uid}`] = "";
    if (hadPc) $unset[`submissions.pc.${uid}`] = "";
    if (votersObj[uid]) $unset[`voters.${uid}`] = "";
    for (const mid of mids) {
      $unset[`submissionMessageIndex.${mid}`] = "";
    }
    for (const vid of voterIds) {
      if (!vid || vid === uid) continue;
      const leaf = votersObj[vid] || {};
      const mCounts = leaf.votesMobileCounts && typeof leaf.votesMobileCounts === "object" && !Array.isArray(leaf.votesMobileCounts) ? leaf.votesMobileCounts : {};
      const pCounts = leaf.votesPcCounts && typeof leaf.votesPcCounts === "object" && !Array.isArray(leaf.votesPcCounts) ? leaf.votesPcCounts : {};
      for (const mid of mids) {
        if (Object.prototype.hasOwnProperty.call(mCounts, mid)) $unset[`voters.${vid}.votesMobileCounts.${mid}`] = "";
        if (Object.prototype.hasOwnProperty.call(pCounts, mid)) $unset[`voters.${vid}.votesPcCounts.${mid}`] = "";
      }
    }

    const $pullAll = {};
    for (const vid of voterIds) {
      if (!vid || vid === uid) continue;
      const leaf = votersObj[vid] || {};
      const pm = mids.filter((mid) => legacyVoteArrayContainsMid(leaf.votesMobile, mid));
      if (pm.length) $pullAll[`voters.${vid}.votesMobile`] = pm;
      const pms = mids.filter((mid) => legacyVoteArrayContainsMid(leaf.votesMobileSparkle, mid));
      if (pms.length) $pullAll[`voters.${vid}.votesMobileSparkle`] = pms;
      const pp = mids.filter((mid) => legacyVoteArrayContainsMid(leaf.votesPc, mid));
      if (pp.length) $pullAll[`voters.${vid}.votesPc`] = pp;
      const pps = mids.filter((mid) => legacyVoteArrayContainsMid(leaf.votesPcSparkle, mid));
      if (pps.length) $pullAll[`voters.${vid}.votesPcSparkle`] = pps;
    }

    const hasUnset = Object.keys($unset).length > 0;
    const hasPullAll = Object.keys($pullAll).length > 0;
    if (!hasUnset && !hasPullAll) continue;

    const update = {};
    if (hasUnset) update.$unset = $unset;
    if (hasPullAll) update.$pullAll = $pullAll;
    await WeeklyContestBundle.updateOne({ guildId: gid, eventKey }, update).catch((err) => {
      global.logger?.warn?.("[WEEKLY_CONTEST] leave cleanup bundle:", err?.message || err);
    });

    await deleteContestSubmissionMessages(
      guild,
      midOk(mobileMid) && hadMobile ? mobileMid : "",
      midOk(pcMid) && hadPc ? pcMid : "",
    );
  }
}

/** Budget voti weekly contest (base per ruoli + bonus giornalieri). Ritorna voti ancora assegnabili per categoria. */
function contestVoteRemainingSlots(member, voterLean) {
  const base = resolveBaseVoteCap(member);
  const bonusTotal = totalBonusSlotsForContest(voterLean || {});
  const m = mobileVoteCountUnified(voterLean || {});
  const p = pcVoteCountUnified(voterLean || {});
  if (IS_DISEGNI_CONTEST) {
    const maxMobile = base + bonusTotal;
    return {
      baseMax: base,
      bonusTotal,
      remainingMobile: Math.max(0, maxMobile - m),
      remainingPc: 0,
    };
  }
  const maxMobile = base + Math.max(0, bonusTotal - Math.max(0, p - base));
  const maxPc = base + Math.max(0, bonusTotal - Math.max(0, m - base));
  return {
    baseMax: base,
    bonusTotal,
    remainingMobile: Math.max(0, maxMobile - m),
    remainingPc: Math.max(0, maxPc - p),
  };
}

module.exports = {
  EVENT_KEY,
  EVENT_KEY_PRODUCTION,
  ACTIVE_CONTEST_PROFILE,
  IS_DISEGNI_CONTEST,
  SFONDI_EVENT_KEY_PRODUCTION,
  DISEGNI_EVENT_KEY_PRODUCTION,
  CONTEST_TEST_MODE,
  EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX,
  buildSfondiClassificaPayload,
  handleWeeklyContestSubmissionMessage,
  handleWeeklyContestVoteButton,
  buildWeeklyContestVoteRow,
  ensureContestChannelsHideReactionCounts,
  tryStripContestSubmissionReaction,
  startWeeklyContestCron,
  runContestMemberSendChannelsOpenJob,
  runDailyTopThreeBonusJob,
  replayContestDailyBonusAnnounce,
  computeDailyBonusTopThreeWinners,
  runWeeklyContestNonMemberVoterPrune,
  runContestFinalePrizeGrantJob,
  processContestFinalePrizeRoleRemovals,
  isContestActiveNow,
  removeContestSfondiSubmissionsOnMemberLeave,
  contestVoteRemainingSlots,
};