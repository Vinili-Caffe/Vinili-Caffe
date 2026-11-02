/** Rilevamento violazioni AutoMod su singolo messaggio (estratto da automodService). */
const { getSecurityStaticsSnapshot } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { isMinigameFloodExemptChannel } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
const { detectGrabbedScamImage } = require("../utils/grabbedScamImageMatcher") as typeof import("../utils/grabbedScamImageMatcher");
const {
  TEXT_RULES,
  AUTOMOD_SCAM_CONFIG,
  nowMs,
  trimWindow,
  trimNormHistory,
  trimRecentMessageHistory,
  normalizeContent,
  looksLikeLegitConversation,
  stripQuotedAndCodeText,
  getAllowedInviteCodes,
  buildModerationScanText,
  detectScam,
  detectScamImageBait,
  extractUrls,
  filterUrlsForAttachmentLinkRule,
  isImageAttachment,
  similarityRatio,
  countEmojiApprox,
  countCaseCharacters,
  stripUrlsForCharacterRule,
} = require("./automodText") as typeof import("./automodText");
const { isWhitelistedByCategory, isCrossServerForwardedMessage } = require("./automodExempt") as typeof import("./automodExempt");
const { MENTION_RULES, ATTACHMENT_RULES } = require("./automodActions") as typeof import("./automodActions");
const {
  AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER,
  isAutomodMainGuild,
  SUSPICIOUS_ACCOUNT_STRONG_KEYS,
  SPAM_WHITELIST_CATEGORY_IDS,
  INVITE_WHITELIST_CHANNEL_IDS,
  MENTION_WHITELIST_CHANNEL_IDS,
  EVERYONE_WHITELIST_CHANNEL_IDS,
  isWhitelistedByChannel,
  applyProfileHeat,
  resolveAttachmentHeatScale,
  resolveImageOnlyMaxCount,
  isPanicModeActive,
  detectInvite,
  findBlacklistedWordMatch,
  countZalgo,
} = require("./automodDetect") as typeof import("./automodDetect");

/* deps: soglie/runtime da automodMessagePipeline.getDetectViolationDeps (niente export type: rompe export= con esbuild CJS) */
async function detectViolations(message?, state?, profile?, deps?) {
  const at = nowMs();
  const msgId = String(message.id || "");
  state.recentMessageHistory = Array.isArray(state.recentMessageHistory) ? state.recentMessageHistory : [];
  state.recentMessageHistory.push({ t: at, id: msgId });
  trimRecentMessageHistory(state.recentMessageHistory, 20_000, at);
  const content = String(message.content || "");
  const moderationContent = stripQuotedAndCodeText(content);
  const moderationScanText = buildModerationScanText(message, moderationContent);
  const normalized = normalizeContent(content);
  const extractedUrls = extractUrls(moderationScanText);
  const violations = [];
  const profileHeat = (value?, factorKey = "regularMessage") =>
    applyProfileHeat(deps.applyHeatFactor(factorKey, value), profile);
  /* ticketHateOnly1: in ticket categories only racist/homophobic slur filters apply */
  if (profile?.hateSpeechOnly === true) {
    const hateMatch = findBlacklistedWordMatch(moderationContent);
    if (hateMatch) {
      violations.push({
        key: "word_blacklist",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.wordBlacklist.heat),
          "wordBlacklist",
        ),
        info:
          hateMatch.term && hateMatch.source
            ? `racist list (${hateMatch.source}: ${hateMatch.term})`
            : "racist list",
      });
    }
    return violations;
  }
  const channelId = String(message.channelId || "");
  const parentChannelId = String(message.channel?.parentId || "");
  const statics = getSecurityStaticsSnapshot(String(message?.guild?.id || ""));
  const dynamicPartneringChannels = Array.isArray(statics?.partneringChannelIds)
    ? statics.partneringChannelIds.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];
  const { getPartnershipChannelId } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
  const tenantPartnershipChannel = getPartnershipChannelId(message?.guild?.id);
  const tenantPartnerChannels = tenantPartnershipChannel ? [tenantPartnershipChannel] : [];
  const inviteWhitelistSet = new Set([
    ...INVITE_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
    ...tenantPartnerChannels,
  ]);
  const mentionWhitelistSet = new Set([
    ...MENTION_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
    ...tenantPartnerChannels,
  ]);
  const everyoneWhitelistSet = new Set([
    ...EVERYONE_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
    ...tenantPartnerChannels,
  ]);
  const spamWhitelisted = isWhitelistedByCategory(message.channel, SPAM_WHITELIST_CATEGORY_IDS);
  const minigameFloodExempt = await isMinigameFloodExemptChannel(message);
  const antiSpamFloodExempt = spamWhitelisted || minigameFloodExempt;
  const inviteWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, inviteWhitelistSet);
  const mentionWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, mentionWhitelistSet);
  const everyoneWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, everyoneWhitelistSet);
  const mentionsEnabled = profile?.mentionsEnabled !== false;
  const attachmentsEnabled = profile?.attachmentsEnabled !== false;
  const inviteLinksEnabled = profile?.inviteLinksEnabled !== false;
  const autoLockdownEnabled = deps.isAutoLockdownEnabled();
  const hasMeaningfulTextPayload = String(moderationContent || "").trim().length >= 8;
  const attachmentListForCharRule = [...(message.attachments?.values?.() || [])];
  const imageAttachmentCountForCharRule = attachmentListForCharRule.filter((att?) =>
    isImageAttachment(att),
  ).length;
  const legitConversation = looksLikeLegitConversation(moderationContent || content);
  if (
    TEXT_RULES.crossServerForward.enabled &&
    isAutomodMainGuild(String(message.guildId || message.guild?.id || "")) &&
    isCrossServerForwardedMessage(message)
  ) {
    violations.push({
      key: "cross_server_forward",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.crossServerForward.heat),
        "crossServerForward",
      ),
      info: String(message.reference?.guildId || "forward"),
    });
    return violations;
  }
  let suspiciousMessageAuthor = false;
  try {
    const badProfile = await deps.getBadUserProfile(message.author?.id, message.guildId);
    suspiciousMessageAuthor = Boolean(badProfile?.suspicious);
  } catch {
    suspiciousMessageAuthor = false;
  }

  if (
    !antiSpamFloodExempt &&
    deps.automodAntispamEnabled &&
    TEXT_RULES.regularMessage.enabled
  ) {
    state.msgTimes.push(at);
    trimWindow(state.msgTimes, 8_000, at);
    if (state.msgTimes.length >= 6) {
      const recentForBurst = state.recentMessageHistory
        .slice(-Math.max(6, state.msgTimes.length))
        .map((row?) => String(row?.id || ""))
        .filter(Boolean);
      violations.push({
        key: "regular_message",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.regularMessage.heat),
          "regularMessage",
        ),
        info: `${state.msgTimes.length}/8s`,
        relatedMessageIds: recentForBurst,
      });
    }
  }

  if (
    !antiSpamFloodExempt &&
    deps.automodAntispamEnabled &&
    TEXT_RULES.similarMessage.enabled &&
    normalized.length >= 8 &&
    !message.editedTimestamp
  ) {
    state.normHistory.push({ t: at, c: normalized, id: msgId });
    trimNormHistory(state.normHistory, 18_000, at);
    const ratio = TEXT_RULES.similarMessage.ratio;
    const similarThreshold = legitConversation ? 3 : 2;
    let similarCount = 0;
    const similarIds = [];
    for (const x of state.normHistory) {
      if (!x?.c) continue;
      if (msgId && String(x.id || "") === msgId) continue;
      if (similarityRatio(x.c, normalized) >= ratio) {
        similarCount += 1;
        if (x.id) similarIds.push(String(x.id));
        if (similarCount >= similarThreshold) break;
      }
    }
    if (similarCount >= similarThreshold) {
      violations.push({
        key: "similar_message",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.similarMessage.heat),
          "similarMessage",
        ),
        info: `ratio>=${ratio.toFixed(2)} count:${similarCount}`,
        relatedMessageIds: similarIds,
      });
    }
  }

  const rawUserMentionCount = message.mentions?.users?.size || 0;
  const repliedUserId = message.mentions?.repliedUser?.id
    ? String(message.mentions.repliedUser.id)
    : null;
  const replyMentionAdjustment =
    repliedUserId && message.mentions?.users?.has?.(repliedUserId) ? 1 : 0;
  const userMentionCount = Math.max(0, rawUserMentionCount - replyMentionAdjustment);
  const roleMentionCount = message.mentions?.roles?.size || 0;
  const everyoneMentionCount = message.mentions?.everyone ? 1 : 0;
  const effectiveMentionCount =
    (mentionWhitelisted ? 0 : userMentionCount + roleMentionCount) +
    (everyoneWhitelisted ? 0 : everyoneMentionCount);
  if (MENTION_RULES.enabled && mentionsEnabled) {
    if (effectiveMentionCount > 0) {
      const shortCap = Math.max(deps.mentionLockdownTrigger * 2, 100);
      const hourCap = Math.max(MENTION_RULES.hourCap * 2, 100);
      const roomShort = Math.max(0, shortCap - state.mentionTimes.length);
      const roomHour = Math.max(0, hourCap - state.mentionHourTimes.length);
      const toPush = Math.min(effectiveMentionCount, roomShort, roomHour);
      for (let i = 0; i < toPush; i += 1) {
        state.mentionTimes.push(at);
        state.mentionHourTimes.push(at);
      }
      trimWindow(state.mentionTimes, deps.mentionLockdownWindowMs, at);
      trimWindow(state.mentionHourTimes, 60 * 60_000, at);
    }

    const minUserMentions = Math.max(
      1,
      Math.floor(Number(MENTION_RULES.userMentions?.minUserMentions ?? 5)),
    );
    if (
      !mentionWhitelisted &&
      MENTION_RULES.userMentions.enabled &&
      userMentionCount >= minUserMentions
    ) {
      violations.push({
        key: "mention_user",
        heat: profileHeat(
          userMentionCount * deps.percentToHeat(MENTION_RULES.userMentions.heat),
          "mentions",
        ),
        info: `${userMentionCount} @user`,
      });
    }

    if (
      !mentionWhitelisted &&
      MENTION_RULES.roleMentions.enabled &&
      roleMentionCount > 0
    ) {
      violations.push({
        key: "mention_role",
        heat: profileHeat(
          roleMentionCount * deps.percentToHeat(MENTION_RULES.roleMentions.heat),
          "mentions",
        ),
        info: `${roleMentionCount} @role`,
      });
    }

    if (
      !everyoneWhitelisted &&
      !deps.shouldSkipViolationForDiscordNative("mention_everyone") &&
      MENTION_RULES.everyoneMentions.enabled &&
      everyoneMentionCount > 0
    ) {
      violations.push({
        key: "mention_everyone",
        heat: profileHeat(
          everyoneMentionCount *
            deps.percentToHeat(MENTION_RULES.everyoneMentions.heat),
          "mentions",
        ),
        info: "@everyone/@here",
      });
    }

    if (
      autoLockdownEnabled &&
      !deps.shouldSkipViolationForDiscordNative("mention_hour_cap") &&
      state.mentionHourTimes.length >= MENTION_RULES.hourCap
    ) {
      violations.push({
        key: "mention_hour_cap",
        heat: profileHeat(deps.percentToHeat(100), "mentions"),
        info: `${state.mentionHourTimes.length}/${MENTION_RULES.hourCap} pings/1h`,
      });
    }

    if (autoLockdownEnabled && state.mentionTimes.length >= deps.mentionLockdownTrigger) {
      violations.push({
        key: "mentions_lockdown",
        heat: profileHeat(deps.percentToHeat(100), "mentions"),
        info: `${state.mentionTimes.length}/${Math.floor(deps.mentionLockdownWindowMs / 1000)}s`,
      });
    }
  }

  const inviteCode = detectInvite(moderationScanText) || detectInvite(moderationContent);
  if (
    inviteCode &&
    !inviteWhitelisted &&
    !deps.shouldSkipViolationForDiscordNative("invite")
  ) {
    const allowedCodes = getAllowedInviteCodes(message);
    if (
      inviteLinksEnabled &&
      TEXT_RULES.inviteLinks.enabled &&
      !allowedCodes.has(inviteCode)
    ) {
      violations.push({
        key: "invite",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.inviteLinks.heat),
          "inviteLinks",
        ),
        info: `discord.gg/${inviteCode}`,
      });
    }
  }

  if (TEXT_RULES.maliciousLinks.enabled && detectScam(moderationScanText)) {
    violations.push({
      key: "scam_pattern",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.maliciousLinks.heat),
        "maliciousLinks",
      ),
      info: "pattern scam/malicious link",
    });
  }

  const accountCreatedAt = Number(new Date(message?.author?.createdAt || 0).getTime() || 0);
  const accountAgeMs = accountCreatedAt > 0 ? at - accountCreatedAt : 0;
  const youngAccountMaxMs = Number(AUTOMOD_SCAM_CONFIG.youngAccountMaxDays || 14) * 24 * 60 * 60_000;
  const youngAccount = accountAgeMs > 0 && accountAgeMs < youngAccountMaxMs;
  if (
    TEXT_RULES.maliciousLinks.enabled &&
    detectScamImageBait(message, moderationContent, {
      suspicious: suspiciousMessageAuthor,
      youngAccount,
      accountAgeMs,
    })
  ) {
    violations.push({
      key: "scam_image_bait",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.maliciousLinks.heat),
        "maliciousLinks",
      ),
      info: "bait text + image scam",
    });
  }

  if (TEXT_RULES.maliciousLinks.enabled) {
    const grabbedHit = await detectGrabbedScamImage(message).catch((err?) => {
      global.logger?.warn?.("[automod] grabbed scam image scan failed:", err?.message || err);
      return null;
    });
    if (grabbedHit) {
      violations.push({
        key: "grabbed_scam_image",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.maliciousLinks.heat),
          "maliciousLinks",
        ),
        info: `grabbed bait img (${grabbedHit.kind}:${grabbedHit.id})`,
      });
    }
  }

  if (await deps.isNsfwUrl(moderationScanText, extractedUrls)) {
    violations.push({
      key: "nsfw_link",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.nsfwLinks.heat),
        "nsfwLinks",
      ),
      info: "nsfw domain/url",
    });
  }

  const wordBlacklistMatch = deps.shouldSkipViolationForDiscordNative("word_blacklist")
    ? null
    : findBlacklistedWordMatch(moderationContent);
  if (wordBlacklistMatch) {
    violations.push({
      key: "word_blacklist",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.wordBlacklist.heat),
        "wordBlacklist",
      ),
      info:
        wordBlacklistMatch.term && wordBlacklistMatch.source
          ? `racist list (${wordBlacklistMatch.source}: ${wordBlacklistMatch.term})`
          : "racist list",
    });
  }

  if (
    !deps.shouldSkipViolationForDiscordNative("link_blacklist") &&
    (await deps.hasBlacklistedDomain(moderationScanText, extractedUrls))
  ) {
    violations.push({
      key: "link_blacklist",
      heat: profileHeat(
        deps.percentToHeat(TEXT_RULES.linkBlacklist.heat),
        "linkBlacklist",
      ),
      info: "blacklisted domain",
    });
  }

  if (!spamWhitelisted && TEXT_RULES.emojis.enabled) {
    const emojiCount = countEmojiApprox(content);
    if (emojiCount >= TEXT_RULES.emojis.minCount) {
      violations.push({
        key: "emoji_spam",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.emojis.heat),
          "emojis",
        ),
        info: `${emojiCount} emoji`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.newLines.enabled) {
    const lineBreaks = (content.match(/\n/g) || []).length;
    if (lineBreaks >= TEXT_RULES.newLines.minCount) {
      violations.push({
        key: "new_lines",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.newLines.heat),
          "newLines",
        ),
        info: `${lineBreaks} new lines`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.zalgo.enabled) {
    const zalgoCount = countZalgo(content);
    if (zalgoCount >= TEXT_RULES.zalgo.minCount) {
      violations.push({
        key: "zalgo",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.zalgo.heat),
          "zalgo",
        ),
        info: `${zalgoCount} combining chars`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.characters.enabled) {
    const characterRuleContent = stripUrlsForCharacterRule(moderationContent);
    const strippedForCharLen = characterRuleContent.replace(/\s+/g, " ").trim();
    const skipCharSpamForHeavyImagePost =
      imageAttachmentCountForCharRule >= 3 &&
      strippedForCharLen.length < TEXT_RULES.characters.minChars;
    const { lower, upper, total } = countCaseCharacters(characterRuleContent);
    if (!skipCharSpamForHeavyImagePost && total >= TEXT_RULES.characters.minChars) {
      const upperRatio = total > 0 ? upper / total : 0;
      const repeatedCharBurst = /(.)\1{10,}/.test(characterRuleContent);
      const noisyShape = upperRatio >= 0.45 || repeatedCharBurst;
      if (legitConversation && !noisyShape) {
      } else {
        const lowerHeat =
          lower * (Number(TEXT_RULES.characters.lowercaseHeat) / 100) * deps.maxHeat;
        const upperHeat =
          upper * (Number(TEXT_RULES.characters.uppercaseHeat) / 100) * deps.maxHeat;
        const heat = Number((lowerHeat + upperHeat).toFixed(2));
        if (heat > 0) {
          violations.push({
            key: "characters",
            heat: profileHeat(heat, "characters"),
            info: `lower:${lower} upper:${upper} ratio:${upperRatio.toFixed(2)}`,
          });
        }
      }
    }
  }

  if (!spamWhitelisted && ATTACHMENT_RULES.enabled && attachmentsEnabled) {
    const embedCount = Array.isArray(message.embeds) ? message.embeds.length : 0;
    const stickerCount = message.stickers?.size || 0;
    const attachmentList = [...(message.attachments?.values?.() || [])];
    const imageCount = attachmentList.filter((att?) => isImageAttachment(att)).length;
    const fileCount = Math.max(0, attachmentList.length - imageCount);
    const linkCount = filterUrlsForAttachmentLinkRule(extractedUrls).length;
    const attachmentScale = resolveAttachmentHeatScale(profile);
    const imageOnlyMax = resolveImageOnlyMaxCount(profile);
    const isImageOnlyGallery =
      hasMeaningfulTextPayload === false &&
      embedCount === 0 &&
      stickerCount === 0 &&
      fileCount === 0 &&
      linkCount === 0 &&
      imageCount > 0 &&
      imageCount <= imageOnlyMax;
    const imageHeatMultiplier =
      attachmentScale != null
        ? attachmentScale
        : isImageOnlyGallery
          ? AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER
          : 1;
    const scaleAttachmentHeat = (heat?) =>
      attachmentScale != null ? heat * attachmentScale : heat;

    if (ATTACHMENT_RULES.embeds.enabled && embedCount > 0) {
      violations.push({
        key: "attachment_embed",
        heat: profileHeat(
          scaleAttachmentHeat(embedCount * deps.percentToHeat(ATTACHMENT_RULES.embeds.heat)),
          "attachments",
        ),
        info: `${embedCount} embed`,
      });
    }
    if (ATTACHMENT_RULES.images.enabled && imageCount > 0) {
      violations.push({
        key: "attachment_image",
        heat: profileHeat(
          scaleAttachmentHeat(
            imageCount * deps.percentToHeat(ATTACHMENT_RULES.images.heat) * imageHeatMultiplier,
          ),
          "attachments",
        ),
        info: `${imageCount} image`,
      });
    }
    if (ATTACHMENT_RULES.files.enabled && fileCount > 0) {
      violations.push({
        key: "attachment_file",
        heat: profileHeat(
          scaleAttachmentHeat(fileCount * deps.percentToHeat(ATTACHMENT_RULES.files.heat)),
          "attachments",
        ),
        info: `${fileCount} file`,
      });
    }
    if (ATTACHMENT_RULES.links.enabled && linkCount > 0) {
      violations.push({
        key: "attachment_link",
        heat: profileHeat(
          scaleAttachmentHeat(linkCount * deps.percentToHeat(ATTACHMENT_RULES.links.heat)),
          "attachments",
        ),
        info: `${linkCount} link`,
      });
    }
    if (ATTACHMENT_RULES.stickers.enabled && stickerCount > 0) {
      violations.push({
        key: "attachment_sticker",
        heat: profileHeat(
          scaleAttachmentHeat(stickerCount * deps.percentToHeat(ATTACHMENT_RULES.stickers.heat)),
          "attachments",
        ),
        info: `${stickerCount} sticker`,
      });
    }
  }

  if (
    !spamWhitelisted &&
    TEXT_RULES.suspiciousAccount.enabled &&
    suspiciousMessageAuthor &&
    hasMeaningfulTextPayload
  ) {
    const hasStrongSignal = violations.some((v?) =>
      SUSPICIOUS_ACCOUNT_STRONG_KEYS.has(String(v?.key || "")),
    );
    const panicActive = isPanicModeActive(message.guildId);
    if (hasStrongSignal || panicActive) {
      violations.push({
        key: "suspicious_account",
        heat: profileHeat(
          deps.percentToHeat(TEXT_RULES.suspiciousAccount.heat),
          "suspiciousAccount",
        ),
        info: panicActive
          ? "suspicious member profile (panic mode)"
          : "suspicious member profile (strong trigger)",
      });
    }
  }

  return violations;
}

export = { detectViolations };
