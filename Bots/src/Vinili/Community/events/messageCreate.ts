const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { handleTtsMessage } = require("../../../shared/tts/services/ttsService") as typeof import("../../../shared/tts/services/ttsService");
const { handleMinigameMessage } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
const { recordMessageActivity } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
const { handleMessageCommunityExpBonuses } = require("../../Community/services/messageCommunityExpBonusesService") as typeof import("../../Community/services/messageCommunityExpBonusesService");
const { trackMessageEngagement } = require("../../Community/services/dailyEngagementStatsService") as typeof import("../../Community/services/dailyEngagementStatsService");
const { trackChannelMessage } = require("../../Community/services/dailyChannelMessageStatsService") as typeof import("../../Community/services/dailyChannelMessageStatsService");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  handleOfficialPrefixMessage,
  maybeSendWrongPrefixHint,
  hasAnyStaffBypassPermission,
} = require("../../core/officialPrefixDispatcher") as typeof import("../../core/officialPrefixDispatcher");
const { channelAllowsMedia, getCachedOrFetchMember, handleDisboardBump, handleDiscadiaBump, handleMovieNightVoteMessage, handlePauseChannelMessage, handleSanzioniChannelMessage, handleVoteManagerMessage, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage, } = require("../../Community/services/officialMessageAutomationHandlers") as typeof import("../../Community/services/officialMessageAutomationHandlers");
const { handleAfk, handleMentionAutoReactions, handleMentionAutoResponses, handleWordReactions, logEventError, } = require("../../Community/services/officialMessageCommunityHandlers") as typeof import("../../Community/services/officialMessageCommunityHandlers");
const { handleBirthdayAuguriReactions } = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const { runAutoModMessage } = require("../../Moderation/services/automodService") as typeof import("../../Moderation/services/automodService");
const { handleTicketMemberPromptMessage } = require("../../../MultiGuild/tickets/discord/ticketMemberPrompt") as typeof import("../../../MultiGuild/tickets/discord/ticketMemberPrompt");
const { handleUntrustedBotMessage, handleUntrustedApplicationMessage } = require("../../Moderation/services/trustedBotGuardService") as typeof import("../../Moderation/services/trustedBotGuardService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const guildMemberUpdateExtras = require("../../Community/services/boostAnnounceRecoveryService") as typeof import("../../Community/services/boostAnnounceRecoveryService");
const { handlePartnerDescriptionMessageUpsert, isPartnerDescriptionChannel } = require("../../Partner/services/partnerDescriptionSyncService") as typeof import("../../Partner/services/partnerDescriptionSyncService");
const {
  handleTenantPartnerDescriptionMessageUpsert,
  isTenantPartnerDescriptionChannel,
} = require("../../Partner/services/tenantPartnerDescriptionService") as typeof import("../../Partner/services/tenantPartnerDescriptionService");
const { shouldDeleteHumanPartnershipsChannelMessage, isHumanPartnershipChannelMessage } = require("../../Partner/runtime/partnerPointContextUtils") as typeof import("../../Partner/runtime/partnerPointContextUtils");
const { tryProcessManualPartnershipMessage } = require("../../Partner/services/tenantManualPartnershipService") as typeof import("../../Partner/services/tenantManualPartnershipService");
const FORCE_DELETE_CHANNEL_IDS = new Set([IDs.channels.messagesAutoDelete].filter(Boolean).map((id?) => String(id)));
const MEDIA_BLOCK_EXEMPT_CATEGORY_ID = IDs.categories.categorChat;
const MEDIA_BLOCK_EXEMPT_CHANNEL_IDS = new Set([IDs.channels.media].filter(Boolean).map((id?) => String(id)));
const TEST_GUILD_ID = String(IDs.guilds?.test || "").trim();
const AUTOMATION_RECHECK_DELAY_MS = 8000;
const VOTE_CHANNEL_ID = IDs.channels?.supporters;
const VOTE_AUTOMATION_RECHECK_DELAYS_MS = [1500, 3500, 8000];
const automationRecheckJobs = new Map();

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

async function executeTenantPartnershipMessageFlow(message?, resolvedClient?, defaultPrefix?, isEditedPrefixExecution?) {
  if (message.author?.bot || message.system || message.webhookId) return;

  if (!isEditedPrefixExecution) {
    try {
      const { runAutoResponders } = require("../../../MultiGuild/services/autoResponderRuntime") as typeof import("../../../MultiGuild/services/autoResponderRuntime");
      await runAutoResponders(message);
    } catch (error) {
      logEventError(resolvedClient, "AUTO RESPONDER ERROR", error);
    }
  }

  if (isHumanPartnershipChannelMessage(message)) {
    const manualResult: any = await tryProcessManualPartnershipMessage(message).catch(() => ({ handled: false }));
    if (manualResult?.handled) return;
    const prefixCommand = resolveOfficialPrefixCommandFromMessage(message, resolvedClient, defaultPrefix);
    if (prefixCommand) {
      const { sendPartnersChatDeniedPrefixCleanup, partnershipPublishChannelCommandsDeniedReplyContent } = require("../../Partner/runtime/partnersChatChannelUtils") as typeof import("../../Partner/runtime/partnersChatChannelUtils");
      const denied = partnershipPublishChannelCommandsDeniedReplyContent(message.channel);
      if (denied) {
        await sendPartnersChatDeniedPrefixCleanup(message, denied).catch(() => null);
        return;
      }
    }
    if (!prefixCommand) {
      if (shouldDeleteHumanPartnershipsChannelMessage(message) || manualResult?.delete) {
        await message.delete().catch(() => null);
      }
      return;
    }
  }

  if (
    message.guild?.id &&
    isTenantPartnerDescriptionChannel(message.guild.id, message.channelId)
  ) {
    void handleTenantPartnerDescriptionMessageUpsert(resolvedClient, message).catch(() => null);
  }

  await handleOfficialPrefixMessage({
    message,
    resolvedClient,
    defaultPrefix,
    overrideCommand: null,
    maybeSendWrongPrefixHint,
    getCachedOrFetchMember,
    hasAnyStaffBypassPermission,
  });
}

function resolvePrefixCommandByToken(client?, token?) {
  const safe = String(token || "").trim().toLowerCase();
  if (!safe) return null;
  return (
    client?.pcommands?.get?.(safe) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(safe)) ||
    null
  );
}

function resolveOfficialPrefixCommandFromMessage(message?, resolvedClient?, defaultPrefix?) {
  const content = String(message?.content || "");
  const prefix = String(defaultPrefix || "+");
  if (!content.startsWith(prefix)) return null;
  const args = content.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const rawCmd = args[0];
  if (!rawCmd) return null;
  const cmd = String(rawCmd)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase();
  return resolvePrefixCommandByToken(resolvedClient, cmd);
}

async function messageAuthorHasHighStaffRole(message?) {
  const roleId = String(IDs.roles?.HighStaff || "");
  if (!roleId || !message?.guild || !message?.author?.id) return false;
  let member = message.member;
  if (!member) {
    member = await getCachedOrFetchMember(message.guild, message.author.id).catch(() => null);
  }
  return Boolean(member?.roles?.cache?.has(roleId));
}

function cancelAutomationMessageRecheck(messageId?) {
  const key = String(messageId || "");
  if (!key) return;
  const job = automationRecheckJobs.get(key);
  if (!job) return;
  if (typeof job.cancel === "function") job.cancel();
  else clearTimeout(job);
  automationRecheckJobs.delete(key);
}

function scheduleAutomationMessageRecheck(message?, resolvedClient?, options: Record<string, any> = {}) {
  const messageId = String(message?.id || "");
  if (!messageId || automationRecheckJobs.has(messageId)) return;
  const isVoteChannel = VOTE_CHANNEL_ID && String(message?.channelId || "") === String(VOTE_CHANNEL_ID);
  const delays =
    options.voteFastRecheck && isVoteChannel
      ? VOTE_AUTOMATION_RECHECK_DELAYS_MS
      : [AUTOMATION_RECHECK_DELAY_MS];
  let attempt = 0;
  let cancelled = false;

  const runAttempt = () => {
    const delay = delays[attempt];
    if (delay == null) {
      automationRecheckJobs.delete(messageId);
      return;
    }
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      try {
        const channel = message?.channel;
        if (!channel?.messages?.fetch) {
          automationRecheckJobs.delete(messageId);
          return;
        }
        const fresh = await channel.messages.fetch(messageId).catch(() => null);
        if (!fresh) {
          automationRecheckJobs.delete(messageId);
          return;
        }
        if (await handleVoteManagerMessage(fresh, resolvedClient)) {
          automationRecheckJobs.delete(messageId);
          return;
        }
        if (await handleDisboardBump(fresh, resolvedClient)) {
          automationRecheckJobs.delete(messageId);
          return;
        }
        if (await handleDiscadiaBump(fresh, resolvedClient)) {
          automationRecheckJobs.delete(messageId);
          return;
        }
        attempt += 1;
        if (attempt < delays.length) {
          runAttempt();
          return;
        }
        automationRecheckJobs.delete(messageId);
      } catch (error) {
        automationRecheckJobs.delete(messageId);
        logEventError(resolvedClient, "AUTOMATION RECHECK ERROR", error);
      }
    }, delay);
    timeout.unref?.();
    automationRecheckJobs.set(messageId, {
      timeout,
      cancel: () => {
        cancelled = true;
        clearTimeout(timeout);
      },
    });
  };

  runAttempt();
}

export = {
  name: "messageCreate",
  async execute(message?, client?) {
    if (!message) return;
    const resolvedClient = client || message.client;
    if (!resolvedClient) return;

    const isAutomatedMessage = Boolean(message.author?.bot || message.webhookId || message.applicationId,);
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    const configPrefix = String(resolvedClient?.config?.prefix || "+");
    let defaultPrefix = configPrefix;
    if (message.guild?.id) {
      try {
        /* perfP1: sync sul hot path; fresh solo tenant con cache scaduta (main = fallback config). */
        const {
          resolveCommandPrefixForGuild,
          ensureTenantGuildSettingsCacheFresh,
          isTenantGuildSettingsCacheFresh,
        } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
        const gid = message.guild.id;
        if (!isViniliFullFeatureGuild(gid) && !isTenantGuildSettingsCacheFresh()) {
          await ensureTenantGuildSettingsCacheFresh().catch(() => null);
        }
        defaultPrefix = resolveCommandPrefixForGuild(gid, resolvedClient);
      } catch {
        defaultPrefix = configPrefix;
      }
    }
    let automodProcessed = false;

    if (message.guild && !isViniliFullFeatureGuild(message.guild.id)) {
      await executeTenantPartnershipMessageFlow(message, resolvedClient, defaultPrefix, isEditedPrefixExecution);
      return;
    }

    /* main/test: stesse AR della dashboard (non solo nei side-effect in setImmediate). */
    if (!isEditedPrefixExecution && message.guild && !isAutomatedMessage) {
      try {
        const { runAutoResponders } = require("../../../MultiGuild/services/autoResponderRuntime") as typeof import("../../../MultiGuild/services/autoResponderRuntime");
        await runAutoResponders(message);
      } catch (error) {
        logEventError(resolvedClient, "AUTO RESPONDER ERROR", error);
      }
    }

    if (!isAutomatedMessage && !isEditedPrefixExecution && message?.guild) {
      try {
        const { handleStarWarsMessage } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as any;
        if (typeof handleStarWarsMessage === "function") {
          const swHandled = await handleStarWarsMessage(message, resolvedClient);
          if (swHandled) return;
        }
      } catch (_) {}
    }

    if (!isEditedPrefixExecution && message?.guild) {
      try {
        const nativeBoost = guildMemberUpdateExtras.handleNativeBoostSystemMessage?.(message);
        if (nativeBoost?.userId) {
          const messageSlots = Math.max(1, Number(nativeBoost.messageSlots || nativeBoost.slots || 1));
          const nativeSlots = Math.max(1, Number(nativeBoost.slots || 1));
          /* boostFalseDouble3: "2 volte" sul singolo msg = burst; accumulo boost+tier ≠ 2 */
          const combinedBurst = messageSlots >= 2;
          const secondConfirmed = combinedBurst || nativeSlots >= 2;
          const nativeTs = Number(message.createdTimestamp || Date.now());
          void guildMemberUpdateExtras
            .recoverMissingBoostEmbedsForUser(message.guild, nativeBoost.userId, {
              knownNativeSlots: combinedBurst ? 2 : secondConfirmed ? Math.min(2, nativeSlots) : 1,
              expectedSlots: combinedBurst ? 2 : secondConfirmed ? Math.min(2, nativeSlots) : 1,
              nativeEventSlots: combinedBurst ? 2 : secondConfirmed ? Math.min(2, nativeSlots) : 1,
              messageSlots,
              confirmedDoubleBurst: combinedBurst,
              /* boostFalseDouble2: MAI incremental sul messageCreate —
                 il 1° system msg arrivava dopo memberUpdate (announced=1) e faceva announced+1=2. */
              nativeEventIncrement: false,
              allowSecondRecovery: secondConfirmed,
              secondBoostConfirmed: secondConfirmed,
              startedAt: Math.max(0, nativeTs - 30_000),
              skipNativeScan: combinedBurst,
              nativeLookbackMs: 6 * 60 * 60 * 1000,
              maxSend: combinedBurst || secondConfirmed ? 2 : 1,
            })
            .catch(() => null);
          /* perfP2: un solo ritento (5s) se non burst; concurrent meno frequente */
          if (!combinedBurst && !secondConfirmed) {
            setTimeout(() => {
              void guildMemberUpdateExtras
                .recoverMissingBoostEmbedsForUser(message.guild, nativeBoost.userId, {
                  knownNativeSlots: 0,
                  expectedSlots: 0,
                  startedAt: Math.max(0, nativeTs - 60_000),
                  nativeLookbackMs: 10 * 60 * 1000,
                  skipNativeScan: false,
                  allowSecondRecovery: true,
                  nativeScanVerified: true,
                  maxSend: 2,
                })
                .catch(() => null);
            }, 5000).unref?.();
          }
          const boostChannelId = require("../../Config/ids").channels?.supporters;
          const boostChannel =
            (boostChannelId && message.guild.channels.cache.get(boostChannelId)) ||
            message.channel;
          /* boostDedup1: concurrent recover solo per altri booster nella finestra */
          if (combinedBurst || secondConfirmed) {
            setTimeout(() => {
              guildMemberUpdateExtras
                .recoverConcurrentNativeBoosts(message.guild, boostChannel, {
                  windowMs: 3 * 60 * 1000,
                  skipUserId: nativeBoost.userId,
                })
                .catch(() => null);
            }, 4000).unref?.();
          }
        }
        if (message.author?.bot || message.webhookId || message.applicationId) {
          if (await handleDisboardBump(message, resolvedClient)) {
            cancelAutomationMessageRecheck(message.id);
            return;
          }
          if (await handleDiscadiaBump(message, resolvedClient)) {
            cancelAutomationMessageRecheck(message.id);
            return;
          }
          scheduleAutomationMessageRecheck(message, resolvedClient, { voteFastRecheck: true });
        }
        if (message.author?.id !== resolvedClient?.user?.id) {
          const handledVote = await handleVoteManagerMessage(message, resolvedClient);
          if (handledVote) {
            cancelAutomationMessageRecheck(message.id);
            return;
          }
          if (message.author?.bot || message.webhookId || message.applicationId) {
            scheduleAutomationMessageRecheck(message, resolvedClient, { voteFastRecheck: true });
          }
        }
      } catch (error) {
        logEventError(resolvedClient, "EARLY BUMP/VOTE HANDLER ERROR", error);
      }
    }

    if (!isEditedPrefixExecution && message.guild && message.applicationId) {
      try {
        if (await handleUntrustedApplicationMessage(message)) return;
      } catch (error) {
        logEventError(resolvedClient, "TRUSTED APP GUARD ERROR", error);
      }
    }

    if (!isEditedPrefixExecution && message.guild && message.author?.bot) {
      try {
        if (await handleUntrustedBotMessage(message)) return;
      } catch (error) {
        logEventError(resolvedClient, "TRUSTED BOT GUARD ERROR", error);
      }
    }

    const runAutomodOnce = async () => {
      if (automodProcessed) return { blocked: false, skipped: true };
      automodProcessed = true;
      if (message.system) return { blocked: false, skipped: true };
      if (message.webhookId) return runAutoModMessage(message);
      if (message.applicationId) return { blocked: false, skipped: true };
      if (message.author?.bot) return { blocked: false, skipped: true };
      return runAutoModMessage(message);
    };

    if (
      FORCE_DELETE_CHANNEL_IDS.has(String(message?.channelId || "")) &&
      !message?.system
    ) {
      if (!isEditedPrefixExecution) {
        try {
          const automodResult = await runAutomodOnce();
          if (automodResult?.blocked) return;
        } catch (error) {
          logEventError(resolvedClient, "AUTOMOD ERROR", error);
        }
      }
      if (!(await messageAuthorHasHighStaffRole(message))) {
        await message.delete().catch(() => { });
        return;
      }
    }

    if (isHumanPartnershipChannelMessage(message)) {
      if (!isEditedPrefixExecution) {
        try {
          const automodResult = await runAutomodOnce();
          if (automodResult?.blocked) return;
        } catch (error) {
          logEventError(resolvedClient, "AUTOMOD ERROR", error);
        }
      }
      const manualResult: any = await tryProcessManualPartnershipMessage(message).catch(() => ({ handled: false }));
      if (manualResult?.handled) return;
      const prefixCommand = resolveOfficialPrefixCommandFromMessage(message, resolvedClient, defaultPrefix);
      if (prefixCommand) {
        const { sendPartnersChatDeniedPrefixCleanup, partnershipPublishChannelCommandsDeniedReplyContent } = require("../../Partner/runtime/partnersChatChannelUtils") as typeof import("../../Partner/runtime/partnersChatChannelUtils");
        const denied = partnershipPublishChannelCommandsDeniedReplyContent(message.channel);
        if (denied) {
          await sendPartnersChatDeniedPrefixCleanup(message, denied).catch(() => null);
          return;
        }
      }
      if (!prefixCommand) {
        if (shouldDeleteHumanPartnershipsChannelMessage(message) || manualResult?.delete) {
          await message.delete().catch(() => { });
        }
        return;
      }
    }

    if (!isEditedPrefixExecution) {
      try {
        const automodResult = await runAutomodOnce();
        if (automodResult?.blocked) return;
      } catch (error) {
        logEventError(resolvedClient, "AUTOMOD ERROR", error);
      }
      if (message.guild && !message.system) {
        try {
          const { maybeBlockDiscordHeadingMarkdown } = require("../../Moderation/services/discordHeadingMarkdownBlock") as typeof import("../../Moderation/services/discordHeadingMarkdownBlock");
          if (await maybeBlockDiscordHeadingMarkdown(message)) return;
        } catch (error) {
          logEventError(resolvedClient, "HEADING MARKDOWN BLOCK ERROR", error);
        }
      }
    }

    try {
      if (!isEditedPrefixExecution) {
        if (
          message.guild &&
          TEST_GUILD_ID &&
          String(message.guild.id) !== TEST_GUILD_ID &&
          message.member &&
          !isAutomatedMessage &&
          isMediaMessage(message) &&
          !isDiscordInviteLinkMessage(message) &&
          !hasMediaPermission(message.member) &&
          !channelAllowsMedia(message) &&
          message.channel?.parentId !== MEDIA_BLOCK_EXEMPT_CATEGORY_ID &&
          !MEDIA_BLOCK_EXEMPT_CHANNEL_IDS.has(message.channel?.id) &&
          /* picPermsCmdExempt1: +play/+… con URL non devono essere bloccati come "link" */
          !resolveOfficialPrefixCommandFromMessage(message, resolvedClient, defaultPrefix)
        ) {
          setImmediate(() => {
            recordMessageActivity(message).catch((err?) => logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", err));
          });
          await message.delete().catch(() => { });
          const embed = new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription([`${E.VC_Attention} Ciao ${message.author}, __non hai i permessi__ per inviare \`FOTO, GIF, LINK, VIDEO O AUDIO\` in chat.`, "", `${E.VC_StarPink} ${E.VC_Arrow} **Sblocca il permesso:**`, `${E.VC_Arrow} Ottieni il ruolo: <@&${IDs.roles.PicPerms}>.\n\n${E.VC_spongebobdance} **Scopri di più sul nostro sito:** [viniliecaffe.it](https://www.viniliecaffe.it/)`,
            ].join("\n"));
          await message.channel
            .send({ content: `${message.author}`, embeds: [embed] })
            .catch(() => null);
          return;
        }
        if (await handleMovieNightVoteMessage(message)) return;
        if (await handlePauseChannelMessage(message)) return;
        if (await handleSanzioniChannelMessage(message)) return;
      }
    } catch (error) {
      logEventError(resolvedClient, "DISBOARD REMINDER ERROR", error);
    }

    if (message.author.bot || message.system || message.webhookId) {
      return;
    }

    if (!isEditedPrefixExecution && message.guild) {
      try {
        const { handleStaffManagedThreadRoleMentionMessage } = require("../../Staff/utils/staffManagedThreadsGuard") as typeof import("../../Staff/utils/staffManagedThreadsGuard");
        if (await handleStaffManagedThreadRoleMentionMessage(message)) return;
      } catch (error) {
        logEventError(resolvedClient, "STAFF THREAD ROLE MENTION GUARD ERROR", error);
      }
    }

    if (!isEditedPrefixExecution && message.guild) {
      try {
        if (await handleTicketMemberPromptMessage(message)) return;
      } catch (error) {
        logEventError(resolvedClient, "TICKET MEMBER PROMPT ERROR", error);
      }
    }

    if (!isEditedPrefixExecution && message.guild) {
      try {
        const { handleStanzaPanelPromptMessageCreate } = require("../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../Voice/services/stanzaVoiceRoomsService");
        if (await handleStanzaPanelPromptMessageCreate(message)) return;
      } catch (error) {
        logEventError(resolvedClient, "STANZA PANEL PROMPT ERROR", error);
      }
    }

    if (message.guild) {
      setImmediate(() => {
        trackChannelMessage(message).catch((err?) =>
          logEventError(resolvedClient, "DAILY CHANNEL MESSAGE STATS ERROR", err),
        );
      });
    }

    if (!message.guild) {
      if (String(message.content || "").startsWith(defaultPrefix)) {
        try {
          await handleOfficialPrefixMessage({ message, resolvedClient, defaultPrefix, overrideCommand: null, maybeSendWrongPrefixHint, getCachedOrFetchMember, hasAnyStaffBypassPermission });
        } catch (error) {
          logEventError(resolvedClient, "PREFIX DM ERROR", error);
        }
      }
      return;
    }

    if (!isEditedPrefixExecution) {
      setImmediate(() => {
        recordMessageActivity(message).catch((err?) =>
          logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", err),
        );
        handleMessageCommunityExpBonuses(message).catch((err?) =>
          logEventError(resolvedClient, "COMMUNITY EXP BONUS ERROR", err),
        );
        trackMessageEngagement(message).catch((err?) =>
          logEventError(resolvedClient, "DAILY ENGAGEMENT MESSAGE ERROR", err),
        );
      });

      const runCommunitySideEffects = () =>
        Promise.allSettled([
          handleMinigameMessage(message, resolvedClient),
          handleAfk(message),
          handleMentionAutoReactions(message),
          handleMentionAutoResponses(message),
          handleWordReactions(message),
          handleBirthdayAuguriReactions(message),
        ]).then((results?) => {
          const labels = [
            "MINIGAME ERROR",
            "AFK ERROR",
            "MENTION REACTION ERROR",
            "MENTION RESPONSE ERROR",
            "WORD REACTIONS ERROR",
            "BIRTHDAY AUGURI REACT ERROR",
          ];
          for (let i = 0; i < results.length; i += 1) {
            if (results[i].status === "rejected") {
              logEventError(resolvedClient, labels[i], (results[i] as any).reason);
            }
          }
        });

      /* perfP0: community + TTS fuori dal critical path (anche non-prefix). Counting archiviato. */
      setImmediate(() => {
        runCommunitySideEffects().catch(() => null);
      });
    }

    let overrideCommand = null;
    if (!isEditedPrefixExecution) {
      const isPrefixLike = String(message.content || "").trim().startsWith(String(defaultPrefix || "+"));
      if (!isPrefixLike) {
        setImmediate(() => {
          handleTtsMessage(message, resolvedClient, defaultPrefix).catch((error?) =>
            logEventError(resolvedClient, "TTS ERROR", error),
          );
        });
      }
    }

    /* perfP2: partner description fuori dal hot path sync */
    if (message.guild && isPartnerDescriptionChannel(message.channelId)) {
      setImmediate(() => {
        void handlePartnerDescriptionMessageUpsert(resolvedClient, message).catch(() => null);
      });
    }
    if (
      message.guild?.id &&
      isTenantPartnerDescriptionChannel(message.guild.id, message.channelId)
    ) {
      setImmediate(() => {
        void handleTenantPartnerDescriptionMessageUpsert(resolvedClient, message).catch(() => null);
      });
    }

    await handleOfficialPrefixMessage({ message, resolvedClient, defaultPrefix, overrideCommand, maybeSendWrongPrefixHint, getCachedOrFetchMember, hasAnyStaffBypassPermission });
  },
};