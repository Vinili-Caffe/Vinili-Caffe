const mongoose = require("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { addExpWithLevel, shouldIgnoreExpForMember, isLevelExpGuild } = require("./expService");
const { isExcludedActivityChannel } = require("./activityService");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const {
  matchesWelcomeGreetingForExp,
  resolveWelcomeGreetingSessionId,
  resolveWelcomeGreetingSessionIdAsync,
  ensureWelcomeContextHydratedForGreeting,
  isMessageInWelcomeExpChannel,
  normalizeWelcomeJoinTargetUserId,
  isValidWelcomeJoinTargetUserId,
} = require("../../Utils/Message/officialMessageCommunityHandlers");
const { scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const TIME_ZONE = "Europe/Rome";
const FIRST_MESSAGE_DAILY_EXP = 150;
const WELCOME_GREETING_EXP = 30;
const WELCOME_GREETING_EXP_NOTICE_TTL_MS = 12 * 1000;
const WELCOME_GREETING_AWARD_RETRY_DELAYS_MS = [0, 800, 2000, 4000, 6000];
const WELCOME_GREETING_BACKUP_DELAY_MS = 2500;
const WELCOME_GREETING_DB_WAIT_MS = 3000;
const welcomeExpAwardChainByGuildId = new Map();
const welcomeGreetingNoticeByMessageId = new Map();
const WELCOME_GREETING_NOTICE_DEDUPE_MS = 120_000;

function welcomeGreetingDedupeKey(joinTargetUserId, welcomerUserId) {
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  const welcomerId = String(welcomerUserId || "").trim();
  if (!targetId || !welcomerId) return "";
  return `${targetId}:${welcomerId}`;
}

function runWelcomeExpAwardSerialized(guildId, fn) {
  const key = String(guildId || "").trim();
  if (!key) return fn();
  const prev = welcomeExpAwardChainByGuildId.get(key) || Promise.resolve();
  const run = prev.catch(() => null).then(() => fn());
  welcomeExpAwardChainByGuildId.set(key, run);
  return run.finally(() => {
    if (welcomeExpAwardChainByGuildId.get(key) === run) welcomeExpAwardChainByGuildId.delete(key);
  });
}
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

function shouldSendWelcomeGreetingNotice(message) {
  const mid = String(message?.id || "").trim();
  if (!mid) return true;
  if (welcomeGreetingNoticeByMessageId.has(mid)) return false;
  welcomeGreetingNoticeByMessageId.set(mid, Date.now());
  setTimeout(() => welcomeGreetingNoticeByMessageId.delete(mid), WELCOME_GREETING_NOTICE_DEDUPE_MS).unref?.();
  return true;
}

async function sendExpBonusChatNotice(message, amount, variant) {
  const channel = message.channel;
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") return;
  if (variant === "welcome_greeting" && !shouldSendWelcomeGreetingNotice(message)) return;
  const content = buildExpBonusChatContent(message, amount, variant).trim();
  if (!content) return;
  const { applyPronounGenderToPayload } = require("../../Utils/Community/pronounGenderUtils");
  const outgoing = applyPronounGenderToPayload({ content }, message.member);
  let sent = null;
  try {
    sent = await channel.send({
      ...outgoing,
      reply: { messageReference: message.id, failIfNotExists: false },
    });
  } catch {
    sent = await channel.send(outgoing).catch(() => null);
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
  if (!(await waitForMongoReady())) return false;
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
    const msg = String(err?.message || err || "");
        if (/must be connected|before running operations|not connected/i.test(msg)) return false;
    global.logger?.warn?.("[community-exp-bonus] first message claim:", err?.message || err);
    return false;
  }
}

async function waitForMongoReady(maxMs = WELCOME_GREETING_DB_WAIT_MS) {
  if (mongoose.connection?.readyState === 1) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      mongoose.connection?.off?.("connected", onConnected);
      resolve(value);
    };
    const onConnected = () => finish(true);
    const timeout = setTimeout(() => finish(false), Math.max(250, Math.floor(Number(maxMs) || 0)));
    if (mongoose.connection?.readyState === 1) {
      finish(true);
      return;
    }
    mongoose.connection?.once?.("connected", onConnected);
  });
}

async function findWelcomeGreetingExpClaim(guildId, welcomerUserId, joinTargetUserId) {
  const g = String(guildId || "").trim();
  const u = String(welcomerUserId || "").trim();
  const dedupeKey = welcomeGreetingDedupeKey(joinTargetUserId, u);
  if (!g || !dedupeKey) return null;
  return SiteDocument.findOne({
    docType: WELCOME_GREETING_DOC_TYPE,
    guildId: g,
    dedupeKey,
  })
    .select("userId status")
    .lean()
    .catch(() => null);
}

function isWelcomeGreetingExpFullyAwarded(claimDoc) {
  if (!claimDoc) return false;
  return String(claimDoc.status || "").trim().toLowerCase() === "awarded";
}

async function markWelcomeGreetingExpAwarded(guildId, welcomerUserId, joinTargetUserId) {
  const g = String(guildId || "").trim();
  const u = String(welcomerUserId || "").trim();
  const dedupeKey = welcomeGreetingDedupeKey(joinTargetUserId, u);
  if (!g || !dedupeKey) return;
  await SiteDocument.findOneAndUpdate(
    { docType: WELCOME_GREETING_DOC_TYPE, guildId: g, dedupeKey },
    { $set: { status: "awarded", userId: u } },
  ).catch(() => null);
}

async function tryClaimWelcomeGreetingExp(guildId, welcomerUserId, joinTargetUserId) {
  const g = String(guildId || "").trim();
  const u = String(welcomerUserId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  const dedupeKey = welcomeGreetingDedupeKey(targetId, u);
  if (!isValidGuildUserId(g, u) || !dedupeKey) return false;
  if (!(await waitForMongoReady())) return false;
  const existing = await findWelcomeGreetingExpClaim(g, u, targetId);
  if (existing) return false;
  try {
    await SiteDocument.create({
      docType: WELCOME_GREETING_DOC_TYPE,
      guildId: g,
      userId: u,
      dedupeKey,
      status: "claimed",
    });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    global.logger?.warn?.("[community-exp-bonus] welcome greeting claim:", err?.message || err);
    return false;
  }
}

async function releaseWelcomeGreetingExpClaim(guildId, welcomerUserId, joinTargetUserId) {
  const g = String(guildId || "").trim();
  const u = String(welcomerUserId || "").trim();
  const dedupeKey = welcomeGreetingDedupeKey(joinTargetUserId, u);
  if (!g || !dedupeKey) return;
  await SiteDocument.deleteOne({
    docType: WELCOME_GREETING_DOC_TYPE,
    guildId: g,
    dedupeKey,
  }).catch(() => null);
}

async function tryAwardWelcomeGreetingExpOnce(message, options = {}) {
  const source = String(options.source || "unknown");
  const logCtx = {
    source,
    guildId: String(message.guild?.id || ""),
    channelId: String(message.channelId || ""),
    userId: String(message.author?.id || ""),
    content: String(message.content || "").slice(0, 80),
  };
  if (!canEarnCommunityMessageExp(message)) return { ok: false, reason: "not_eligible" };
  const welcomeRuleMatched = options.welcomeRuleMatched === true;
  if (!welcomeRuleMatched && !matchesWelcomeGreetingForExp(message)) {
    return { ok: false, reason: "no_greeting_match" };
  }
  let joinTargetUserId = normalizeWelcomeJoinTargetUserId(options.joinTargetUserId || options.sessionId);
  if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
    await ensureWelcomeContextHydratedForGreeting(message);
    joinTargetUserId = resolveWelcomeGreetingSessionId(message, {
      trustedFromWordReaction: options.trustedFromWordReaction === true,
    });
  }
  if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
    joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, {
      trustedFromWordReaction: options.trustedFromWordReaction === true,
    });
  }
  if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
    global.logger?.warn?.("[community-exp-bonus] welcome greeting exp without join target:", logCtx);
    return { ok: false, reason: "no_session" };
  }
  logCtx.joinTargetUserId = joinTargetUserId;
  if (!(await waitForMongoReady())) {
    global.logger?.warn?.("[community-exp-bonus] welcome greeting db not ready:", logCtx);
    return { ok: false, reason: "db_not_ready" };
  }
  const priorClaim = await findWelcomeGreetingExpClaim(message.guild.id, message.author.id, joinTargetUserId);
  if (priorClaim && isWelcomeGreetingExpFullyAwarded(priorClaim)) {
    return { ok: false, reason: "already_claimed" };
  }
  const resumePendingClaim = !!priorClaim && !isWelcomeGreetingExpFullyAwarded(priorClaim);
  if (!resumePendingClaim && !(await tryClaimWelcomeGreetingExp(message.guild.id, message.author.id, joinTargetUserId))) {
    global.logger?.warn?.("[community-exp-bonus] welcome greeting claim_failed:", logCtx);
    return { ok: false, reason: "claim_failed" };
  }
  let awarded = false;
  try {
    awarded = await awardCommunityExp(message, WELCOME_GREETING_EXP, "welcome_greeting");
  } catch (err) {
    await releaseWelcomeGreetingExpClaim(message.guild.id, message.author.id, joinTargetUserId);
    global.logger?.warn?.("[community-exp-bonus] welcome greeting award error:", err?.message || err, logCtx);
    throw err;
  }
  if (awarded) {
    await markWelcomeGreetingExpAwarded(message.guild.id, message.author.id, joinTargetUserId);
    await sendExpBonusChatNotice(message, WELCOME_GREETING_EXP, "welcome_greeting");
    return { ok: true, reason: "awarded" };
  }
  await releaseWelcomeGreetingExpClaim(message.guild.id, message.author.id, joinTargetUserId);
  global.logger?.warn?.("[community-exp-bonus] welcome greeting award rejected:", logCtx);
  return { ok: false, reason: "award_failed" };
}

async function tryAwardWelcomeGreetingExp(message, options = {}) {
  const result = await tryAwardWelcomeGreetingExpOnce(message, options);
  return result.ok === true;
}

async function awardWelcomeGreetingExpFromReaction(message, options = {}) {
  const guildId = String(message?.guild?.id || "");
  return runWelcomeExpAwardSerialized(guildId, async () => {
    let joinTargetUserId = normalizeWelcomeJoinTargetUserId(options.joinTargetUserId || options.sessionId);
    const baseOptions = {
      trustedFromWordReaction: true,
      welcomeRuleMatched: options.welcomeRuleMatched === true,
      joinTargetUserId,
    };
    for (let i = 0; i < WELCOME_GREETING_AWARD_RETRY_DELAYS_MS.length; i += 1) {
      const delayMs = WELCOME_GREETING_AWARD_RETRY_DELAYS_MS[i];
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      await ensureWelcomeContextHydratedForGreeting(message);
      if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
        joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, { trustedFromWordReaction: true });
      }
      baseOptions.joinTargetUserId = joinTargetUserId;
      const result = await tryAwardWelcomeGreetingExpOnce(message, {
        ...baseOptions,
        source: i === 0 ? String(options.source || "word_reaction") : `word_reaction_retry_${i}`,
      });
      if (result.ok) return true;
      if (result.reason === "already_claimed" || result.reason === "not_eligible" || result.reason === "no_greeting_match") {
        return false;
      }
      joinTargetUserId = "";
    }
    global.logger?.warn?.("[community-exp-bonus] welcome greeting retries exhausted:", {
      userId: String(message.author?.id || ""),
      content: String(message.content || "").slice(0, 80),
    });
    return false;
  });
}

function scheduleWelcomeGreetingExpBackup(message, options = {}) {
  const guildId = String(message?.guild?.id || "");
  if (!guildId || !message?.author || message.author.bot) return;
  const pinnedJoinTargetUserId = normalizeWelcomeJoinTargetUserId(options.joinTargetUserId || options.sessionId);
  const timer = setTimeout(() => {
    void runWelcomeExpAwardSerialized(guildId, async () => {
      await ensureWelcomeContextHydratedForGreeting(message);
      if (!isMessageInWelcomeExpChannel(message)) return false;
      if (!matchesWelcomeGreetingForExp(message, { skipContextCheck: true })) return false;
      let joinTargetUserId = pinnedJoinTargetUserId;
      if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
        joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, { trustedFromWordReaction: true });
      }
      const result = await tryAwardWelcomeGreetingExpOnce(message, {
        trustedFromWordReaction: true,
        welcomeRuleMatched: true,
        joinTargetUserId,
        source: "backup_delayed",
      });
      return result.ok === true;
    }).catch((err) => {
      global.logger?.warn?.("[community-exp-bonus] welcome greeting backup:", err?.message || err);
    });
  }, WELCOME_GREETING_BACKUP_DELAY_MS);
  if (typeof timer.unref === "function") timer.unref();
}

async function handleWelcomeGreetingExpBonus(message) {
  await ensureWelcomeContextHydratedForGreeting(message);
  const welcomeRuleMatched = matchesWelcomeGreetingForExp(message);
  const guildId = String(message?.guild?.id || "");
  return runWelcomeExpAwardSerialized(guildId, async () => {
    const result = await tryAwardWelcomeGreetingExpOnce(message, {
      trustedFromWordReaction: true,
      welcomeRuleMatched,
      source: "message_backup",
    });
    return result.ok === true;
  });
}

async function awardCommunityExp(message, amount, source) {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt < 1) return false;
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  const ignored = await shouldIgnoreExpForMember({
    guildId: message.guild.id,
    member,
    channelId: message.channel?.id || message.channelId || null,
    skipIgnoredRoleIds: true,
  });
  if (ignored) return false;
  const result = await addExpWithLevel(message.guild, message.author.id, amt, false, true, { source: source || "community_bonus" });
  return result != null;
}

async function tryAwardWelcomeGreetingFromMessageBonus(message) {
  if (!isMessageInWelcomeExpChannel(message)) return;
  const guildId = String(message.guild?.id || "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    await ensureWelcomeContextHydratedForGreeting(message);
    if (!matchesWelcomeGreetingForExp(message)) continue;
    const result = await runWelcomeExpAwardSerialized(guildId, async () => {
      let joinTargetUserId = resolveWelcomeGreetingSessionId(message, { trustedFromWordReaction: true });
      if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) {
        joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, { trustedFromWordReaction: true });
      }
      return tryAwardWelcomeGreetingExpOnce(message, {
        welcomeRuleMatched: true,
        trustedFromWordReaction: true,
        joinTargetUserId,
        source: attempt === 0 ? "message_create_bonus" : `message_create_bonus_retry_${attempt}`,
      });
    });
    if (result.ok) return;
    if (result.reason === "already_claimed" || result.reason === "not_eligible" || result.reason === "no_greeting_match") return;
  }
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
  await tryAwardWelcomeGreetingFromMessageBonus(message);
}

module.exports = { FIRST_MESSAGE_DAILY_EXP, WELCOME_GREETING_EXP, getRomeDateKey, handleMessageCommunityExpBonuses, handleWelcomeGreetingExpBonus, awardWelcomeGreetingExpFromReaction, scheduleWelcomeGreetingExpBackup, tryClaimServerFirstMessageOfDayExp, tryClaimWelcomeGreetingExp, findServerFirstMessageWinner };