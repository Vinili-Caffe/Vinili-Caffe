const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { addExpWithLevel, shouldIgnoreExpForMember, isLevelExpGuild } = require("./expService");
const { isExcludedActivityChannel } = require("./activityService");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { matchesWelcomeGreetingExpMessage, resolveWelcomeGreetingSessionId } = require("../../Utils/Message/officialMessageCommunityHandlers");
const { scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const TIME_ZONE = "Europe/Rome";
const FIRST_MESSAGE_DAILY_EXP = 150;
const WELCOME_GREETING_EXP = 30;
const WELCOME_GREETING_EXP_NOTICE_TTL_MS = 10 * 1000;
const FIRST_MESSAGE_DOC_TYPE = SITE_DOCUMENT_TYPE.COMMUNITY_FIRST_MESSAGE_DAILY;
const WELCOME_GREETING_DOC_TYPE = SITE_DOCUMENT_TYPE.COMMUNITY_WELCOME_GREETING_EXP;
const EXP_EMOJI = "<:VC_EXP:1482534670896730143>";

function buildExpBonusChatContent(message, amount, variant) {
  const mention = message.author ? `<@${message.author.id}>` : "";
  const expLine = `${EXP_EMOJI} **${Math.max(0, Math.floor(Number(amount) || 0))} exp** guadagnati!`;
  if (variant === "first_message_server_daily") {
    return [
      "<a:VC_ThankYou:1330186319673950401> **Sei stato/a il primo a scrivere oggi nel server!**",
      expLine,
      mention,
    ].filter(Boolean).join("\n");
  }
  return [
    "<a:VC_ThankYou:1330186319673950401> **Grazie per il benvenuto!**",
    expLine,
    mention,
  ].filter(Boolean).join("\n");
}

async function sendExpBonusChatNotice(message, amount, variant) {
  const channel = message.channel;
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") return;
  const content = buildExpBonusChatContent(message, amount, variant).trim();
  if (!content) return;
  let sent = null;
  try {
    sent = await channel.send({
      content,
      reply: { messageReference: message.id, failIfNotExists: false },
    });
  } catch {
    sent = await channel.send({ content }).catch(() => null);
  }
  if (sent && variant === "welcome_greeting") {
    scheduleMessageDeletion(sent, WELCOME_GREETING_EXP_NOTICE_TTL_MS);
  }
}

function getRomeDateKey(date = new Date()) {
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

function canEarnCommunityMessageExp(message) {
  if (!message?.guild || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;
  if (!isViniliFullFeatureGuild(message.guild.id)) return false;
  if (!isLevelExpGuild(message.guild.id)) return false;
  if (isExcludedActivityChannel(message.channel)) return false;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return false;
  return true;
}

async function findServerFirstMessageWinner(guildId, dateKey) {
  const g = String(guildId || "").trim();
  const dk = String(dateKey || "").trim();
  if (!g || !dk) return null;
  const doc = await SiteDocument.findOne({
    docType: FIRST_MESSAGE_DOC_TYPE,
    guildId: g,
    dedupeKey: dk,
  })
    .select("userId")
    .lean()
    .catch(() => null);
  const winnerId = String(doc?.userId || "").trim();
  return winnerId || null;
}

async function releaseServerFirstMessageOfDayClaim(guildId, dateKey) {
  const g = String(guildId || "").trim();
  const dk = String(dateKey || "").trim();
  if (!g || !dk) return;
  await SiteDocument.deleteOne({
    docType: FIRST_MESSAGE_DOC_TYPE,
    guildId: g,
    dedupeKey: dk,
  }).catch(() => null);
}

async function tryClaimServerFirstMessageOfDayExp(guildId, userId, dateKey) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  const dk = String(dateKey || "").trim();
  if (!isValidGuildUserId(g, u) || !dk) return false;
  const existingWinner = await findServerFirstMessageWinner(g, dk);
  if (existingWinner) return false;
  try {
    await SiteDocument.create({
      docType: FIRST_MESSAGE_DOC_TYPE,
      guildId: g,
      dedupeKey: dk,
      userId: u,
      status: "won",
    });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    global.logger?.warn?.("[community-exp-bonus] first message claim:", err?.message || err);
    return false;
  }
}

async function tryClaimWelcomeGreetingExp(guildId, userId, sessionId) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  const sid = Math.floor(Number(sessionId) || 0);
  if (!isValidGuildUserId(g, u) || sid < 1) return false;
  try {
    await SiteDocument.create({
      docType: WELCOME_GREETING_DOC_TYPE,
      guildId: g,
      userId: u,
      dedupeKey: String(sid),
      status: "claimed",
    });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    global.logger?.warn?.("[community-exp-bonus] welcome greeting claim:", err?.message || err);
    return false;
  }
}

async function awardCommunityExp(message, amount, source) {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt < 1) return false;
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  const ignored = await shouldIgnoreExpForMember({
    guildId: message.guild.id,
    member,
    channelId: message.channel?.id || message.channelId || null,
  });
  if (ignored) return false;
  const result = await addExpWithLevel(message.guild, message.author.id, amt, false, true, { source: source || "community_bonus" });
  return result != null;
}

async function handleMessageCommunityExpBonuses(message) {
  if (!canEarnCommunityMessageExp(message)) return;
  const dateKey = getRomeDateKey(new Date());
  if (await tryClaimServerFirstMessageOfDayExp(message.guild.id, message.author.id, dateKey)) {
    const awarded = await awardCommunityExp(message, FIRST_MESSAGE_DAILY_EXP, "first_message_server_daily");
    if (!awarded) {
      await releaseServerFirstMessageOfDayClaim(message.guild.id, dateKey);
    } else {
      await sendExpBonusChatNotice(message, FIRST_MESSAGE_DAILY_EXP, "first_message_server_daily");
    }
  }
  if (matchesWelcomeGreetingExpMessage(message)) {
    const sessionId = resolveWelcomeGreetingSessionId(message);
    if (sessionId < 1) {
      global.logger?.warn?.("[community-exp-bonus] welcome greeting exp match without active session:", {
        guildId: String(message.guild?.id || ""),
        channelId: String(message.channelId || ""),
        userId: String(message.author?.id || ""),
      });
      return;
    }
    if (await tryClaimWelcomeGreetingExp(message.guild.id, message.author.id, sessionId)) {
      const awarded = await awardCommunityExp(message, WELCOME_GREETING_EXP, "welcome_greeting");
      if (awarded) await sendExpBonusChatNotice(message, WELCOME_GREETING_EXP, "welcome_greeting");
    }
  }
}

module.exports = { FIRST_MESSAGE_DAILY_EXP, WELCOME_GREETING_EXP, getRomeDateKey, handleMessageCommunityExpBonuses, tryClaimServerFirstMessageOfDayExp, tryClaimWelcomeGreetingExp, findServerFirstMessageWinner };