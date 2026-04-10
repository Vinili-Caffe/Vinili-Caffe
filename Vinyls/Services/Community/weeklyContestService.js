const cron = require("node-cron");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ThreadAutoArchiveDuration,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { loadDailyRows } = require("./activityService");
const { VOICE_EXP_PER_MINUTE } = require("./expService");
const { WeeklyContestSubmission, WeeklyContestVoter, WeeklyContestMeta } = require("../../Schemas/Community/weeklyContestSchemas");
const { getClientChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const TIME_ZONE = "Europe/Rome";
const MAIN_GUILD_ID = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();

function parseEnvFlag(raw, defaultWhenEmpty = false) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultWhenEmpty;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const EVENT_KEY_PRODUCTION = String(process.env.WEEKLY_CONTEST_SFONDI_EVENT_KEY || "sfondi-2026-04-13").trim();
const CONTEST_TEST_MODE = parseEnvFlag(process.env.WEEKLY_CONTEST_SFONDI_TEST_MODE, false);
const EVENT_KEY_TEST = String(process.env.WEEKLY_CONTEST_SFONDI_TEST_EVENT_KEY || "sfondi-sandbox").trim();
const EVENT_KEY = CONTEST_TEST_MODE ? EVENT_KEY_TEST : EVENT_KEY_PRODUCTION;
const CONTEST_TEST_IGNORE_TIME_WINDOW =
  CONTEST_TEST_MODE && parseEnvFlag(process.env.WEEKLY_CONTEST_SFONDI_TEST_IGNORE_TIME_WINDOW, true);

const CONTEST_FIRST_DAY = String(process.env.WEEKLY_CONTEST_SFONDI_FIRST_DAY || "2026-04-13").trim();
const CONTEST_LAST_DAY = String(process.env.WEEKLY_CONTEST_SFONDI_LAST_DAY || "2026-04-19").trim();

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

const CONTEST_WINDOW_START_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_SFONDI_START_MS) ??
  createUtcFromRomeLocal(2026, 4, 13, 12, 0, 0).getTime();
const CONTEST_WINDOW_END_MS =
  parseOptionalContestEpochMs(process.env.WEEKLY_CONTEST_SFONDI_END_MS) ??
  createUtcFromRomeLocal(2026, 4, 19, 21, 0, 0).getTime();

function getContestWindowMs() {
  return { start: CONTEST_WINDOW_START_MS, end: CONTEST_WINDOW_END_MS };
}

const CHANNEL_MOBILE_ID = String(IDs.channels?.contestSfondiMobile || "").trim();
const CHANNEL_PC_ID = String(IDs.channels?.contestSfondiPc || "").trim();
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
  [IDs.roles?.VIP, IDs.roles?.Donator, IDs.roles?.ServerBooster].filter(Boolean).map((id) => String(id)),
);

const CHANNEL_TO_CATEGORY = new Map(
  [
    [CHANNEL_MOBILE_ID, "mobile"],
    [CHANNEL_PC_ID, "pc"],
  ].filter(([id]) => id),
);

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

function addRomeDays(dateKey, deltaDays) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays);
  return getContestDayKey(new Date(utc));
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

function attachmentIsContestImageOrVideo(attachment) {
  const ct = String(attachment?.contentType || "");
  return ct.startsWith("image/") || ct.startsWith("video/");
}

function messageHasContestMediaAttachment(message) {
  const attachments = [...(message.attachments?.values?.() || [])];
  return attachments.some(attachmentIsContestImageOrVideo);
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
  if (hasAnyRole(member, STAFF_ROLE_IDS)) return 2;
  if (hasAnyRole(member, PREMIUM_ROLE_IDS)) return 2;
  return 1;
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

function canAddVoteToCategory(voterLean, category, baseMax, todayKey) {
  const m = mobileVoteCountUnified(voterLean);
  const p = pcVoteCountUnified(voterLean);
  const bonus = bonusSlotsForDay(voterLean, todayKey);
  const nextM = category === "mobile" ? m + 1 : m;
  const nextP = category === "pc" ? p + 1 : p;
  return extraVotesUsed(nextM, nextP, baseMax) <= bonus;
}

function buildWeeklyContestVoteRow(messageId) {
  const mid = String(messageId || "");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wcVote:inc:${mid}`)
      .setLabel("+1")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wcVote:dec:${mid}`)
      .setLabel("\u22121")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function ensureContestChannelsHideReactionCounts(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild?.roles?.everyone?.id) return;
  const everyoneId = guild.roles.everyone.id;
  for (const cid of [CHANNEL_MOBILE_ID, CHANNEL_PC_ID]) {
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

async function denySendInContestChannel(channel, userId) {
  const uid = String(userId || "");
  if (!channel?.permissionOverwrites?.edit || !uid) return;
  await channel.permissionOverwrites.edit(uid, { SendMessages: false }).catch((err) => {
    global.logger?.warn?.("[WEEKLY_CONTEST] deny SendMessages:", err?.message || err);
  });
}

async function migrateVoterToCountMapsIfNeeded(doc) {
  if (!doc?._id) return;
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
  await WeeklyContestVoter.updateOne(
    { _id: doc._id },
    {
      $set: { votesMobileCounts: mMap, votesPcCounts: pMap },
      $unset: { votesMobile: "", votesMobileSparkle: "", votesPc: "", votesPcSparkle: "" },
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
    const sub = await WeeklyContestSubmission.findOne({ guildId, eventKey: EVENT_KEY, messageId })
      .select("_id")
      .lean()
      .catch(() => null);
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

  const messageId = String(interaction.message.id || "");
  if (messageId !== parsed.messageId) {
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
  if (!isValidGuildUserId(guildId, voterId)) return true;

  const submission = await WeeklyContestSubmission.findOne({
    guildId,
    eventKey: EVENT_KEY,
    messageId,
  })
    .lean()
    .catch(() => null);
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
        "<:VC_Attention:1482534443632558151> **Non puoi votare per te stesso:** non si possono dare o togliere voti sul **proprio** sfondo.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  const member = await getGuildMemberCached(interaction.guild, voterId);
  const baseMax = resolveBaseVoteCap(member);
  const todayKey = getContestDayKey();
  const countPath = countsPathForCategory(category);
  const incPath = `${countPath}.${messageId}`;

  const voterDoc = await WeeklyContestVoter.findOne({ guildId, eventKey: EVENT_KEY, voterId }).catch(() => null);
  if (voterDoc) {
    const plain = typeof voterDoc.toObject === "function" ? voterDoc.toObject() : voterDoc;
    await migrateVoterToCountMapsIfNeeded(plain);
  }

  const voterLean = await WeeklyContestVoter.findOne({ guildId, eventKey: EVENT_KEY, voterId })
    .lean()
    .catch(() => null);

  if (parsed.dir === "dec") {
    const res = await WeeklyContestVoter.updateOne(
      { guildId, eventKey: EVENT_KEY, voterId, [incPath]: { $gt: 0 } },
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
  if (!canAddVoteToCategory(leanForCheck, category, baseMax, todayKey)) {
    await safeEditReply(interaction, {
      content: "Hai esaurito i voti disponibili in questa categoria.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  await WeeklyContestVoter.findOneAndUpdate(
    { guildId, eventKey: EVENT_KEY, voterId },
    { $inc: { [incPath]: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const fresh = await WeeklyContestVoter.findOne({ guildId, eventKey: EVENT_KEY, voterId })
    .lean()
    .catch(() => null);
  const fm = mobileVoteCountUnified(fresh);
  const fp = pcVoteCountUnified(fresh);
  if (extraVotesUsed(fm, fp, baseMax) > bonusSlotsForDay(fresh, todayKey)) {
    await WeeklyContestVoter.updateOne(
      { guildId, eventKey: EVENT_KEY, voterId, [incPath]: { $gt: 0 } },
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

    const existing = await WeeklyContestSubmission.findOne({
      guildId,
      eventKey: EVENT_KEY,
      category,
      userId,
    })
      .select("messageId")
      .lean()
      .catch(() => null);

    if (existing?.messageId && String(existing.messageId) !== String(message.id)) {
      const oldAlive = await message.channel.messages.fetch(existing.messageId).catch(() => null);
      if (oldAlive) {
        const warn = await message.channel
          .send({
            content: `${message.author} Hai già inviato **uno sfondo** in questa categoria.`,
            allowedMentions: { users: [message.author.id] },
          })
          .catch(() => null);
        await message.delete().catch(() => {});
        if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
        return true;
      }
    }

    await WeeklyContestSubmission.findOneAndUpdate(
      { guildId, eventKey: EVENT_KEY, category, userId },
      { $set: { messageId: String(message.id) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch((err) => {
      global.logger?.error?.("[WEEKLY_CONTEST] submission upsert:", err);
    });

    const row = buildWeeklyContestVoteRow(message.id);
    await message
      .reply({
        components: [row],
        allowedMentions: { repliedUser: false },
      })
      .catch((err) => {
        global.logger?.warn?.("[WEEKLY_CONTEST] impossibile inviare messaggio pulsanti voto:", err?.message || err);
      });
    await message.reactions.removeAll().catch(() => {});

    if (!message.hasThread) {
      const label = String(message.author?.globalName || message.author?.username || "autore").trim() || "autore";
      const name = `Commenti · ${label}`.slice(0, 100);
      await message.startThread({
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

  const docs = await WeeklyContestVoter.find({ guildId: gid, eventKey: EVENT_KEY_PRODUCTION })
    .select(
      "voterId votesMobileCounts votesPcCounts votesMobile votesMobileSparkle votesPc votesPcSparkle",
    )
    .lean()
    .catch(() => []);

  for (const doc of docs) {
    const voterId = String(doc?.voterId || "");
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

    await WeeklyContestVoter.updateOne(
      { guildId: gid, eventKey: EVENT_KEY_PRODUCTION, voterId },
      {
        $set: { votesMobileCounts: {}, votesPcCounts: {} },
        $unset: { votesMobile: "", votesMobileSparkle: "", votesPc: "", votesPcSparkle: "" },
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

function formatDailyBonusRankLine(index, userId, textCount, voiceExp) {
  const medal = TROPHY_LABELS_BONUS[index] || "[#]";
  return `${medal} <@${userId}> <a:VC_Arrow:1482706699365257397> **${textCount}** messaggi · **${voiceExp}** exp`;
}

async function sendContestDailyBonusAnnounce(client, guild, { yesterdayKey, todayKey, winners }) {
  if (!CHANNEL_BONUS_ANNOUNCE_ID || !winners?.length) return;
  const channel =
    client.channels.cache.get(CHANNEL_BONUS_ANNOUNCE_ID) ||
    (await getClientChannelCached(client, CHANNEL_BONUS_ANNOUNCE_ID, { ttlMs: 60_000 }).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[WEEKLY_CONTEST] canale annuncio bonus non trovato:", CHANNEL_BONUS_ANNOUNCE_ID);
    return;
  }
  const lines = winners.map((w, i) => formatDailyBonusRankLine(i, w.userId, w.textCount, w.voiceExp));
  const infoLine = `<:VC_Leaderboard:1482534806314287387> // Più attivi ieri.`;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        infoLine,
        "",
        `<a:VC_HeartsPink:1468685897389052008> • **Top 3 attività:**`,
        ...lines,
        "",
        `<a:VC_Winner:1482535294757507255> Avete **+1 voto** extra da usare oggi (**${todayKey}**) nel contest sfondi.`,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null);
  const buttons = new ActionRowBuilder().addComponents(
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
  );
  const head = MEMBER_ROLE_ID
    ? `<@&${MEMBER_ROLE_ID}>\n<a:VC_Winner:1482535294757507255> **Bonus voto contest** — i più attivi di ieri.`
    : `<a:VC_Winner:1482535294757507255> **Bonus voto contest** — i più attivi di ieri.`;
  try {
    await channel.send({ content: head, embeds: [embed], components: [buttons] });
  } catch (err) {
    global.logger?.error?.("[WEEKLY_CONTEST] annuncio bonus:", err?.message || err);
  }
}

async function runDailyTopThreeBonusJob(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  if (CONTEST_TEST_MODE) return;
  if (!CHANNEL_MOBILE_ID || !CHANNEL_PC_ID) return;

  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;

  const todayKey = getContestDayKey();
  const yesterdayKey = addRomeDays(todayKey, -1);
  if (!yesterdayKey || !isContestRomeDayKey(todayKey)) return;

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

  const rawRows = await loadDailyRows(gid, [yesterdayKey]).catch(() => []);
  const scored = rawRows.map((r) => {
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
    winners.push({ userId: row.userId, textCount: row.textCount, voiceExp: row.voiceExp });
    if (winners.length >= 3) break;
  }

  const topIds = winners.map((w) => w.userId);
  for (const voterId of topIds) {
    if (!isValidGuildUserId(gid, voterId)) continue;
    await WeeklyContestVoter.findOneAndUpdate(
      { guildId: gid, eventKey: EVENT_KEY_PRODUCTION, voterId },
      { $set: { [`bonusSlots.${todayKey}`]: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch((err) => global.logger?.error?.("[WEEKLY_CONTEST] bonus grant:", err));
  }

  global.logger?.info?.(`[WEEKLY_CONTEST] Bonus giornaliero ${todayKey}: ${topIds.length} utenti (attività ${yesterdayKey}, combinata).`);

  if (winners.length) {
    await sendContestDailyBonusAnnounce(client, guild, { yesterdayKey, todayKey, winners });
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

async function aggregateFinaleCategoryVoteTotalsValid(guild, guildId) {
  const gid = String(guildId || "");
  const mobileMerged = new Map();
  const pcMerged = new Map();
  const voters = await WeeklyContestVoter.find({ guildId: gid, eventKey: EVENT_KEY }).lean().catch(() => []);
  for (const v of voters) {
    const voterId = String(v?.voterId || "");
    if (!voterId) continue;
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
  const subs = await WeeklyContestSubmission.find({ guildId: gid, eventKey: EVENT_KEY, category: cat })
    .lean()
    .catch(() => []);
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

let contestCronTask = null;

function startWeeklyContestCron(client) {
  if (contestCronTask) return contestCronTask;
  if (!MAIN_GUILD_ID || !CHANNEL_MOBILE_ID) return null;
  if (CONTEST_TEST_MODE) {
    global.logger?.warn?.(
      `[WEEKLY_CONTEST] TEST MODE attivo: scrivo su eventKey="${EVENT_KEY}" (sandbox), evento reale="${EVENT_KEY_PRODUCTION}". Finestre ignorate=${CONTEST_TEST_IGNORE_TIME_WINDOW}. Cron bonus/finale disattivi; prune votanti solo su evento reale.`,
    );
  }
  ensureContestChannelsHideReactionCounts(client).catch((err) =>
    global.logger?.warn?.("[WEEKLY_CONTEST] hide reaction counts:", err?.message || err),
  );
  contestCronTask = cron.schedule(
    "20 0 * * *",
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
  contestCronTask.unref?.();
  return contestCronTask;
}

module.exports = {
  EVENT_KEY,
  EVENT_KEY_PRODUCTION,
  CONTEST_TEST_MODE,
  handleWeeklyContestSubmissionMessage,
  handleWeeklyContestVoteButton,
  buildWeeklyContestVoteRow,
  ensureContestChannelsHideReactionCounts,
  tryStripContestSubmissionReaction,
  startWeeklyContestCron,
  runDailyTopThreeBonusJob,
  runWeeklyContestNonMemberVoterPrune,
  runContestFinalePrizeGrantJob,
  processContestFinalePrizeRoleRemovals,
  isContestActiveNow,
};