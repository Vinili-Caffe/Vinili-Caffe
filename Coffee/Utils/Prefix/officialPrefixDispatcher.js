const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter");
const { checkPrefixPermission, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed } = require("../Moderation/commandPermissions");
const { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildMissingArgumentsErrorEmbed, buildInternalCommandErrorEmbed } = require("../Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../../../shared/discord/errorLogEmbed");
const { showPrefixUsageGuide } = require("../Moderation/prefixUsageGuide");
const IDs = require("../Config/ids");
const { getCentralChannel } = require("../Logging/commandUsageLogger");
const { EPHEMERAL_TTL_SHORT_MS } = require("../Config/ephemeralMessageTtl");
const PREFIX_COOLDOWN_BYPASS_ROLE_ID = IDs.roles?.HighStaff || IDs.roles?.Founder || null;
const PREFIX_PRECHECK_TIMEOUT_MS = 4000;
const PREFIX_EXECUTION_TIMEOUT_MS = Math.max(15_000, Number(process.env.PREFIX_EXECUTION_TIMEOUT_MS || 120_000));
const COFFEE_PREFIX_COOLDOWN_MS = Math.max(0, Number(process.env.COFFEE_PREFIX_COOLDOWN_MS || 0));
const prefixCooldownHitAt = new Map();
const PREFIX_QUEUE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "prefixQueueSnapshot.json");
const PREFIX_QUEUE_MAX_ITEMS_PER_LOCK = 100;
const PREFIX_QUEUE_MAX_AGE_MS = 20 * 60 * 1000;

function readPrefixQueueSnapshotRaw() {
  const raw = readSnapshotWithMeta({ filePath: PREFIX_QUEUE_SNAPSHOT_PATH, walPath: `${PREFIX_QUEUE_SNAPSHOT_PATH}.wal`, key: "coffee_prefix_queue", version: 1, fallback: { queues: {} } });
  return raw?.queues && typeof raw.queues === "object" ? raw.queues : {};
}

function persistPrefixQueueSnapshotNow(client) {
  try {
    const queues = {};
    const source = client?.prefixCommandQueue;
    if (source instanceof Map) {
      for (const [lockId, rows] of source.entries()) {
        const key = String(lockId || "").trim();
        if (!key || !Array.isArray(rows) || rows.length === 0) continue;
        const serialized = rows
          .map((row) => ({
            channelId: String(row?.channelId || row?.message?.channelId || ""),
            messageId: String(row?.messageId || row?.message?.id || ""),
            args: Array.isArray(row?.args) ? row.args.map((a) => String(a || "")) : [],
            commandName: String(row?.commandName || row?.command?.name || "").trim().toLowerCase(),
            enqueuedAt: Number(row?.enqueuedAt || Date.now()),
          }))
          .filter((row) => row.channelId && row.messageId && row.commandName);
        if (serialized.length) queues[key] = serialized.slice(0, PREFIX_QUEUE_MAX_ITEMS_PER_LOCK);
      }
    }
    writeSnapshotWithMeta({
      filePath: PREFIX_QUEUE_SNAPSHOT_PATH,
      walPath: `${PREFIX_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "coffee_prefix_queue",
      version: 1,
      payload: { queues },
    });
  } catch { }
}

function ensurePrefixQueueLoaded(client) {
  if (!client || client._prefixQueueSnapshotLoaded) return;
  armShutdownCheckpoint();
  client._prefixQueueSnapshotLoaded = true;
  if (!client.prefixCommandQueue) client.prefixCommandQueue = new Map();
  const queues = readPrefixQueueSnapshotRaw();
  for (const [lockId, rows] of Object.entries(queues)) {
    if (!lockId || !Array.isArray(rows) || !rows.length) continue;
    const sanitized = rows
      .map((row) => ({
        channelId: String(row?.channelId || ""),
        messageId: String(row?.messageId || ""),
        args: Array.isArray(row?.args) ? row.args.map((a) => String(a || "")) : [],
        commandName: String(row?.commandName || "").trim().toLowerCase(),
        enqueuedAt: Number(row?.enqueuedAt || Date.now()),
      }))
      .filter((row) =>
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
    registerShutdownFlush("coffee_prefix_queue", () => persistPrefixQueueSnapshotNow(client));
  }
  for (const [lockId, rows] of client.prefixCommandQueue.entries()) {
    if (!rows?.length || client.prefixCommandLocks.has(lockId)) continue;
    setTimeout(() => {
      drainPrefixQueue(lockId, client).catch(() => null);
    }, 500).unref?.();
  }
}

function hasSendablePayload(data) {
  if (typeof data === "string") return data.trim().length > 0;
  if (!data || typeof data !== "object") return false;
  const hasContent =
    typeof data.content === "string" ? data.content.trim().length > 0 : data.content != null;
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

async function sendTemporaryMessage(channel, payload, ttlMs) {
  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => sent.delete().catch(() => {}), ttlMs);
    timer.unref?.();
  }
  return sent;
}

async function sendTemporaryReply(message, payload, ttlMs) {
  const sent = await message.reply(payload).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => sent.delete().catch(() => {}), ttlMs);
    timer.unref?.();
  }
  return sent;
}

async function addLoadingReaction(message) {
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

async function removeLoadingReaction(message, resolvedClient) {
  try {
    const loadingId = IDs.emojis?.loadingAnimatedId;
    const fallbackId = IDs.emojis?.loadingFallbackId;
    const emoji = loadingId ? message.client?.emojis?.cache?.get(loadingId) : null;
    if (emoji) {
      const react = message.reactions?.resolve?.(emoji.id);
      if (react) await react.users.remove(resolvedClient.user.id);
    }
    const fallback =
      message.reactions?.resolve?.("VC_Loading") ||
      (fallbackId ? message.reactions?.resolve?.(fallbackId) : null);
    if (fallback) await fallback.users.remove(resolvedClient.user.id);
  } catch (_) {}
}

async function resolveWithTimeout(task, fallbackValue, label, timeoutMs = PREFIX_PRECHECK_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch (error) {
    global.logger?.warn?.(`[PREFIX] ${label} failed:`, error);
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildSubcommandKeywordSet(command) {
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

function tokenIsKnownSubcommand(command, rawToken) {
  if (!rawToken) return false;
  const raw = String(rawToken).trim().toLowerCase();
  const known = buildSubcommandKeywordSet(command);
  if (!known.size) return false;
  return known.has(raw);
}

function hasKnownSubcommand(command, rawSubcommandArg, resolvedSubcommand) {
  const raw = String(rawSubcommandArg || "").trim().toLowerCase();
  const resolved = String(resolvedSubcommand || "").trim().toLowerCase();
  if (!raw && !resolved) return true;
  const known = buildSubcommandKeywordSet(command);
  if (!known.size) return true;
  return known.has(raw) || known.has(resolved);
}

function resolveSubcommandState(command, cmd, args) {
  const rawPrefixSubcommandArg = args[0] ? String(args[0]).toLowerCase() : null;
  const keywordSet = buildSubcommandKeywordSet(command);
  if (rawPrefixSubcommandArg && keywordSet.size > 0 && !keywordSet.has(rawPrefixSubcommandArg)) {
    return null;
  }
  const prefixSubcommandFromArgs =
    rawPrefixSubcommandArg && command?.subcommandAliases
      ? command.subcommandAliases[rawPrefixSubcommandArg] || rawPrefixSubcommandArg
      : rawPrefixSubcommandArg;
  const prefixSubcommandFromAlias = command?.subcommandAliases
    ? command.subcommandAliases[cmd] || null
    : null;
  const shouldPreferAliasSubcommand =
    Boolean(rawPrefixSubcommandArg) &&
    Boolean(prefixSubcommandFromAlias) &&
    !hasKnownSubcommand(command, rawPrefixSubcommandArg, rawPrefixSubcommandArg);
  const prefixSubcommand = shouldPreferAliasSubcommand
    ? prefixSubcommandFromAlias
    : prefixSubcommandFromArgs || prefixSubcommandFromAlias || null;

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

async function logPrefixErrorToChannel(message, client, commandName, error) {
  try {
    const channelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    if (!channelId) return;
    const errorChannel = await getCentralChannel(client, channelId);
    if (!errorChannel?.isTextBased?.()) return;
    const embed = buildErrorLogEmbed({
      contextLabel: "Comando",
      contextValue: String(commandName || "unknown"),
      userTag: message?.author?.tag || "unknown",
      error,
      serverName: message?.guild ? `${message.guild.name} [${message.guild.id}]` : null,
    });
    await errorChannel.send({ embeds: [embed] }).catch(() => null);
  } catch (nestedError) {
    global.logger?.error?.("[PREFIX] error log failed:", nestedError);
  }
}

async function executePrefixCommandRuntime({ payload, resolvedClient }) {
  const { message: execMessage, args: execArgs, command: execCommand } = payload;
  const originalReply = execMessage.reply.bind(execMessage);
  const commandMessage = Object.create(execMessage);
  commandMessage.reply = (replyPayload) => {
    const withFooter = applyDefaultFooterToEmbeds(replyPayload, execMessage.guild);
    if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
    return originalReply(withFooter).catch((err) => {
      throw err;
    });
  };

  const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
  const commandChannel = execMessage.channel ? Object.create(execMessage.channel) : execMessage.channel;
  if (originalChannelSend) {
    commandChannel.send = (sendPayload) => {
      const withFooter = applyDefaultFooterToEmbeds(sendPayload, execMessage.guild);
      if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
      if (typeof withFooter === "string") {
        return originalChannelSend(withFooter);
      }
      const normalized = {
        ...withFooter,
        reply: withFooter.reply || {
          messageReference: execMessage.id,
          failIfNotExists: false,
        },
        failIfNotExists: withFooter.failIfNotExists ?? false,
        allowedMentions: {
          ...(withFooter.allowedMentions || {}),
          repliedUser: withFooter.allowedMentions?.repliedUser ?? false,
        },
      };
      const fallback = { ...normalized };
      delete fallback.reply;
      delete fallback.messageReference;
      delete fallback.failIfNotExists;
      return originalChannelSend(normalized).catch((error) => {
        const hasUnknownRef =
          error?.code === 50035 && Boolean(error?.rawError?.errors?.message_reference);
        if (!hasUnknownRef) throw error;
        return originalChannelSend(fallback);
      });
    };
  }
  if (commandChannel) {
    commandMessage.channel = commandChannel;
  }

  try {
    await Promise.race([
      Promise.resolve(execCommand.execute(commandMessage, execArgs, resolvedClient)),
      new Promise((_, reject) => {
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
  } catch (error) {
    global.logger?.error?.(
      `[PREFIX COMMAND ERROR] command=${String(execCommand?.name || "unknown")} guild=${String(execMessage?.guild?.id || "dm")} user=${String(execMessage?.author?.id || "unknown")}`,
      error?.stack || error?.message || error,
    );
    await logPrefixErrorToChannel(execMessage, resolvedClient, execCommand?.name || "unknown", error);
    const feedback = buildInternalCommandErrorEmbed(error);
    await execMessage.delete().catch(() => null);
    await sendTemporaryMessage(execMessage.channel, { embeds: [feedback] }, EPHEMERAL_TTL_SHORT_MS);
  }
}

async function drainPrefixQueue(lockId, resolvedClient) {
  const resolveQueuedMessage = async (payload) => {
    const fallback = payload?.message || null;
    const channelId = String(payload?.channelId || fallback?.channelId || "");
    const messageId = String(payload?.messageId || fallback?.id || "");
    if (!channelId || !messageId) return fallback;
    try {
      const channel =
        resolvedClient.channels?.cache?.get(channelId) ||
        (await resolvedClient.channels.fetch(channelId).catch(() => null));
      if (!channel?.messages?.fetch) return fallback;
      return (await channel.messages.fetch(messageId).catch(() => null)) || fallback;
    } catch (err) {
      global.logger?.warn?.("[PREFIX] resolveQueuedMessage:", err?.message || err);
      return fallback;
    }
  };

  let queue = resolvedClient.prefixCommandQueue.get(lockId);
  while (queue && queue.length > 0) {
    const next = queue.shift();
    persistPrefixQueueSnapshotNow(resolvedClient);
    if (!next?.command && next?.commandName) {
      const cmdKey = String(next.commandName || "").toLowerCase();
      next.command =
        resolvedClient.commands?.get?.(cmdKey) ||
        [...(resolvedClient.commands?.values?.() || [])].find((c) => String(c?.name || "").toLowerCase() === cmdKey) ||
        null;
    }
    if (!next?.command?.execute) continue;
    const hydratedMessage = await resolveQueuedMessage(next);
    if (!hydratedMessage?.channel) continue;
    next.message = hydratedMessage;
    await removeLoadingReaction(next.message, resolvedClient);
    resolvedClient.prefixCommandLocks.add(lockId);
    try {
      await Promise.race([
        executePrefixCommandRuntime({ payload: next, resolvedClient }),
        new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("Queue item execution timeout")),
            PREFIX_EXECUTION_TIMEOUT_MS + 5000,
          );
          t.unref?.();
        }),
      ]);
    } catch (err) {
      global.logger?.warn?.("[PREFIX] drainPrefixQueue:", err?.message || err);
    } finally {
      resolvedClient.prefixCommandLocks.delete(lockId);
    }
    queue = resolvedClient.prefixCommandQueue.get(lockId);
  }
  if (queue && queue.length === 0) {
    resolvedClient.prefixCommandQueue.delete(lockId);
    persistPrefixQueueSnapshotNow(resolvedClient);
  }
}

function normalizePrefixCommandToken(raw) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase();
}

function consumeCoffeePrefixCooldown(guildId, userId) {
  if (!COFFEE_PREFIX_COOLDOWN_MS) return { ok: true, remainingMs: 0 };
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const last = Number(prefixCooldownHitAt.get(key) || 0);
  const elapsed = now - last;
  if (elapsed < COFFEE_PREFIX_COOLDOWN_MS) {
    return { ok: false, remainingMs: COFFEE_PREFIX_COOLDOWN_MS - elapsed };
  }
  prefixCooldownHitAt.set(key, now);
  return { ok: true, remainingMs: 0 };
}

async function handleOfficialPrefixMessage({ message, resolvedClient, defaultPrefix, overrideCommand = null, maybeSendWrongPrefixHint, getCachedOrFetchMember, hasAnyStaffBypassPermission }) {
  const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
  const startsWithDefault = String(message.content || "").startsWith(defaultPrefix);
  const deleteCommandMessage = async () => {
    await message.delete().catch(() => {});
  };

  if (!startsWithDefault) {
    await maybeSendWrongPrefixHint(message, resolvedClient, defaultPrefix);
    return;
  }

  const usedPrefix = defaultPrefix;
  const args = message.content.slice(usedPrefix.length).trim().split(/\s+/).filter(Boolean);
  const rawCmd = overrideCommand ? overrideCommand.name : args.shift();
  const cmd = normalizePrefixCommandToken(rawCmd);
  if (!cmd) return;

  const command = overrideCommand || resolvedClient.pcommands.get(cmd) || resolvedClient.pcommands.get(resolvedClient.aliases.get(cmd)) || null;
  if (!command) {
    const channelId = String(message?.channelId || "");
    const hintChannels = new Set([IDs.channels?.commands, IDs.channels?.staffCmds].filter(Boolean).map(String));
    if (hintChannels.size && !hintChannels.has(channelId)) {
      return;
    }
    if (/^-?\d+$/.test(cmd) || (args[0] != null && /^-\d+$/.test(String(args[0]).trim()))) {
      return;
    }

    await sendTemporaryReply(message, { content: "<a:VC_Attention:1482534443632558151> Comando non trovato." }, EPHEMERAL_TTL_SHORT_MS);
    return;
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
    Array.isArray(command?.canonicalSubcommands) && command.canonicalSubcommands.length > 0,
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
      prefix: usedPrefix || defaultPrefix,
      deleteCommandMessage: null,
    });
    if (!shown) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    }
    return;
  }

  const permissionResult = await resolveWithTimeout(
    () =>
      checkPrefixPermission(message, command.name, prefixSubcommand, { returnDetails: true }),
    { allowed: false, reason: "missing_permission", requiredRoles: null, channels: null },
    `permission precheck for ${command.name}`,
  );
  if (!permissionResult?.allowed) {
    if (permissionResult?.reason === "channel" && Array.isArray(permissionResult.channels)) {
      await deleteCommandMessage();
      const embed = buildGlobalChannelDeniedEmbed(permissionResult.channels, "comando");
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
      return;
    }
    const requiredRoles = getPrefixRequiredRoles(command.name, prefixSubcommand);
    const embed = buildGlobalPermissionDeniedEmbed(requiredRoles);
    await deleteCommandMessage();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    return;
  }

  const hasSubcommands = Boolean(
    (Array.isArray(command?.subcommands) && command.subcommands.length > 0) ||
      (command?.subcommandAliases &&
        typeof command.subcommandAliases === "object" &&
        Object.keys(command.subcommandAliases).length > 0),
  );
  const requireArgsForSubcommands = hasSubcommands && !Boolean(command?.allowEmptyArgs);
  if (!args.length && (Boolean(command?.args) || requireArgsForSubcommands)) {
    const shown = await showPrefixUsageGuide({
      message,
      command,
      prefix: usedPrefix || defaultPrefix,
      deleteCommandMessage: null,
    });
    if (!shown) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    }
    return;
  }

  let hasPrefixCooldownBypass = Boolean(
    (PREFIX_COOLDOWN_BYPASS_ROLE_ID &&
      message.member?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID)) ||
      hasAnyStaffBypassPermission(message.member?.permissions) ||
      String(message.guild?.ownerId || "") === String(message.author?.id || ""),
  );
  const needsFreshMemberForCooldownBypass =
    !hasPrefixCooldownBypass && (!message.member?.permissions || !message.member?.roles?.cache);
  if (needsFreshMemberForCooldownBypass && getCachedOrFetchMember) {
    const fetchedMember = await getCachedOrFetchMember(message.guild, message.author.id).catch(
      () => null,
    );
    hasPrefixCooldownBypass = Boolean(
      (PREFIX_COOLDOWN_BYPASS_ROLE_ID &&
        fetchedMember?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID)) ||
        hasAnyStaffBypassPermission(fetchedMember?.permissions) ||
        String(message.guild?.ownerId || "") === String(message.author?.id || ""),
    );
  }

  if (!hasPrefixCooldownBypass && !isEditedPrefixExecution && COFFEE_PREFIX_COOLDOWN_MS > 0) {
    const cooldownResult = consumeCoffeePrefixCooldown(message.guild.id, message.author.id);
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
  const queueLockId = `${message.guild.id}:${userId}`;
  const sendBusyQueueNotice = async () => {
    const now = Date.now();
    const lastNoticeAt = resolvedClient.prefixCommandBusyNoticeAt.get(queueLockId) || 0;
    if (now - lastNoticeAt < EPHEMERAL_TTL_SHORT_MS) return;
    resolvedClient.prefixCommandBusyNoticeAt.set(queueLockId, now);
    const embed = buildBusyCommandErrorEmbed();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
  };
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
      const idx = queue.findIndex((item) => String(item?.messageId || "") === String(message.id || ""));
      if (idx >= 0) {
        queue[idx] = { ...queue[idx], ...commandPayload };
        resolvedClient.prefixCommandQueue.set(queueLockId, queue);
        persistPrefixQueueSnapshotNow(resolvedClient);
        return;
      }
    }
    await addLoadingReaction(message);
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
  try {
    await executePrefixCommandRuntime({
      payload: { message, args, command },
      resolvedClient,
    });
  } finally {
    resolvedClient.prefixCommandLocks.delete(queueLockId);
    await drainPrefixQueue(queueLockId, resolvedClient);
  }
}

module.exports = { handleOfficialPrefixMessage };