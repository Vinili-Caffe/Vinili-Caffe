const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { recordDiscadiaBump, recordBump, awardBumpVoteExp } = require("./bumpService") as typeof import("./bumpService");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  extractUserIdFromText,
  flattenEmbedText,
  resolveUserFromMessage,
} = require("./officialMessageAutomationShared") as typeof import("./officialMessageAutomationShared");

const processedBumpMessages = new Map();
const bumpDetectionLogAtByGuild = new Map();
const bumpSkipDebugLogAtByKey = new Map();
const BUMP_DETECTION_LOG_COOLDOWN_MS = 10 * 60 * 1000;
const BUMP_SKIP_DEBUG_LOG_TTL_MS = 30 * 60 * 1000;

const BUMP_MESSAGE_DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;

function claimBumpDedupeKey(key?, ttlMs = BUMP_MESSAGE_DEDUPE_TTL_MS) {
  if (!key) return true;
  const now = Date.now();
  const last = processedBumpMessages.get(key) || 0;
  if (last && now - last < ttlMs) return false;
  processedBumpMessages.set(key, now);
  for (const [k, ts] of processedBumpMessages.entries()) {
    if (now - ts > ttlMs) processedBumpMessages.delete(k);
  }
  return true;
}

function releaseBumpDedupeKey(key?) {
  if (!key) return;
  processedBumpMessages.delete(key);
}

function logBumpDetectionOnce(tag?, guildId?, details?) {
  void tag;
  void guildId;
  void details;
}

function isBumpDetectDebugEnabled() {
  return false;
}

function logBumpSkipDebug(tag?, message?, reason?, details = "") {
  if (!isBumpDetectDebugEnabled()) return;
  const gid = String(message?.guild?.id || "");
  const msgId = String(message?.id || "");
  const channelId = String(message?.channelId || "");
  if (!gid || !msgId) return;
  const key = `${tag}:${gid}:${msgId}:${reason}`;
  const now = Date.now();
  const prev = Number(bumpSkipDebugLogAtByKey.get(key) || 0);
  if (prev && now - prev < BUMP_SKIP_DEBUG_LOG_TTL_MS) return;
  bumpSkipDebugLogAtByKey.set(key, now);
  for (const [k, ts] of bumpSkipDebugLogAtByKey.entries()) {
    if (now - ts > BUMP_SKIP_DEBUG_LOG_TTL_MS) bumpSkipDebugLogAtByKey.delete(k);
  }
  const line = `${tag} [SKIP] guild=${gid} msg=${msgId} channel=${channelId} reason=${reason}${details ? ` ${details}` : ""}`;
  global.logger?.warn?.(line);
  try {
    console.log(line);
  } catch (_) { }
}

async function hasExistingBumpThanksReply(channel?, bumpMessageId?, botUserId?) {
  if (!channel?.messages?.fetch || !bumpMessageId || !botUserId) return false;
  const bumpId = String(bumpMessageId);
  const thanksRe = /Grazie per aver [`']?bumpato[`']?|grazie per aver bumpato/i;
  if (channel.messages?.cache?.some?.(
    (m?) => String(m.author?.id || "") === String(botUserId) && String(m.reference?.messageId || "") === bumpId,
  )) {
    return true;
  }
  const bumpMsg = channel.messages.cache.get(bumpId) || (await channel.messages.fetch(bumpId).catch(() => null));
  const bumpTs = Number(bumpMsg?.createdTimestamp || 0);
  const recent = await channel.messages.fetch({ limit: 100, ...(bumpMsg?.id ? { around: bumpMsg.id } : {}) }).catch(() => null);
  if (!recent) return false;
  for (const m of recent.values()) {
    if (String(m.author?.id || "") !== String(botUserId)) continue;
    if (String(m.reference?.messageId || "") === bumpId) return true;
    const ts = Number(m.createdTimestamp || 0);
    if (bumpTs && ts >= bumpTs && ts <= bumpTs + 10 * 60 * 1000 && thanksRe.test(String(m.content || ""))) return true;
  }
  return false;
}

function getDisboardAuthorIdSet(client?) {
  const cfg = client?.config?.disboard || {};
  return new Set(
    [IDs.bots?.DISBOARD, cfg.botId, ...(Array.isArray(cfg.botIds) ? cfg.botIds : [])]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
}

function isMessageFromDisboardBot(message?, client?) {
  const authorId = String(message?.author?.id || "");
  if (!authorId) return false;
  if (getDisboardAuthorIdSet(client).has(authorId)) return true;
  const name = String(message.author?.username || message.author?.globalName || "").toLowerCase();
  return Boolean(message.author?.bot && /disboard/i.test(name));
}

function collectDisboardBumpHaystacks(message?) {
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      const flat = flattenEmbedText(embed);
      if (flat) haystacks.push(flat);
    }
  }
  return haystacks;
}

async function handleDisboardBump(message?, client?) {
  const disboard = client?.config?.disboard;
  if (!disboard || !message.guild) return false;
  if (!message.author) return false;
  if (String(message.author.id) === String(client.user?.id)) return false;

  const configuredPatterns = Array.isArray(disboard.bumpSuccessPatterns)
    ? disboard.bumpSuccessPatterns.map((p?) => String(p).toLowerCase())
    : [];
  const defaultPatterns = [
    "bump done",
    "bump successful",
    "has been bumped",
    "successfully bumped",
    "you can bump again",
    "bump will be available again",
    "was bumped",
    "server bumped",
  ];
  const patterns = Array.from(new Set([...configuredPatterns, ...defaultPatterns]));
  const haystacks = collectDisboardBumpHaystacks(message);
  const rawHaystackJoin = haystacks.map((text?) => String(text || "")).join("\n");
  const lowered = haystacks.map((text?) => String(text || "").toLowerCase());
  const hasPatternMatch = patterns.some((pattern?) => lowered.some((text?) => text.includes(pattern)));
  const joined = lowered.join("\n");
  const authorName = String(message.author?.globalName || message.author?.username || "");
  const sourceName = String(
    [
      message.author?.globalName || "",
      message.author?.username || "",
      message.author?.tag || "",
      message.author?.id || "",
      message.applicationId || "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const sourceFingerprint = `${authorName} ${sourceName}`.toLowerCase();
  const hasDisboardWord = /\bdisboard\b/i.test(joined);
  const hasDisboardDomain = /disboard\.org/i.test(joined);
  const hasDiscadiaWord = /\bdiscadia\b/i.test(joined) || /discadia\.com/i.test(joined);
  const isAutomatedSource = Boolean(
    message.author?.bot || message.applicationId || message.webhookId,
  );
  const interactionCommandName = String(
    message.interaction?.commandName || message.interactionMetadata?.name || "",
  )
    .trim()
    .toLowerCase();
  const isBumpInteraction = interactionCommandName === "bump";
  const isLikelyCommandChannel =
    String(message.channelId || "") === String(IDs.channels.commands || "");
  const isFromDisboardBot = isMessageFromDisboardBot(message, client);
  const hasRegexSuccess =
    /(bump(?:ed)?\s*(?:done|successful|successfully)|has been bumped|\bwas bumped\b|server bumped|you can bump again|bump will be available again)/i.test(joined);
  const hasBumpWord = /\bbump(?:ed)?\b/i.test(joined);
  const hasBumpSuccessText = hasPatternMatch || hasRegexSuccess || (hasBumpWord && isFromDisboardBot);
  const hasHardDisboardBumpFailure =
    /already bumped|cannot bump|can\s*'t bump|can't bump|failed to bump|bump failed|must be (?:\*\*)?(?:owner|admin)|permission to bump|don't have permission|do not have permission|missing permission|you must be|unable to bump|not allowed to bump|manage server.*bump|bump.*manage server/i.test(joined);
  const hasCooldownLikeText = /please wait|too early|wait before/i.test(joined);
  const hasDisboardBumpFailure =
    hasHardDisboardBumpFailure ||
    (hasCooldownLikeText && !hasBumpSuccessText);
  const isStrictDisboardSource = isFromDisboardBot;
  const isDisboardByContentFallback =
    isAutomatedSource &&
    hasBumpSuccessText &&
    !hasDiscadiaWord &&
    (hasDisboardWord ||
      hasDisboardDomain ||
      /\bdisboard\b/i.test(sourceFingerprint));
  const isDisboardByBotFallback =
    isFromDisboardBot &&
    !hasDisboardBumpFailure &&
    (hasBumpSuccessText || hasBumpWord || isBumpInteraction || isLikelyCommandChannel);
  const isBump =
    !hasDisboardBumpFailure &&
    ((hasBumpSuccessText && (isStrictDisboardSource || isDisboardByContentFallback)) ||
      isDisboardByBotFallback);
  if (!isBump) {
    const reason = hasDisboardBumpFailure
      ? "disboard_failure_text"
      : (!hasBumpSuccessText ? "missing_success_text" : "source_not_recognized");
    logBumpSkipDebug(
      "[DISBOARD BUMP DETECT]",
      message,
      reason,
      `flags={success:${hasBumpSuccessText},failure:${hasDisboardBumpFailure},strict:${isStrictDisboardSource},contentFallback:${isDisboardByContentFallback},botFallback:${isDisboardByBotFallback},automated:${isAutomatedSource},discadiaWord:${hasDiscadiaWord}}`,
    );
    return false;
  }
  const dedupeKey = `disboard:${message.guild.id}:${message.id}`;
  if (!claimBumpDedupeKey(dedupeKey)) {
    logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "duplicate_message_dedupe");
    return true;
  }
  const channel = message.channel || (await getGuildChannelCached(message.guild, message.channelId));
  if (channel?.isTextBased?.() && (await hasExistingBumpThanksReply(channel, message.id, client.user?.id))) {
    logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "already_thanked");
    return true;
  }
  let bumpUserId =
    message.interaction?.user?.id ||
    message.interactionMetadata?.user?.id ||
    null;
  if (!bumpUserId) {
    const resolvedUser = await resolveUserFromMessage(message);
    if (resolvedUser && !resolvedUser.bot) bumpUserId = resolvedUser.id;
  }
  if (!bumpUserId) {
    bumpUserId = extractUserIdFromText(message.content) || extractUserIdFromText(rawHaystackJoin) || null;
    if (!bumpUserId) {
      logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "user_not_resolved", "fallback=record_with_null_user");
    }
  }
  const detectionSource =
    isStrictDisboardSource ? "strict" : "fallback";
  logBumpDetectionOnce(
    "[DISBOARD BUMP DETECT]",
    message.guild.id,
    `source=${detectionSource} msg=${message.id} channel=${message.channelId}`,
  );
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const disboardCooldownMs = (client?.config?.disboard?.cooldownMinutes ?? 120) * 60 * 1000;
  let recordResult;
  try {
    const bumpAtFromMessage = (() => {
      const ts = Number(message.createdTimestamp);
      return Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    })();
    recordResult = await recordBump(client, message.guild.id, bumpUserId, { bumpAt: bumpAtFromMessage });
  } catch (err) {
    releaseBumpDedupeKey(dedupeKey);
    throw err;
  }
  let thanksMessage = `${E.VC_ThankYou} **__Grazie per aver \`bumpato\` il server!__**\n` +
    `${E.VC_HelloKittyGun} Ci __vediamo__ nuovamente tra **due ore!**\n` +
    bumpMention;
  if (bumpUserId && recordResult?.previousLastBumpAt !== undefined) {
    const reward = await awardBumpVoteExp(client, message.guild, bumpUserId, "disboard", recordResult.previousLastBumpAt, disboardCooldownMs, undefined, recordResult?.previousReminderSentAt || null, recordResult?.previousLastBumpUserId || null).catch(() => null);
    if (reward?.effectiveExp != null) {
      const parts = [`${E.VC_ThankYou} **__Grazie per aver \`bumpato\` il server!__**`, `${E.VC_EXP} **` + reward.effectiveExp + " exp** guadagnati!"];
      if (reward.fastBonus > 0) parts.push(`${E.VC_Flame} Risposta rapida +` + reward.fastBonus + " exp");
      if (reward.streakBonus > 0) parts.push(`${E.VC_Flame} Streak ` + reward.newStreak + " +" + reward.streakBonus + " exp");
      parts.push(`${E.VC_HelloKittyGun} Ci __vediamo__ nuovamente tra **due ore!**\n` + bumpMention);
      thanksMessage = parts.join("\n");
    }
  }
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      await channel.send({ content: thanksMessage.trim() }).catch(() => { });
    }
  }
  return true;
}

async function handleDiscadiaBump(message?, client?) {
  const discadia = client?.config?.discadia;
  if (!discadia || !message.guild) return false;
  if (isMessageFromDisboardBot(message, client)) return false;
  if (String(message.author?.id) === String(client.user?.id)) return false;
  const discadiaBotIds = new Set(
    [
      IDs.bots?.Discadia,
      IDs.roles?.Discadia,
      discadia?.botId,
      ...(Array.isArray(discadia?.botIds) ? discadia.botIds : []),
    ]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
  const authorName = String(message.author?.globalName || message.author?.username || "",);
  const sourceName = String([message.author?.globalName || "", message.author?.username || "", message.author?.tag || "", message.author?.id || "", message.applicationId || "",].filter(Boolean).join(" "),);
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  const patterns = Array.isArray(discadia.bumpSuccessPatterns) ? discadia.bumpSuccessPatterns.map((p?) => String(p).toLowerCase()) : ["has been successfully bumped", "successfully bumped", "bumped successfully", "boost earned", "+1 boost earned",];
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
      if (embed?.footer?.text) haystacks.push(embed.footer.text);
      if (embed?.author?.name) haystacks.push(embed.author.name);
      if (Array.isArray(embed?.fields)) {
        for (const field of embed.fields) {
          if (field?.name) haystacks.push(field.name);
          if (field?.value) haystacks.push(field.value);
        }
      }
    }
  }
  const normalized = haystacks.map((text?) => String(text).toLowerCase()).map((text?) => text.replace(/\s+/g, " ").trim());
  const joined = normalized.join("\n");
  if (/already bumped recently/i.test(joined)) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "already_bumped_recently_text");
    return false;
  }
  const hasPatternLegacy = patterns.some((pattern?) => joined.includes(pattern) && !/boost\s+earned/i.test(pattern));
  const hasBoostEarnedPattern = patterns.some((pattern?) => /boost\s+earned/i.test(pattern) && joined.includes(pattern));
  /* discadiaBumpFmt2026: "**Server** bumped. +1 Boost earned." (+ optional streak / Next bump) */
  const hasNewDiscadiaBumpFmt =
    (/\bbumped\b/i.test(joined) && /(?:\+\s*)?(?:\d+\s*)?boosts?\s+earned/i.test(joined)) ||
    (hasBoostEarnedPattern && /\bbumped\b/i.test(joined));
  const hasPattern = hasPatternLegacy || hasNewDiscadiaBumpFmt;
  const hasSuccessWord =
    hasNewDiscadiaBumpFmt ||
    /(server has been bumped|has been successfully bumped|bump(?:ed)?successfully|successfully bumped|successful bump|bump complete|bump done|thanks for bumping|you can bump again|bump effettuato|bump eseguito|bump completato|bump andato a buon fine|server bumpato con successo|bump riuscito|puoi bumpare di nuovo|potrai bumpare di nuovo)/i.test(
      joined,
    );
  const hasBumpWord = /\bbump(?:ed)?\b/i.test(joined);
  const hasFailureWord = /already bumped|already has been bumped|cannot bump|can\s*'t bump|can't bump|please wait|too early|wait before|failed to bump|bump failed|errore bump|impossibile bumpare|devi aspettare|attendi prima di bumpare|troppo presto per bumpare|bump non riuscito|bump fallito|must be (?:\*\*)?(?:owner|admin)|manage server|permission to bump|don't have permission|do not have permission|missing permission|you must be|unable to bump|not allowed to bump|unauthorized|can't use this command|cannot use this command|non hai i permessi|permesso negato/i.test(joined);
  const hasDiscadiaWord = /\bdiscadia\b/i.test(joined);
  const hasDiscadiaDomain = /discadia\.com/i.test(joined);
  const interactionCommandName = String(message.interaction?.commandName || message.interactionMetadata?.name || "",).trim().toLowerCase();
  const isBumpInteraction = interactionCommandName === "bump";
  const isLikelyCommandChannel = String(message.channelId || "") === String(IDs.channels.commands || "");
  const authorId = String(message.author?.id || "");
  const isFromDiscadiaBot = Boolean(authorId && discadiaBotIds.has(authorId));
  const sourceFingerprint = `${authorName} ${sourceName}`.toLowerCase();
  const looksLikeDiscadiaSource = isFromDiscadiaBot || /\bdiscadia\b/i.test(sourceFingerprint) || hasDiscadiaWord || hasDiscadiaDomain;
  const looksLikeDisboardSource = /\bdisboard\b/i.test(sourceFingerprint);
  const hasBumpSuccessText = hasPattern || hasSuccessWord;
  const isLikelyDiscadiaViaAutomation = isAutomatedSource && !looksLikeDisboardSource && (looksLikeDiscadiaSource || (isLikelyCommandChannel && hasBumpSuccessText && hasBumpWord));
  const isLikelyDiscadiaGenericSuccess = isAutomatedSource && !looksLikeDisboardSource && hasBumpSuccessText && (hasBumpWord || isBumpInteraction) && (Boolean(message.webhookId) || isBumpInteraction);
  const isStrictDiscadiaSource = isFromDiscadiaBot || isLikelyDiscadiaViaAutomation || isLikelyDiscadiaGenericSuccess;
      const isDiscadiaByContentFallback = !looksLikeDisboardSource && hasBumpSuccessText && (hasDiscadiaWord || hasDiscadiaDomain || /\bdiscadia\b/i.test(sourceFingerprint));
  const isBump = !hasFailureWord && hasBumpSuccessText && (isStrictDiscadiaSource || isDiscadiaByContentFallback);
  if (!isBump) {
    const reason = hasFailureWord
      ? "discadia_failure_text"
      : (!hasBumpSuccessText ? "missing_success_text" : "source_not_recognized");
    logBumpSkipDebug(
      "[DISCADIA BUMP DETECT]",
      message,
      reason,
      `flags={success:${hasBumpSuccessText},failure:${hasFailureWord},strict:${isStrictDiscadiaSource},contentFallback:${isDiscadiaByContentFallback},automated:${isAutomatedSource},looksDisboard:${looksLikeDisboardSource}}`,
    );
    return false;
  }

  const dedupeKey = `discadia:${message.guild.id}:${message.id}`;
  if (!claimBumpDedupeKey(dedupeKey)) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "duplicate_message_dedupe");
    return true;
  }
  const channel = message.channel || (message.channelId ? await getGuildChannelCached(message.guild, message.channelId) : null);
  if (channel?.isTextBased?.() && (await hasExistingBumpThanksReply(channel, message.id, client.user?.id))) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "already_thanked");
    return true;
  }
  let bumpUserId = message.interaction?.user?.id || message.interactionMetadata?.user?.id || extractUserIdFromText(message.content) || extractUserIdFromText(joined) || null;
  if (!bumpUserId) {
    const resolvedUser = await resolveUserFromMessage(message);
    if (resolvedUser && !resolvedUser.bot) bumpUserId = resolvedUser.id;
    if (!bumpUserId) {
      logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "user_not_resolved", "fallback=record_with_null_user");
    }
  }
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  try {
    const discadiaBumpAt = (() => {
      const ts = Number(message.createdTimestamp);
      return Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    })();
    await recordDiscadiaBump(client, message.guild.id, bumpUserId, { bumpAt: discadiaBumpAt });
  } catch (err) {
    releaseBumpDedupeKey(dedupeKey);
    throw err;
  }
  let thanksMessage = `${E.VC_ThankYou} **__Grazie per aver \`bumpato\` il server!__**\n` +
    `${E.VC_HelloKittyGun} Ci __vediamo__ nuovamente tra **24 ore!**\n` +
    bumpMention;
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      await channel.send({ content: thanksMessage.trim() }).catch(() => { });
    }
  }
  return true;
}

export = { handleDisboardBump, handleDiscadiaBump };
