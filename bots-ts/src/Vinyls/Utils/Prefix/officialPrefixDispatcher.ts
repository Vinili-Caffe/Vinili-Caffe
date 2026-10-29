const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, } = require("discord.js") as typeof import("discord.js");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter") as typeof import("../Embeds/defaultFooter");
const {
  applyTenantPayloadBranding,
  stripTenantBrandingInternals,
  shouldSkipPrefixDispatcherBranding,
} = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

function finalizePrefixOutgoingPayload(payload?, guild?) {
  const withFooter = applyDefaultFooterToEmbeds(payload, guild);
  if (!guild?.id || shouldSkipPrefixDispatcherBranding(withFooter)) {
    return stripTenantBrandingInternals(withFooter);
  }
  return stripTenantBrandingInternals(
    applyTenantPayloadBranding(withFooter, {
      guildId: guild.id,
      guild,
      client: guild.client,
      partnershipBranding: true,
    }),
  );
}
const { checkPrefixPermission, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, } = require("../Moderation/commandPermissions") as typeof import("../Moderation/commandPermissions");
const { getUserCommandCooldownSeconds, consumeUserCooldown, } = require("../Moderation/commandCooldown") as typeof import("../Moderation/commandCooldown");
const { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildMissingArgumentsErrorEmbed, buildInternalCommandErrorEmbed, } = require("../Moderation/commandErrorEmbeds") as typeof import("../Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../../../shared/discord/errorLogEmbed") as typeof import("../../../shared/discord/errorLogEmbed");
const { getCentralChannel } = require("../Logging/commandUsageLogger") as typeof import("../Logging/commandUsageLogger");
const { shouldBlockModerationCommands } = require("../../Services/Moderation/antiNukeService") as typeof import("../../Services/Moderation/antiNukeService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService") as typeof import("../../Services/Moderation/securityOrchestratorService");
const { showPrefixUsageGuide } = require("../Moderation/prefixUsageGuide") as typeof import("../Moderation/prefixUsageGuide");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { EPHEMERAL_TTL_SHORT_MS } = require("../Config/ephemeralMessageTtl") as typeof import("../Config/ephemeralMessageTtl");
const PREFIX_COOLDOWN_BYPASS_ROLE_ID = IDs.roles.Staff;
const PREFIX_PRECHECK_TIMEOUT_MS = 12_000;
const PREFIX_EXECUTION_TIMEOUT_MS = Math.max(15_000, Number(process.env.PREFIX_EXECUTION_TIMEOUT_MS || 120_000),);
const PREFIX_QUEUE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "prefixQueueSnapshot.json");
const PREFIX_QUEUE_MAX_ITEMS_PER_LOCK = 100;
const PREFIX_QUEUE_MAX_AGE_MS = 20 * 60 * 1000;
const REMOVED_PREFIX_COMMANDS = new Set([
  "colors",
  "staff",
  "verify",
  "ticket",
  "notify",
  "sezioneproibita",
  "libriproibiti",
  "forbiddenbooks",
  "live",
]);
const FIRE_AND_FORGET_PREFIX_COMMANDS = new Set([]);

function serializePrefixQueuePayload(row?) {
  return {
    channelId: String(row?.channelId || row?.message?.channelId || ""),
    messageId: String(row?.messageId || row?.message?.id || ""),
    args: Array.isArray(row?.args) ? row.args.map((arg?) => String(arg || "")) : [],
    commandName: String(row?.commandName || row?.command?.name || "").trim().toLowerCase(),
    enqueuedAt: Number(row?.enqueuedAt || Date.now()),
  };
}

function readPrefixQueueSnapshotRaw() {
  const raw = readSnapshotWithMeta({
    filePath: PREFIX_QUEUE_SNAPSHOT_PATH,
    walPath: `${PREFIX_QUEUE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_prefix_queue",
    version: 1,
    fallback: { queues: {} },
  });
  return raw?.queues && typeof raw.queues === "object" ? raw.queues : {};
}

function persistPrefixQueueSnapshotNow(client?) {
  try {
    const queues: Record<string, any> = {};
    const source = client?.prefixCommandQueue;
    if (source instanceof Map) {
      for (const [lockId, rows] of source.entries()) {
        const key = String(lockId || "").trim();
        if (!key || !Array.isArray(rows) || rows.length === 0) continue;
        const serialized = rows
          .map(serializePrefixQueuePayload)
          .filter((row?) => row.channelId && row.messageId && row.commandName);
        if (serialized.length) queues[key] = serialized.slice(0, PREFIX_QUEUE_MAX_ITEMS_PER_LOCK);
      }
    }
    if (client?.prefixCommandInFlight instanceof Map) {
      for (const [lockId, payload] of client.prefixCommandInFlight.entries()) {
        const key = String(lockId || "").trim();
        if (!key || !payload) continue;
        const row = serializePrefixQueuePayload(payload);
        if (!row.channelId || !row.messageId || !row.commandName) continue;
        if (!queues[key]) queues[key] = [];
        queues[key].unshift(row);
        queues[key] = queues[key].slice(0, PREFIX_QUEUE_MAX_ITEMS_PER_LOCK);
      }
    }
    writeSnapshotWithMeta({
      filePath: PREFIX_QUEUE_SNAPSHOT_PATH,
      walPath: `${PREFIX_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "vinyls_prefix_queue",
      version: 1,
      payload: { queues },
    });
  } catch {
      }
}

function resolvePrefixCommandByName(client?, commandName?) {
  const cmdKey = String(commandName || "").trim().toLowerCase();
  if (!cmdKey || !client?.pcommands) return null;
  const direct = client.pcommands.get(cmdKey);
  if (direct) return direct;
  const aliasTarget = client.aliases?.get?.(cmdKey);
  if (aliasTarget) return client.pcommands.get(aliasTarget) || null;
  return null;
}

function ensurePrefixQueueLoaded(client?) {
  if (!client || client._prefixQueueSnapshotLoaded) return;
  armShutdownCheckpoint();
  client._prefixQueueSnapshotLoaded = true;
  if (!client.prefixCommandQueue) client.prefixCommandQueue = new Map();
  const queues = readPrefixQueueSnapshotRaw();
  for (const [lockId, rows] of Object.entries(queues)) {
    if (!lockId || !Array.isArray(rows) || !rows.length) continue;
    const sanitized = rows
      .map((row?) => ({
        channelId: String(row?.channelId || ""),
        messageId: String(row?.messageId || ""),
        args: Array.isArray(row?.args) ? row.args.map((arg?) => String(arg || "")) : [],
        commandName: String(row?.commandName || "").trim().toLowerCase(),
        enqueuedAt: Number(row?.enqueuedAt || Date.now()),
      }))
      .filter(
        (row?) =>
          row.channelId &&
          row.messageId &&
          row.commandName &&
          Date.now() - Number(row.enqueuedAt || 0) <= PREFIX_QUEUE_MAX_AGE_MS,
      )
      .slice(0, PREFIX_QUEUE_MAX_ITEMS_PER_LOCK);
    if (sanitized.length) client.prefixCommandQueue.set(String(lockId), sanitized);
  }
  if (!client.prefixCommandLocks) client.prefixCommandLocks = new Set();
  if (!client._prefixQueueSnapshotFlushRegistered) {
    client._prefixQueueSnapshotFlushRegistered = true;
    registerShutdownFlush("vinyls_prefix_queue", () => persistPrefixQueueSnapshotNow(client));
  }
  for (const [lockId, rows] of client.prefixCommandQueue.entries()) {
    if (!rows?.length || client.prefixCommandLocks.has(lockId)) continue;
    setTimeout(() => {
      drainPrefixQueue(lockId, client).catch(() => null);
    }, 500).unref?.();
  }
}

function hasSendablePayload(data?) {
  if (typeof data === "string") return data.trim().length > 0;
  if (!data || typeof data !== "object") return false;
  const hasContent = typeof data.content === "string" ? data.content.trim().length > 0 : data.content != null;
  return Boolean(
    hasContent ||
    (Array.isArray(data.embeds) && data.embeds.length > 0) ||
    (Array.isArray(data.components) && data.components.length > 0) ||
    (Array.isArray(data.files) && data.files.length > 0) ||
    (Array.isArray(data.stickers) && data.stickers.length > 0) ||
    (Array.isArray(data.attachments) && data.attachments.length > 0) ||
    data.poll,
  );
}

async function sendTemporaryMessage(channel?, payload?, ttlMs?) {
  const { coercePlainContentToNoticePayload } = require("../Embeds/simpleNoticeEmbed") as typeof import("../Embeds/simpleNoticeEmbed");
  let out = coercePlainContentToNoticePayload(payload, channel?.guild) || payload;
  if (channel?.guild) {
    out = finalizePrefixOutgoingPayload(out, channel.guild) || out;
  }
  const sent = await channel.send(out).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => sent.delete().catch(() => { }), ttlMs);
    timer.unref?.();
  }
  return sent;
}

async function sendTemporaryReply(message?, payload?, ttlMs?) {
  const { coercePlainContentToNoticePayload } = require("../Embeds/simpleNoticeEmbed") as typeof import("../Embeds/simpleNoticeEmbed");
  let out = coercePlainContentToNoticePayload(payload, message?.guild) || payload;
  if (message?.guild) {
    out = finalizePrefixOutgoingPayload(out, message.guild) || out;
  }
  const sent = await message.reply(out).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => sent.delete().catch(() => { }), ttlMs);
    timer.unref?.();
  }
  return sent;
}

async function addLoadingReaction(message?) {
  const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
  const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
  const emoji = loadingEmojiId ? message.client?.emojis?.cache?.get(loadingEmojiId) : null;
  if (emoji) {
    await message.react(emoji).catch(() => {});
    return;
  }
  if (fallbackEmojiId) {
    await message.react(fallbackEmojiId).catch(() => {});
    return;
  }
  await message.react("\u23F3").catch(() => {});
}

async function removeLoadingReaction(message?, resolvedClient?) {
  try {
    const loadingId = IDs.emojis?.loadingAnimatedId;
    const fallbackId = IDs.emojis?.loadingFallbackId;
    const emoji = loadingId ? message.client?.emojis?.cache?.get(loadingId) : null;
    if (emoji) {
      const react = message.reactions?.resolve?.(emoji.id);
      if (react) await react.users.remove(resolvedClient.user.id);
    }
    const fallback = message.reactions?.resolve?.("VC_Loading") || (fallbackId ? message.reactions?.resolve?.(fallbackId) : null);
    if (fallback) await fallback.users.remove(resolvedClient.user.id);
  } catch (_) {}
}

async function resolveWithTimeout(task?, fallbackValue?, label?, timeoutMs = PREFIX_PRECHECK_TIMEOUT_MS) {
  let timer = null;
  try {
    const raced: any = await Promise.race([
      Promise.resolve()
        .then(task)
        .then((value?) => ({ timedOut: false, value })),
      new Promise((resolve?) => {
        timer = setTimeout(() => resolve({ timedOut: true, value: fallbackValue }), timeoutMs);
        timer.unref?.();
      }),
    ]);
    if (raced?.timedOut) {
      global.logger?.warn?.(`[PREFIX] ${label} timed out after ${timeoutMs}ms`);
    }
    return raced?.value;
  } catch (error) {
    global.logger?.warn?.(`[PREFIX] ${label} failed:`, error);
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildSubcommandKeywordSet(command?) {
  const known = new Set();
  if (Array.isArray(command?.subcommands)) {
    for (const sub of command.subcommands) {
      const normalized = String(sub || "").trim().toLowerCase();
      if (normalized) known.add(normalized);
    }
  }
  if (command?.subcommandAliases && typeof command.subcommandAliases === "object") {
    for (const [alias, target] of Object.entries(command.subcommandAliases)) {
      const aliasNormalized = String(alias || "").trim().toLowerCase();
      const targetNormalized = String(target || "").trim().toLowerCase();
      if (aliasNormalized) known.add(aliasNormalized);
      if (targetNormalized) known.add(targetNormalized);
    }
  }
  return known;
}

function tokenIsKnownSubcommand(command?, rawToken?) {
  if (!rawToken) return false;
  const raw = String(rawToken).trim().toLowerCase();
  const known = buildSubcommandKeywordSet(command);
  if (!known.size) return false;
  return known.has(raw);
}

function resolveSubcommandState(command?, cmd?, args?) {
  const rawPrefixSubcommandArg = args[0] ? String(args[0]).toLowerCase() : null;
  const keywordSet = buildSubcommandKeywordSet(command);
  if (rawPrefixSubcommandArg && keywordSet.size > 0 && !keywordSet.has(rawPrefixSubcommandArg)) {
    return null;
  }
  const prefixSubcommandFromArgs = rawPrefixSubcommandArg && command?.subcommandAliases ? command.subcommandAliases[rawPrefixSubcommandArg] || rawPrefixSubcommandArg : rawPrefixSubcommandArg;
  const prefixSubcommandFromAlias = command?.subcommandAliases ? command.subcommandAliases[cmd] || null : null;
  const shouldPreferAliasSubcommand =
    Boolean(rawPrefixSubcommandArg) &&
    Boolean(prefixSubcommandFromAlias) &&
    !hasKnownSubcommand(command, rawPrefixSubcommandArg, rawPrefixSubcommandArg);
  const prefixSubcommand = shouldPreferAliasSubcommand
    ? prefixSubcommandFromAlias
    : (prefixSubcommandFromArgs || prefixSubcommandFromAlias || null);

  if (
    rawPrefixSubcommandArg &&
    prefixSubcommandFromArgs &&
    rawPrefixSubcommandArg !== prefixSubcommandFromArgs
  ) {
    args[0] = prefixSubcommandFromArgs;
  }
  if (!rawPrefixSubcommandArg && prefixSubcommandFromAlias) {
    args.unshift(prefixSubcommandFromAlias);
  }

  return prefixSubcommand;
}

function hasKnownSubcommand(command?, rawSubcommandArg?, resolvedSubcommand?) {
  const raw = String(rawSubcommandArg || "").trim().toLowerCase();
  const resolved = String(resolvedSubcommand || "").trim().toLowerCase();
  if (!raw && !resolved) return true;
  const known = buildSubcommandKeywordSet(command);
  if (!known.size) return true;
  return known.has(raw) || known.has(resolved);
}

async function executePrefixCommandRuntime({
  payload,
  resolvedClient,
}) {
  const { message: execMessage, args: execArgs, command: execCommand, } = payload;

  const originalReply = execMessage.reply.bind(execMessage);
  const commandMessage = Object.create(execMessage);
  commandMessage.reply = (replyPayload?) => {
    const withFooter = finalizePrefixOutgoingPayload(replyPayload, execMessage.guild);
    if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
    return originalReply(withFooter).then((result?) => {
      stopTyping();
      return result;
    }).catch((err?) => {
      stopTyping();
      throw err;
    });
  };

  const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
  const commandChannel = execMessage.channel ? Object.create(execMessage.channel) : execMessage.channel;

  if (originalChannelSend) {
    commandChannel.send = (sendPayload?) => {
      const withFooter = finalizePrefixOutgoingPayload(sendPayload, execMessage.guild);
      if (!hasSendablePayload(withFooter)) return Promise.resolve(null);

      const sendWithReferenceFallback = async (primaryPayload?, fallbackPayload?) => { try { return await originalChannelSend(primaryPayload); } catch (error) { const hasUnknownRef = error?.code === 50035 && Boolean(error?.rawError?.errors?.message_reference); if (!hasUnknownRef) throw error; return originalChannelSend(fallbackPayload); } };
      const afterSend = (p?) => p.then((result?) => { stopTyping(); return result; }).catch((err?) => { stopTyping(); throw err; });

      if (typeof withFooter === "string") {
        return afterSend(sendWithReferenceFallback(
          {
            content: withFooter,
            reply: {
              messageReference: execMessage.id,
              failIfNotExists: false,
            },
            allowedMentions: { repliedUser: false },
            failIfNotExists: false,
          },
          { content: withFooter, allowedMentions: { repliedUser: false } },
        ));
      }

      if (!withFooter || typeof withFooter !== "object") {
        return afterSend(originalChannelSend(withFooter));
      }

      const normalized = { ...withFooter, reply: withFooter.reply || (withFooter.messageReference ? undefined : { messageReference: execMessage.id, failIfNotExists: false }), failIfNotExists: withFooter.failIfNotExists ?? false, allowedMentions: { ...(withFooter.allowedMentions || {}), repliedUser: withFooter.allowedMentions?.repliedUser ?? false, }, };
      const fallback = { ...normalized };
      delete fallback.reply;
      delete fallback.messageReference;
      delete fallback.failIfNotExists;
      return afterSend(sendWithReferenceFallback(normalized, fallback));
    };
  }

  const originalSendTyping = execMessage.channel?.sendTyping?.bind(execMessage.channel);
  let typingStartTimer = null;
  let typingPulseTimer = null;
  let commandFinished = false;

  const stopTyping = () => {
    if (commandFinished) return;
    commandFinished = true;
    if (typingStartTimer) {
      clearTimeout(typingStartTimer);
      typingStartTimer = null;
    }
    if (typingPulseTimer) {
      clearInterval(typingPulseTimer);
      typingPulseTimer = null;
    }
  };

  if (originalSendTyping) {
    const sendTypingSafe = async () => { if (commandFinished) return; try { await originalSendTyping(); } catch (err) { global.logger?.warn?.("[prefixDispatcher] sendTyping:", err?.message || err); } };

    typingStartTimer = setTimeout(async () => {
      if (commandFinished) return;
      await sendTypingSafe();
      typingPulseTimer = setInterval(() => {
        void sendTypingSafe();
      }, 8000);
      typingPulseTimer.unref?.();
    }, 2500);
    typingStartTimer.unref?.();

    commandChannel.sendTyping = async () => {
      await sendTypingSafe();
    };
  }

  if (commandChannel) {
    commandMessage.channel = commandChannel;
  }

  const cmdName = String(execCommand?.name || "").toLowerCase();
  const fireAndForget =
    !execMessage?.__webTicketSync &&
    (FIRE_AND_FORGET_PREFIX_COMMANDS.has(cmdName) || execCommand?.fireAndForget === true);
  if (fireAndForget) {
    void Promise.resolve(execCommand.execute(commandMessage, execArgs, resolvedClient)).catch((err?) => {
      global.logger?.error?.(
        `[PREFIX] fire-and-forget command=${cmdName} guild=${String(execMessage?.guild?.id || "dm")} user=${String(execMessage?.author?.id || "unknown")}`,
        err?.stack || err?.message || err,
      );
    });
    commandFinished = true;
    if (typingStartTimer) clearTimeout(typingStartTimer);
    if (typingPulseTimer) clearInterval(typingPulseTimer);
    return null;
  }

  try {
    await Promise.race([
      Promise.resolve(
        execCommand.execute(commandMessage, execArgs, resolvedClient),
      ),
      new Promise((_?, reject?) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Prefix command "${String(execCommand?.name || "unknown")}" timed out after ${PREFIX_EXECUTION_TIMEOUT_MS}ms`,
            ),
          );
        }, PREFIX_EXECUTION_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    try {
      const { maybeApplyTenantEphemeralCommandCleanup } = require("../Partner/tenantProfileEphemeral") as typeof import("../Partner/tenantProfileEphemeral");
      void maybeApplyTenantEphemeralCommandCleanup(execMessage, cmdName);
    } catch (_) {}
  } catch (error) {
    global.logger?.error?.(
      `[PREFIX COMMAND ERROR] command=${String(execCommand?.name || "unknown")} guild=${String(execMessage?.guild?.id || "dm")} user=${String(execMessage?.author?.id || "unknown")}`,
      error?.stack || error?.message || error,
    );
    const channelID = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = channelID ? await getCentralChannel(resolvedClient, channelID) : null;
    const errorEmbed = buildErrorLogEmbed({
      contextLabel: "Comando", contextValue: execCommand?.name || "unknown", userTag: execMessage.author?.tag || "unknown", error, serverName: execMessage.guild ? `${execMessage.guild.name}[${execMessage.guild.id}]`
        : null,
    });

    if (errorChannel?.isTextBased?.()) {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("error_pending").setEmoji(`<:VC_InactiveStatus:1482526984234860574>`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("error_solved").setEmoji(`<:VC_OnlineStatus:1482527088912240650>`).setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("error_unsolved").setEmoji(`<:VC_OfflineStatus:1482527117051957380>`).setStyle(ButtonStyle.Danger),);
      const sentError = await errorChannel.send({ embeds: [errorEmbed], components: [row] }).catch(() => null);

      
    }

    const feedback = buildInternalCommandErrorEmbed(error);
    if (!execCommand?.keepCommandMessage) {
      await execMessage.delete().catch(() => null);
    }
    return sendTemporaryReply(execMessage, { embeds: [feedback] }, EPHEMERAL_TTL_SHORT_MS);
  } finally {
    commandFinished = true;
    if (typingStartTimer) clearTimeout(typingStartTimer);
    if (typingPulseTimer) clearInterval(typingPulseTimer);
  }

  return null;
}

async function drainPrefixQueue(lockId?, resolvedClient?) {
  const resolveQueuedMessage = async (payload?) => { const fallback = payload?.message || null; const channelId = String(payload?.channelId || fallback?.channelId || ""); const messageId = String(payload?.messageId || fallback?.id || ""); if (!channelId || !messageId) return fallback; try { const channel = resolvedClient.channels?.cache?.get(channelId) || (await resolvedClient.channels.fetch(channelId).catch(() => null)); if (!channel?.messages?.fetch) return fallback; return (await channel.messages.fetch(messageId).catch(() => null)) || fallback; } catch (err) { global.logger?.warn?.("[prefixDispatcher] resolveQueuedMessage:", err?.message || err); return fallback; } }; const removeLoadingReaction = async (msg?) => { try { const loadingId = IDs.emojis?.loadingAnimatedId; const fallbackId = IDs.emojis?.loadingFallbackId; const emoji = loadingId ? msg.client?.emojis?.cache?.get(loadingId) : null; if (emoji) { const react = msg.reactions.resolve(emoji.id); if (react) await react.users.remove(resolvedClient.user.id); } const fallback = msg.reactions.resolve("VC_Loading") || (fallbackId ? msg.reactions.resolve(fallbackId) : null); if (fallback) await fallback.users.remove(resolvedClient.user.id); } catch (err) { global.logger?.warn?.("[prefixDispatcher] removeLoadingReaction:", err?.message || err); } }; let queue = resolvedClient.prefixCommandQueue.get(lockId);
  while (queue && queue.length > 0) {
    const next = queue.shift();
    persistPrefixQueueSnapshotNow(resolvedClient);
    if (!next?.command && next?.commandName) {
      next.command = resolvePrefixCommandByName(resolvedClient, next.commandName);
    }
    if (!next?.command?.execute) {
      global.logger?.warn?.(
        "[PREFIX] drainPrefixQueue skip: comando non trovato",
        String(next?.commandName || ""),
      );
      continue;
    }
    const hydratedMessage = await resolveQueuedMessage(next);
    if (!hydratedMessage?.channel) continue;
    next.message = hydratedMessage;
    await removeLoadingReaction(next.message);
    resolvedClient.prefixCommandLocks.add(lockId);
    if (!resolvedClient.prefixCommandInFlight) resolvedClient.prefixCommandInFlight = new Map();
    resolvedClient.prefixCommandInFlight.set(lockId, next);
    try {
      await Promise.race([
        executePrefixCommandRuntime({ payload: next, resolvedClient }),
        new Promise((_?, reject?) => {
          const t = setTimeout(() => reject(new Error("Queue item execution timeout")), PREFIX_EXECUTION_TIMEOUT_MS + 5000);
          t.unref?.();
        }),
      ]);
    } catch (err) {
      global.logger?.warn?.("[PREFIX] drainPrefixQueue item timeout or error", err?.message || err);
    } finally {
      resolvedClient.prefixCommandLocks.delete(lockId);
      resolvedClient.prefixCommandInFlight?.delete(lockId);
    }
    queue = resolvedClient.prefixCommandQueue.get(lockId);
  }

  if (queue && queue.length === 0) {
    resolvedClient.prefixCommandQueue.delete(lockId);
    persistPrefixQueueSnapshotNow(resolvedClient);
  }
}

function normalizePrefixCommandToken(raw?) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase();
}

function rewriteCustomPrefixAliases(message?, resolvedClient?, defaultPrefix?) {
  const text = String(message?.content || "");
  const lower = text.toLowerCase();
  const base = String(defaultPrefix || "+");

  const explicit = [
    { from: "?afk", to: `${base}afk` },
    { from: "?av", to: `${base}av` },
    { from: "?bn", to: `${base}bn` },
    { from: "?membercount", to: `${base}membercount` },
    { from: "s?channel", to: `${base}channel` },
    { from: "s?server", to: `${base}server` },
    { from: "s?me", to: `${base}me` },
    { from: "s?top", to: `${base}top` },
    { from: "s?user", to: `${base}user` },
  ];

  for (const row of explicit) {
    if (lower.startsWith(row.from)) {
      message.content = row.to + text.slice(row.from.length);
      return true;
    }
  }

  const direct = lower.match(/^\?([a-z0-9][\w-]*)/i);
  if (direct && resolvedClient?.pcommands) {
    const token = String(direct[1] || "").toLowerCase();
    const baseName =
      resolvedClient.aliases?.get?.(token) || token;
    const cmd = resolvedClient.pcommands.get(baseName);
    const folder = String(cmd?.folder || "").toLowerCase();
    if (
      cmd &&
      (folder === "moderation" || folder === "minigames")
    ) {
      message.content =
        base + token + text.slice(direct[0].length);
      return true;
    }
  }

  return false;
}

async function handleOfficialPrefixMessage({ message, resolvedClient, defaultPrefix, overrideCommand = null, maybeSendWrongPrefixHint, getCachedOrFetchMember, hasAnyStaffBypassPermission }) {
  rewriteCustomPrefixAliases(message, resolvedClient, defaultPrefix);
  const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
  const startsWithDefault = message.content.startsWith(defaultPrefix);
  let resolvedCommandRef = overrideCommand || null;
  const deleteCommandMessage = async () => {
    if (resolvedCommandRef?.keepCommandMessage) return;
    await message.delete().catch(() => {});
  };

  if (!startsWithDefault) {
    if (typeof maybeSendWrongPrefixHint === "function") {
      await maybeSendWrongPrefixHint(message, resolvedClient, defaultPrefix);
    }
    return;
  }

  const usedPrefix = defaultPrefix;
  const args = message.content.slice(usedPrefix.length).trim().split(/\s+/).filter(Boolean);
  const rawCmd = overrideCommand ? overrideCommand.name : args.shift();
  const cmd = normalizePrefixCommandToken(rawCmd);
  if (!cmd) return;
  if (REMOVED_PREFIX_COMMANDS.has(cmd)) {
    await deleteCommandMessage();
    const removedMessage =
      cmd === "colors"
        ? "<:vegax:1443934876440068179> Il comando `+colors` non esiste più. https://www.viniliecaffe.it/personalizza"
        : cmd === "ticket"
          ? "<:vegax:1443934876440068179> Il comando `+ticket` non esiste più. Apri ticket su https://www.viniliecaffe.it/tickets/"
          : `<:vegax:1443934876440068179> Il comando \`+${cmd}\` non esiste più.`;
    await sendTemporaryMessage(
      message.channel,
      {
        content: removedMessage,
      },
      EPHEMERAL_TTL_SHORT_MS,
    );
    return;
  }

  const command =
    overrideCommand ||
    resolvedClient?.pcommands?.get?.(cmd) ||
    resolvedClient?.pcommands?.get?.(resolvedClient?.aliases?.get?.(cmd));
  resolvedCommandRef = command;
  if (!command) {
    if (resolvedClient.__prefixCommandsReady === false) {
      await sendTemporaryMessage(
        message.channel,
        {
          content:
            "<:VC_Attention:1482534443632558151> Bot ancora in avvio dopo il riavvio: riprova tra qualche secondo.",
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
    }
    return;
  }

  {
    const {
      partnershipPublishChannelCommandsDeniedReplyContent,
      sendPartnersChatDeniedPrefixCleanup,
    } = require("../Partner/partnersChatChannelUtils") as typeof import("../Partner/partnersChatChannelUtils");
    const deniedPublishChannel = partnershipPublishChannelCommandsDeniedReplyContent(message.channel, {
      commandName: command?.name,
    });
    if (deniedPublishChannel) {
      await deleteCommandMessage();
      await sendPartnersChatDeniedPrefixCleanup(message, deniedPublishChannel);
      return;
    }
  }

  const isAntiNukeRecoveryCommand = ["antinuke", "security"].includes(String(command?.name || "").toLowerCase(),);
  const securityLockState = await resolveWithTimeout(
    () => getSecurityLockState(message.guild),
    {
      active: false,
      joinLockActive: false,
      commandLockActive: false,
      sources: ["Precheck timeout"],
      commandSources: ["Precheck timeout"],
    },
    "security lock precheck",
  );
  if (!isAntiNukeRecoveryCommand && securityLockState.commandLockActive) {
    const lockSources = Array.isArray(securityLockState.commandSources) ? securityLockState.commandSources : securityLockState.sources;
    await deleteCommandMessage();
    await sendTemporaryMessage(
      message.channel,
      {
        content:
          `<:VC_Lock:1482526739044368476> Server in lockdown di sicurezza: comandi temporaneamente bloccati. ${lockSources?.length ? ` (${lockSources.join(", ")})` : ""}`,
      },
      EPHEMERAL_TTL_SHORT_MS,
    );
    return;
  }

  if (
    !isAntiNukeRecoveryCommand &&
    ["staff", "admin"].includes(String(command.folder || "").toLowerCase()) &&
    (await shouldBlockModerationCommands(
      message.guild,
      String(message.author?.id || ""),
    ))
  ) {
    await deleteCommandMessage();
    await sendTemporaryMessage(
      message.channel,
      {
        content:
          "<:VC_Lock:1482526739044368476> Comandi di moderazione temporaneamente bloccati.",
      },
      EPHEMERAL_TTL_SHORT_MS,
    );
    return;
  }

  const commandFolder = String(command.folder || "").toLowerCase();
  if (["staff", "admin"].includes(commandFolder)) {
    const { staffChatCommandsDeniedReplyContent } = require("../Staff/staffChatChannelUtils") as typeof import("../Staff/staffChatChannelUtils");
    const { sendPartnersChatDeniedPrefixCleanup, partnersChatPartnerCommandDeniedReplyContent } = require("../Partner/partnersChatChannelUtils") as typeof import("../Partner/partnersChatChannelUtils");
    const deniedStaffChat = await staffChatCommandsDeniedReplyContent(message.channel).catch(() => null);
    if (deniedStaffChat) {
      await deleteCommandMessage();
      await sendPartnersChatDeniedPrefixCleanup(message, deniedStaffChat);
      return;
    }

    const cmdName = String(command.name || cmd || "").toLowerCase();
    if (cmdName !== "setup") {
      const { resolveTenantPrefixFeatureCategory } = require("../../MultiGuild/core/openMediaCommands") as typeof import("../../MultiGuild/core/openMediaCommands");
      if (resolveTenantPrefixFeatureCategory(cmdName) === "partnership") {
        const deniedPartnerZone = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
        if (deniedPartnerZone) {
          await deleteCommandMessage();
          await sendPartnersChatDeniedPrefixCleanup(message, deniedPartnerZone);
          return;
        }
      }
    }
  }

  const rawPrefixSubcommandArg = args[0] ? String(args[0]).toLowerCase() : null;
  const prefixSubcommand = resolveSubcommandState(command, cmd, args);
  const aliasInvokesSubcommand = Boolean(
    command?.subcommandAliases &&
      typeof command.subcommandAliases === "object" &&
      command.subcommandAliases[cmd] &&
      String(command.subcommandAliases[cmd]).toLowerCase() !== String(cmd).toLowerCase(),
  );
  const hasExplicitSubcommandMetadata = Boolean(
    Array.isArray(command?.canonicalSubcommands) &&
      command.canonicalSubcommands.length > 0,
  );
  const firstTokenLooksLikeSubcommand = Boolean(
    rawPrefixSubcommandArg && tokenIsKnownSubcommand(command, rawPrefixSubcommandArg),
  );
  if (
    hasExplicitSubcommandMetadata &&
    rawPrefixSubcommandArg &&
    !aliasInvokesSubcommand &&
    firstTokenLooksLikeSubcommand &&
    !hasKnownSubcommand(command, rawPrefixSubcommandArg, prefixSubcommand)
  ) {
    const shown = await showPrefixUsageGuide({
      message,
      command,
      prefix: usedPrefix || "+",
      deleteCommandMessage: null,
      requestedSubcommand: rawPrefixSubcommandArg,
    });
    if (!shown) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    }
    return;
  }
  const permissionResult = await resolveWithTimeout(
    () => checkPrefixPermission(message, command.name, prefixSubcommand, { returnDetails: true, }),
    {
      allowed: false,
      reason: "permission_precheck_timeout",
      requiredRoles: null,
      channels: null,
    },
    `permission precheck for ${command.name}`,
  );
  if (!permissionResult?.allowed) {
    if (permissionResult?.reason === "multi_guild_tenant_only_media") {
      return;
    }
    if (
      permissionResult?.silent === true ||
      permissionResult?.reason === "bot_usage_blacklisted_user" ||
      permissionResult?.reason === "bot_usage_blacklisted_guild"
    ) {
      return;
    }
    if (permissionResult?.reason === "permission_precheck_timeout") {
      await deleteCommandMessage();
      await sendTemporaryMessage(
        message.channel,
        {
          content:
            "<:VC_Attention:1482534443632558151> Verifica permessi in ritardo. Riprova tra un attimo.",
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
      return;
    }
    if (permissionResult?.reason === "multi_guild_tenant_mod_permission") {
      await deleteCommandMessage();
      const { buildSimpleNoticePayload } = require("../Embeds/simpleNoticeEmbed") as typeof import("../Embeds/simpleNoticeEmbed");
      await sendTemporaryMessage(
        message.channel,
        buildSimpleNoticePayload(
          "<:VC_Lock:1482526739044368476> Ti servono i permessi Discord adatti (es. **Banna membri**, **Espelli**, **Modera membri**, **Gestisci messaggi** o **Amministratore**).",
          message.guild,
          { title: "<:VC_Lock:1482526739044368476> **Non hai i permessi**" },
        ),
        EPHEMERAL_TTL_SHORT_MS,
      );
      return;
    }
    if (String(permissionResult?.reason || "").startsWith("feature_disabled:")) {
      return;
    }
    if (
      permissionResult?.reason === "channel" &&
      Array.isArray(permissionResult.channels)
    ) {
      await deleteCommandMessage();
      const embed = buildGlobalChannelDeniedEmbed(permissionResult.channels, "comando", message.member);
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
      return;
    }
    if (
      permissionResult?.reason === "tenant_command_channel" &&
      Array.isArray(permissionResult.channels)
    ) {
      await deleteCommandMessage();
      const embed = buildGlobalChannelDeniedEmbed(permissionResult.channels, "comando", message.member);
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
      return;
    }
    const roleDenyReasons = new Set(["missing_role", "tenant_command_role"]);
    const isRoleDeny = roleDenyReasons.has(String(permissionResult?.reason || ""));
    const requiredRoles = isRoleDeny
      ? Array.isArray(permissionResult?.requiredRoles)
        ? permissionResult.requiredRoles
        : getPrefixRequiredRoles(command.name, prefixSubcommand)
      : null;
    const embed = buildGlobalPermissionDeniedEmbed(
      requiredRoles,
      "comando",
      isRoleDeny
        ? null
        : "<:VC_Lock:1482526739044368476> Non hai i permessi per usare questo comando.",
      message.guild,
    );
    await deleteCommandMessage();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    return;
  }

  const hasSubcommands = Boolean((Array.isArray(command?.subcommands) && command.subcommands.length > 0) || (command?.subcommandAliases && typeof command.subcommandAliases === "object" && Object.keys(command.subcommandAliases).length > 0),);
  const requireArgsForSubcommands = hasSubcommands && !Boolean(command?.allowEmptyArgs);
  if (!args.length && (Boolean(command?.args) || requireArgsForSubcommands)) {
    const shown = await showPrefixUsageGuide({ message, command, prefix: usedPrefix || "+", deleteCommandMessage: null, });
    if (!shown) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    }
    return;
  }

  let hasPrefixCooldownBypass = Boolean(
    message.member?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
    (typeof hasAnyStaffBypassPermission === "function" && hasAnyStaffBypassPermission(message.member?.permissions)) ||
    String(message.guild?.ownerId || "") === String(message.author?.id || ""),
  );
  let cooldownMember = message.member || null;
  if (message.guild && !hasPrefixCooldownBypass && typeof getCachedOrFetchMember === "function") {
    const fetchedMember = await getCachedOrFetchMember(message.guild, message.author.id);
    if (fetchedMember) cooldownMember = fetchedMember;
    hasPrefixCooldownBypass = Boolean(
      fetchedMember?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
      (typeof hasAnyStaffBypassPermission === "function" && hasAnyStaffBypassPermission(fetchedMember?.permissions)) ||
      String(message.guild?.ownerId || "") === String(message.author?.id || ""),
    );
  }

  if (
    message.guild &&
    !hasPrefixCooldownBypass &&
    !isEditedPrefixExecution &&
    !command.skipCommandCooldown
  ) {
    const cooldownSeconds = await resolveWithTimeout(() => getUserCommandCooldownSeconds({ guildId: message.guild.id, userId: message.author.id, member: cooldownMember, }), 30, `cooldown lookup for ${command.name}`,
    );
    const cooldownResult = consumeUserCooldown({ client: resolvedClient, guildId: message.guild.id, userId: message.author.id, cooldownSeconds, });
    if (!cooldownResult.ok) {
      const remaining = Math.max(1, Math.ceil(cooldownResult.remainingMs / 1000));
      const embed = buildCooldownErrorEmbed(remaining);
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
      return;
    }
  }

  if (!resolvedClient.prefixCommandLocks) resolvedClient.prefixCommandLocks = new Set();
  if (!resolvedClient.prefixCommandQueue) resolvedClient.prefixCommandQueue = new Map();
  ensurePrefixQueueLoaded(resolvedClient);
  if (!resolvedClient.prefixCommandBusyNoticeAt) {
    resolvedClient.prefixCommandBusyNoticeAt = new Map();
  }

  const userId = message.author.id;
  const queueLockId = message.guild ? `${message.guild.id}:${userId}` : `dm:${userId}`;
  const sendBusyQueueNotice = async () => { const now = Date.now(); const lastNoticeAt = resolvedClient.prefixCommandBusyNoticeAt.get(queueLockId) || 0; if (now - lastNoticeAt < EPHEMERAL_TTL_SHORT_MS) return; resolvedClient.prefixCommandBusyNoticeAt.set(queueLockId, now); const embed = buildBusyCommandErrorEmbed(); await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS); };
  const commandPayload = {
    message,
    args,
    command,
    commandName: String(command?.name || cmd || "").trim().toLowerCase(),
    channelId: message.channelId,
    messageId: message.id,
    enqueuedAt: Date.now(),
  };

  const enqueueCommand = async () => {
    const queue = resolvedClient.prefixCommandQueue.get(queueLockId) || [];
    if (isEditedPrefixExecution) {
      const idx = queue.findIndex(
        (item?) => String(item?.messageId || "") === String(message.id || ""),
      );
      if (idx >= 0) {
        queue[idx] = { ...queue[idx], ...commandPayload };
        resolvedClient.prefixCommandQueue.set(queueLockId, queue);
        persistPrefixQueueSnapshotNow(resolvedClient);
        return;
      }
    }
    const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
    const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
    const emoji = loadingEmojiId ? message.client?.emojis?.cache?.get(loadingEmojiId) : null;
    if (emoji) {
      await message.react(emoji).catch(() => { });
    } else if (fallbackEmojiId) {
      await message.react(fallbackEmojiId).catch(() => { });
    } else {
      await message.react("\u23F3").catch(() => { });
    }
    if (!resolvedClient.prefixCommandQueue.has(queueLockId)) {
      resolvedClient.prefixCommandQueue.set(queueLockId, []);
    }
    resolvedClient.prefixCommandQueue.get(queueLockId).push(commandPayload);
    persistPrefixQueueSnapshotNow(resolvedClient);
  };
  if (resolvedClient.prefixCommandLocks.has(queueLockId)) {
    await enqueueCommand();
    if (!isEditedPrefixExecution) {
      await sendBusyQueueNotice();
    }
    return;
  }

  resolvedClient.prefixCommandLocks.add(queueLockId);
  if (!resolvedClient.prefixCommandInFlight) resolvedClient.prefixCommandInFlight = new Map();
  resolvedClient.prefixCommandInFlight.set(queueLockId, commandPayload);
  try {
    await executePrefixCommandRuntime({
      payload: { message, args, command },
      resolvedClient,
    });
  } finally {
    resolvedClient.prefixCommandLocks.delete(queueLockId);
    resolvedClient.prefixCommandInFlight?.delete(queueLockId);
    persistPrefixQueueSnapshotNow(resolvedClient);
    await drainPrefixQueue(queueLockId, resolvedClient);
  }
}

export = { handleOfficialPrefixMessage, ensurePrefixQueueLoaded };