const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { handleTtsMessage } = require("../Services/TTS/ttsService");
const { handleMinigameMessage } = require("../Services/Minigames/minigameService");
const { recordMessageActivity } = require("../Services/Community/activityService");
const { handleOfficialPrefixMessage } = require("../Utils/Prefix/officialPrefixDispatcher");
const{channelAllowsMedia,getCachedOrFetchMember,handleDisboardBump,handleDiscadiaBump,handleMovieNightVoteMessage,handlePauseChannelMessage,handleSuggestionChannelMessage,handleThreadVoteMessage,handleVoteManagerMessage,hasMediaPermission,isDiscordInviteLinkMessage,isMediaMessage,}=require("../Utils/Message/officialMessageAutomationHandlers");
const{handleAfk,handleCounting,handleMentionAutoReactions,handleWordReactions,logEventError,}=require("../Utils/Message/officialMessageCommunityHandlers");
const { handleAmbientOllamaMessage } = require("../Services/AI/ollamaChatRuntime");
const { runAutoModMessage } = require("../Services/Moderation/automodService");
const IDs = require("../Utils/Config/ids");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../Utils/Config/ephemeralMessageTtl");
const { isCoffeePrefixCommandToken } = require("../../shared/discord/coffeePrefixCommandTokens");
const { broadcastSiteRealtime } = require("../Utils/Web/siteSuggestionsBroadcast");
const { syncForumMentionNotificationsForMessage } = require("../Utils/Web/siteForumMentionNotifications");
const STAFF_BYPASS_PERMISSIONS=[PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ModerateMembers,];
const FORCE_DELETE_CHANNEL_IDS = new Set(
  [IDs.channels.messagesAutoDelete].filter(Boolean).map((id) => String(id)),
);
const VERIFY_PURGE_CHANNEL_IDS = new Set(
  [IDs.channels?.verify].filter(Boolean).map((id) => String(id)),
);
const MEDIA_BLOCK_EXEMPT_CATEGORY_ID = IDs.categories.categorChat;
const MEDIA_BLOCK_EXEMPT_CHANNEL_IDS=new Set(
  [
    IDs.channels.media,
    IDs.channels.contestSfondiMobile,
    IDs.channels.contestSfondiPc,
    IDs.channels.contestDisegni,
    IDs.channels.contestOutfitSubmission,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);
const WRONG_PREFIX_HINT_CHANNEL_IDS=new Set([IDs.channels.commands,IDs.channels.staffCmds].filter(Boolean).map((id) => String(id)),);
const AUTOMATION_RECHECK_DELAY_MS = 8000;
const automationRecheckJobs = new Map();

function resolveWebsiteForumChannelId(client) {
  return String(client?.config?.websiteForum?.channelId || IDs.channels?.forum || "").trim();
}

function isForumThreadMessageForRealtime(message, client) {
  if (!message?.guild || !message?.channel) return false;
  if (message?.system || message?.author?.bot || message?.webhookId) return false;
  const forumId = resolveWebsiteForumChannelId(client);
  if (!forumId) return false;
  const parentId = String(message.channel?.parentId || "");
  return parentId === forumId;
}

function hasAnyStaffBypassPermission(permissions) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm) => permissions.has(perm));
}

function resolvePrefixCommandByToken(client, token) {
  const safe = String(token || "").trim().toLowerCase();
  if (!safe) return null;
  return (
    client?.pcommands?.get?.(safe) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(safe)) ||
    null
  );
}

function parseWrongPrefixAttempt(content, validPrefix = "+") {
  const text = String(content || "").trim();
  const safePrefix = String(validPrefix || "+");
  if (!text || text.startsWith(safePrefix)) return null;
  const direct = text.match(/^((?:[a-z]{1,3})?[?!./-])\s*([a-z0-9][\w-]*)/i);
  if (direct) {
    return {
      usedPrefix: String(direct[1] || ""),
      token: String(direct[2] || "").toLowerCase(),
    };
  }
  const nearMiss = text.match(/^([a-z]{1,3})\s*([?!./-])\s*([a-z0-9][\w-]*)/i);
  if (nearMiss) {
    return {
      usedPrefix: `${String(nearMiss[1] || "")}${String(nearMiss[2] || "")}`,
      token: String(nearMiss[3] || "").toLowerCase(),
    };
  }
  return null;
}

async function messageAuthorHasHighStaffRole(message) {
  const roleId = String(IDs.roles?.HighStaff || "");
  if (!roleId || !message?.guild || !message?.author?.id) return false;
  let member = message.member;
  if (!member) {
    member = await getCachedOrFetchMember(message.guild, message.author.id).catch(() => null);
  }
  return Boolean(member?.roles?.cache?.has(roleId));
}

function shouldSendWrongPrefixHint(message, usedPrefix, commandName) {
  const client = message?.client;
  if (!client) return true;
  if (!client._wrongPrefixHintCooldown) {
    client._wrongPrefixHintCooldown = new Map();
  }
  const key=[String(message.guildId||"noguild"),String(message.channelId||"nochannel"),String(message.author?.id||"nouser"),String(usedPrefix||""),String(commandName||""),].join(":");
  const now = Date.now();
  const lastAt = Number(client._wrongPrefixHintCooldown.get(key) || 0);
  if (now - lastAt < 10_000) return false;
  client._wrongPrefixHintCooldown.set(key, now);
  return true;
}

async function maybeSendWrongPrefixHint(message, resolvedClient, validPrefix = "+") {
  if (!WRONG_PREFIX_HINT_CHANNEL_IDS.has(String(message?.channelId || ""))) {
    return false;
  }
  const safePrefix = String(validPrefix || "+");
  const attempt = parseWrongPrefixAttempt(message?.content || "", safePrefix);
  if (!attempt?.token || !attempt?.usedPrefix) return false;
  if (attempt.usedPrefix === safePrefix) return false;
  if (attempt.usedPrefix === "-" && isCoffeePrefixCommandToken(attempt.token)) {
    return false;
  }
  const command = resolvePrefixCommandByToken(resolvedClient, attempt.token);
  if (!command) return false;
  const cmdName = String(command.name || "").toLowerCase();
  if (cmdName === "help") return false;
  if (!shouldSendWrongPrefixHint(message, attempt.usedPrefix, command.name)) {
    return true;
  }
  const hint = await message.channel.send({ content: `\`${attempt.usedPrefix}${attempt.token}\` non è valido. Usa \`${safePrefix}${command.name}\`.`, }).catch(() => null);
  if (hint) scheduleMessageDeletion(hint, EPHEMERAL_TTL_SHORT_MS);
  return true;
}

function scheduleAutomationMessageRecheck(message, resolvedClient) {
  const messageId = String(message?.id || "");
  if (!messageId || automationRecheckJobs.has(messageId)) return;
  const timeout = setTimeout(async () => {
    automationRecheckJobs.delete(messageId);
    try {
      const channel = message?.channel;
      if (!channel?.messages?.fetch) return;
      const fresh = await channel.messages.fetch(messageId).catch(() => null);
      if (!fresh) return;
      if (await handleDisboardBump(fresh, resolvedClient)) return;
      if (await handleDiscadiaBump(fresh, resolvedClient)) return;
      await handleVoteManagerMessage(fresh, resolvedClient);
    } catch (error) {
      logEventError(resolvedClient, "AUTOMATION RECHECK ERROR", error);
    }
  }, AUTOMATION_RECHECK_DELAY_MS);
  timeout.unref?.();
  automationRecheckJobs.set(messageId, timeout);
}

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (!message) return;
    const resolvedClient = client || message.client;
    if (!resolvedClient) return;

    const isAutomatedMessage=Boolean(message.author?.bot||message.webhookId||message.applicationId,);
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    const defaultPrefix = String(resolvedClient?.config?.prefix || "+");
    let automodProcessed = false;

    const runAutomodOnce = async () => {
      if (automodProcessed) return { blocked: false, skipped: true };
      automodProcessed = true;
      if (message.system) return { blocked: false, skipped: true };
      if (message.webhookId) return runAutoModMessage(message);
      if (message.author?.bot || message.applicationId) return { blocked: false, skipped: true };
      return runAutoModMessage(message);
    };

    if (!isEditedPrefixExecution && message?.guild) {
      try {
        if (message.author?.bot || message.webhookId || message.applicationId) {
          if (await handleDisboardBump(message, resolvedClient)) return;
          if (await handleDiscadiaBump(message, resolvedClient)) return;
          scheduleAutomationMessageRecheck(message, resolvedClient);
        }
        if (message.author?.id !== resolvedClient?.user?.id) {
          const handledVote = await handleVoteManagerMessage(message, resolvedClient);
          if (handledVote) return;
          if (message.author?.bot || message.webhookId || message.applicationId) {
            scheduleAutomationMessageRecheck(message, resolvedClient);
          }
        }
      } catch (error) {
        logEventError(resolvedClient, "EARLY BUMP/VOTE HANDLER ERROR", error);
      }
    }

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
        await message.delete().catch(() => {});
        return;
      }
    }

    if (
      VERIFY_PURGE_CHANNEL_IDS.has(String(message?.channelId || "")) &&
      message.guild &&
      !message?.system &&
      !isEditedPrefixExecution
    ) {
      const botId = String(resolvedClient?.user?.id || "");
      if (message.author?.id !== botId && !(await messageAuthorHasHighStaffRole(message))) {
        try {
          await message.delete().catch(() => {});
        } catch (error) {
          logEventError(resolvedClient, "VERIFY CHANNEL PURGE ERROR", error);
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
          const { maybeBlockDiscordHeadingMarkdown } = require("../Services/Moderation/discordHeadingMarkdownBlock");
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
          message.member &&
          !isAutomatedMessage &&
          isMediaMessage(message) &&
          !isDiscordInviteLinkMessage(message) &&
          !hasMediaPermission(message.member) &&
          !channelAllowsMedia(message) &&
          message.channel?.parentId !== MEDIA_BLOCK_EXEMPT_CATEGORY_ID &&
          !MEDIA_BLOCK_EXEMPT_CHANNEL_IDS.has(message.channel?.id)
        ) {
          setImmediate(() => {
            recordMessageActivity(message).catch((err) =>
              logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", err),
            );
          });
          await message.delete().catch(() => {});
          const embed = new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription([`<:VC_Attention:1482534443632558151> Ciao ${message.author}, __non hai i permessi__ per inviare \`FOTO, GIF, LINK, VIDEO O AUDIO\` in chat.`, "", "<a:VC_StarPink:1330194976440848500> ➥ **__Sblocca il permesso:__**", `<a:VC_Arrow:1482706699365257397> Ottieni il ruolo: <@&${IDs.roles.PicPerms}>.`,
              ].join("\n"));
          await message.channel
            .send({ content: `${message.author}`, embeds: [embed] })
            .catch(() => null);
          return;
        }
        if (await handleSuggestionChannelMessage(message)) return;
        if (await handleMovieNightVoteMessage(message)) return;
        if (await handleThreadVoteMessage(message, resolvedClient)) return;
        if (await handlePauseChannelMessage(message)) return;
      }
    } catch (error) {
      logEventError(resolvedClient, "DISBOARD REMINDER ERROR", error);
    }

    try {
      if (!isEditedPrefixExecution && isForumThreadMessageForRealtime(message, resolvedClient)) {
        broadcastSiteRealtime({
          type: "forum_changed",
          at: new Date().toISOString(),
          threadId: String(message.channelId || ""),
          messageId: String(message.id || ""),
        });
        await syncForumMentionNotificationsForMessage(message, resolvedClient);
      }
    } catch (error) {
      logEventError(resolvedClient, "FORUM REALTIME BRIDGE ERROR", error);
    }

    if (message.author.bot || message.system || message.webhookId) {
      return;
    }

    if (!message.guild) {
      if (String(message.content || "").startsWith(defaultPrefix)) {
        try {
          await handleOfficialPrefixMessage({
            message,
            resolvedClient,
            defaultPrefix,
            overrideCommand: null,
            maybeSendWrongPrefixHint,
            getCachedOrFetchMember,
            hasAnyStaffBypassPermission,
          });
        } catch (error) {
          logEventError(resolvedClient, "PREFIX DM ERROR", error);
        }
      }
      return;
    }

    if (!isEditedPrefixExecution) {
      setImmediate(() => {
        recordMessageActivity(message).catch((err) =>
          logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", err),
        );
      });

      const[minigameResult,afkResult,mentionsResult,countingResult,wordReactionsResult]=await Promise.allSettled([handleMinigameMessage(message,resolvedClient),handleAfk(message),handleMentionAutoReactions(message),handleCounting(message,resolvedClient),handleWordReactions(message),]);
      if (minigameResult.status === "rejected") {
        logEventError(resolvedClient, "MINIGAME ERROR", minigameResult.reason);
      }
      if (afkResult.status === "rejected") {
        logEventError(resolvedClient, "AFK ERROR", afkResult.reason);
      }
      if (mentionsResult.status === "rejected") {
        logEventError(resolvedClient, "MENTION REACTION ERROR", mentionsResult.reason);
      }
      if (countingResult.status === "rejected") {
        logEventError(resolvedClient, "COUNTING ERROR", countingResult.reason);
      }
      if (wordReactionsResult.status === "rejected") {
        logEventError(resolvedClient, "WORD REACTIONS ERROR", wordReactionsResult.reason);
      }
    }

    let overrideCommand = null;
    if (!isEditedPrefixExecution) {
      try {
        await handleTtsMessage(message, resolvedClient, defaultPrefix);
      } catch (error) {
        logEventError(resolvedClient, "TTS ERROR", error);
      }
      try {
        if (await handleAmbientOllamaMessage(message, resolvedClient)) return;
      } catch (error) {
        logEventError(resolvedClient, "OLLAMA AMBIENT ERROR", error);
      }
    }

    await handleOfficialPrefixMessage({
      message,
      resolvedClient,
      defaultPrefix,
      overrideCommand,
      maybeSendWrongPrefixHint,
      getCachedOrFetchMember,
      hasAnyStaffBypassPermission,
    });
  },
};