const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../recovery/snapshotStore") as typeof import("../recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../recovery/shutdownCheckpoint") as typeof import("../recovery/shutdownCheckpoint");
const { applyDefaultFooterToEmbeds } = require("../embeds/defaultFooter") as typeof import("../embeds/defaultFooter");
const { showPrefixUsageGuide } = require("./prefixUsageGuide") as typeof import("./prefixUsageGuide");
const { buildErrorLogEmbed } = require("../discord/errorLogEmbed") as typeof import("../discord/errorLogEmbed");
const { EPHEMERAL_TTL_SHORT_MS } = require("../utils/ephemeralMessageTtl") as typeof import("../utils/ephemeralMessageTtl");

/**
 * Shared official prefix engine (queue + permission precheck + execute).
 * Bot-specific gates via optional hooks (Vinili MultiGuild/Security/Partner).
 * @param {object} options
 */
function createOfficialPrefixDispatcher(options: Record<string, any> = {}) {
  const IDs = options.ids || {};
  const checkPrefixPermission = options.checkPrefixPermission;
  const getPrefixRequiredRoles = options.getPrefixRequiredRoles;
  const buildGlobalPermissionDeniedEmbed = options.buildGlobalPermissionDeniedEmbed;
  const buildGlobalChannelDeniedEmbed = options.buildGlobalChannelDeniedEmbed;
  const buildCooldownErrorEmbed = options.buildCooldownErrorEmbed;
  const buildBusyCommandErrorEmbed = options.buildBusyCommandErrorEmbed;
  const buildMissingArgumentsErrorEmbed = options.buildMissingArgumentsErrorEmbed;
  const buildInternalCommandErrorEmbed = options.buildInternalCommandErrorEmbed;
  const getCentralChannel = options.getCentralChannel;
  const finalizeOutgoingPayload =
    typeof options.finalizeOutgoingPayload === "function"
      ? options.finalizeOutgoingPayload
      : (payload?, guild?) => applyDefaultFooterToEmbeds(payload, guild);
  const transformTemporaryPayload =
    typeof options.transformTemporaryPayload === "function" ? options.transformTemporaryPayload : null;
  const rewriteMessageAliases =
    typeof options.rewriteMessageAliases === "function" ? options.rewriteMessageAliases : null;
  const afterCommandResolved =
    typeof options.afterCommandResolved === "function" ? options.afterCommandResolved : null;
  const onCommandNotFound =
    typeof options.onCommandNotFound === "function" ? options.onCommandNotFound : null;
  const handlePermissionDenied =
    typeof options.handlePermissionDenied === "function" ? options.handlePermissionDenied : null;
  const checkUserCooldown =
    typeof options.checkUserCooldown === "function" ? options.checkUserCooldown : null;
  const afterSuccessfulExecute =
    typeof options.afterSuccessfulExecute === "function" ? options.afterSuccessfulExecute : null;
  const logCommandError =
    typeof options.logCommandError === "function" ? options.logCommandError : null;
  const shouldDeleteCommandMessage =
    typeof options.shouldDeleteCommandMessage === "function"
      ? options.shouldDeleteCommandMessage
      : (command?) => !command?.keepCommandMessage;
  const isFireAndForget =
    typeof options.isFireAndForget === "function"
      ? options.isFireAndForget
      : (command?) => {
          const name = String(command?.name || "").toLowerCase();
          return Boolean(command?.fireAndForget) || fireAndForgetCommands.has(name);
        };
  const removedCommands = new Set(
    Array.isArray(options.removedCommands)
      ? options.removedCommands.map((n?) => String(n).toLowerCase())
      : options.removedCommands instanceof Set
        ? [...options.removedCommands].map((n?) => String(n).toLowerCase())
        : [],
  );
  const fireAndForgetCommands = new Set(
    Array.isArray(options.fireAndForgetCommands)
      ? options.fireAndForgetCommands.map((n?) => String(n).toLowerCase())
      : options.fireAndForgetCommands instanceof Set
        ? [...options.fireAndForgetCommands].map((n?) => String(n).toLowerCase())
        : [],
  );
  const trackInFlight = Boolean(options.trackInFlight);
  const enableTypingPulse = Boolean(options.enableTypingPulse);
  const warnOnPrecheckTimeout = Boolean(options.warnOnPrecheckTimeout);
  const allowDmQueueLock = Boolean(options.allowDmQueueLock);
  const PREFIX_COOLDOWN_BYPASS_ROLE_ID = options.cooldownBypassRoleId || null;
  const PREFIX_PRECHECK_TIMEOUT_MS = Math.max(1000, Number(options.precheckTimeoutMs || 4000));
  const PREFIX_EXECUTION_TIMEOUT_MS = Math.max(
    15_000,
    Number(options.executionTimeoutMs || process.env.PREFIX_EXECUTION_TIMEOUT_MS || 120_000),
  );
  const mapCooldownMs = Math.max(0, Number(options.mapCooldownMs || 0));
  const prefixCooldownHitAt = new Map();
  const snapshotKey = String(options.snapshotKey || "prefix_queue");
  const PREFIX_QUEUE_SNAPSHOT_PATH =
    options.snapshotPath ||
    path.join(String(options.botDataDir || process.cwd()), "prefixQueueSnapshot.json");
  const PREFIX_QUEUE_MAX_ITEMS_PER_LOCK = 100;
  const PREFIX_QUEUE_MAX_AGE_MS = 20 * 60 * 1000;

  function serializePrefixQueuePayload(row?) {
    return {
      channelId: String(row?.channelId || row?.message?.channelId || ""),
      messageId: String(row?.messageId || row?.message?.id || ""),
      args: Array.isArray(row?.args) ? row.args.map((a?) => String(a || "")) : [],
      commandName: String(row?.commandName || row?.command?.name || "").trim().toLowerCase(),
      enqueuedAt: Number(row?.enqueuedAt || Date.now()),
    };
  }

  function readPrefixQueueSnapshotRaw() {
    const raw = readSnapshotWithMeta({
      filePath: PREFIX_QUEUE_SNAPSHOT_PATH,
      walPath: `${PREFIX_QUEUE_SNAPSHOT_PATH}.wal`,
      key: snapshotKey,
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
      if (trackInFlight && client?.prefixCommandInFlight instanceof Map) {
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
        key: snapshotKey,
        version: 1,
        payload: { queues },
      });
    } catch {}
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
    if (trackInFlight && !client.prefixCommandInFlight) client.prefixCommandInFlight = new Map();
    const queues = readPrefixQueueSnapshotRaw();
    for (const [lockId, rows] of Object.entries(queues)) {
      if (!lockId || !Array.isArray(rows) || !rows.length) continue;
      const sanitized = rows
        .map((row?) => ({
          channelId: String(row?.channelId || ""),
          messageId: String(row?.messageId || ""),
          args: Array.isArray(row?.args) ? row.args.map((a?) => String(a || "")) : [],
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
      registerShutdownFlush(snapshotKey, () => persistPrefixQueueSnapshotNow(client));
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

  async function sendTemporaryMessage(channel?, payload?, ttlMs?) {
    let out = payload;
    if (transformTemporaryPayload) {
      out = transformTemporaryPayload(payload, channel?.guild) || payload;
    }
    const sent = await channel.send(out).catch(() => null);
    if (sent) {
      const timer = setTimeout(() => sent.delete().catch(() => {}), ttlMs);
      timer.unref?.();
    }
    return sent;
  }

  async function sendTemporaryReply(message?, payload?, ttlMs?) {
    let out = payload;
    if (transformTemporaryPayload) {
      out = transformTemporaryPayload(payload, message?.guild) || payload;
    }
    const sent = await message.reply(out).catch(() => null);
    if (sent) {
      const timer = setTimeout(() => sent.delete().catch(() => {}), ttlMs);
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
      const fallback =
        message.reactions?.resolve?.("VC_Loading") ||
        (fallbackId ? message.reactions?.resolve?.(fallbackId) : null);
      if (fallback) await fallback.users.remove(resolvedClient.user.id);
    } catch (_) {}
  }

  async function resolveWithTimeout(task?, fallbackValue?, label?, timeoutMs = PREFIX_PRECHECK_TIMEOUT_MS) {
    let timer = null;
    try {
      if (!warnOnPrecheckTimeout) {
        return await Promise.race([
          Promise.resolve().then(task),
          new Promise((resolve?) => {
            timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
            timer.unref?.();
          }),
        ]);
      }
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

  function hasKnownSubcommand(command?, rawSubcommandArg?, resolvedSubcommand?) {
    const raw = String(rawSubcommandArg || "").trim().toLowerCase();
    const resolved = String(resolvedSubcommand || "").trim().toLowerCase();
    if (!raw && !resolved) return true;
    const known = buildSubcommandKeywordSet(command);
    if (!known.size) return true;
    return known.has(raw) || known.has(resolved);
  }

  function resolveSubcommandState(command?, cmd?, args?) {
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

  async function logPrefixErrorToChannel(message?, client?, commandName?, error?) {
    if (logCommandError) {
      await logCommandError({ message, resolvedClient: client, commandName, error });
      return;
    }
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

    commandMessage.reply = (replyPayload?) => {
      const withFooter = finalizeOutgoingPayload(replyPayload, execMessage.guild);
      if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
      return originalReply(withFooter)
        .then((result?) => {
          if (enableTypingPulse) stopTyping();
          return result;
        })
        .catch((err?) => {
          if (enableTypingPulse) stopTyping();
          throw err;
        });
    };

    const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
    const commandChannel = execMessage.channel ? Object.create(execMessage.channel) : execMessage.channel;
    if (originalChannelSend) {
      commandChannel.send = (sendPayload?) => {
        const withFooter = finalizeOutgoingPayload(sendPayload, execMessage.guild);
        if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
        const sendWithReferenceFallback = async (primaryPayload?, fallbackPayload?) => {
          try {
            return await originalChannelSend(primaryPayload);
          } catch (error) {
            const hasUnknownRef =
              error?.code === 50035 && Boolean(error?.rawError?.errors?.message_reference);
            if (!hasUnknownRef) throw error;
            return originalChannelSend(fallbackPayload);
          }
        };
        const afterSend = (p?) =>
          p
            .then((result?) => {
              if (enableTypingPulse) stopTyping();
              return result;
            })
            .catch((err?) => {
              if (enableTypingPulse) stopTyping();
              throw err;
            });

        if (typeof withFooter === "string") {
          if (!enableTypingPulse) return originalChannelSend(withFooter);
          return afterSend(
            sendWithReferenceFallback(
              {
                content: withFooter,
                reply: { messageReference: execMessage.id, failIfNotExists: false },
                allowedMentions: { repliedUser: false },
                failIfNotExists: false,
              },
              { content: withFooter, allowedMentions: { repliedUser: false } },
            ),
          );
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
        if (!enableTypingPulse) {
          return originalChannelSend(normalized).catch((error?) => {
            const hasUnknownRef =
              error?.code === 50035 && Boolean(error?.rawError?.errors?.message_reference);
            if (!hasUnknownRef) throw error;
            return originalChannelSend(fallback);
          });
        }
        return afterSend(sendWithReferenceFallback(normalized, fallback));
      };
    }

    if (enableTypingPulse) {
      const originalSendTyping = execMessage.channel?.sendTyping?.bind(execMessage.channel);
      if (originalSendTyping) {
        const sendTypingSafe = async () => {
          if (commandFinished) return;
          try {
            await originalSendTyping();
          } catch (err) {
            global.logger?.warn?.("[prefixDispatcher] sendTyping:", err?.message || err);
          }
        };
        typingStartTimer = setTimeout(async () => {
          if (commandFinished) return;
          await sendTypingSafe();
          typingPulseTimer = setInterval(() => {
            void sendTypingSafe();
          }, 8000);
          typingPulseTimer.unref?.();
        }, 2500);
        typingStartTimer.unref?.();
        if (commandChannel) {
          commandChannel.sendTyping = async () => {
            await sendTypingSafe();
          };
        }
      }
    }

    if (commandChannel) {
      commandMessage.channel = commandChannel;
    }

    const cmdName = String(execCommand?.name || "").toLowerCase();
    if (isFireAndForget(execCommand) && !execMessage?.__webTicketSync) {
      void Promise.resolve(execCommand.execute(commandMessage, execArgs, resolvedClient)).catch(
        (err?) => {
          global.logger?.error?.(
            `[PREFIX] fire-and-forget command=${cmdName} guild=${String(execMessage?.guild?.id || "dm")} user=${String(execMessage?.author?.id || "unknown")}`,
            err?.stack || err?.message || err,
          );
        },
      );
      if (enableTypingPulse) {
        commandFinished = true;
        if (typingStartTimer) clearTimeout(typingStartTimer);
        if (typingPulseTimer) clearInterval(typingPulseTimer);
      }
      return null;
    }

    try {
      await Promise.race([
        Promise.resolve(execCommand.execute(commandMessage, execArgs, resolvedClient)),
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
      if (afterSuccessfulExecute) {
        await afterSuccessfulExecute({
          message: execMessage,
          commandName: cmdName,
          resolvedClient,
        });
      }
    } catch (error) {
      global.logger?.error?.(
        `[PREFIX COMMAND ERROR] command=${String(execCommand?.name || "unknown")} guild=${String(execMessage?.guild?.id || "dm")} user=${String(execMessage?.author?.id || "unknown")}`,
        error?.stack || error?.message || error,
      );
      await logPrefixErrorToChannel(execMessage, resolvedClient, execCommand?.name || "unknown", error);
      const feedback = buildInternalCommandErrorEmbed(error);
      if (shouldDeleteCommandMessage(execCommand)) {
        await execMessage.delete().catch(() => null);
      }
      if (enableTypingPulse) {
        await sendTemporaryReply(execMessage, { embeds: [feedback] }, EPHEMERAL_TTL_SHORT_MS);
      } else {
        await sendTemporaryMessage(execMessage.channel, { embeds: [feedback] }, EPHEMERAL_TTL_SHORT_MS);
      }
    } finally {
      if (enableTypingPulse) {
        commandFinished = true;
        if (typingStartTimer) clearTimeout(typingStartTimer);
        if (typingPulseTimer) clearInterval(typingPulseTimer);
      }
    }
    return null;
  }

  async function drainPrefixQueue(lockId?, resolvedClient?) {
    const resolveQueuedMessage = async (payload?) => {
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
      await removeLoadingReaction(next.message, resolvedClient);
      resolvedClient.prefixCommandLocks.add(lockId);
      if (trackInFlight) {
        if (!resolvedClient.prefixCommandInFlight) resolvedClient.prefixCommandInFlight = new Map();
        resolvedClient.prefixCommandInFlight.set(lockId, next);
      }
      try {
        await Promise.race([
          executePrefixCommandRuntime({ payload: next, resolvedClient }),
          new Promise((_?, reject?) => {
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
        if (trackInFlight) resolvedClient.prefixCommandInFlight?.delete(lockId);
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

  function consumeMapPrefixCooldown(guildId?, userId?) {
    if (!mapCooldownMs) return { ok: true, remainingMs: 0 };
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const last = Number(prefixCooldownHitAt.get(key) || 0);
    const elapsed = now - last;
    if (elapsed < mapCooldownMs) {
      return { ok: false, remainingMs: mapCooldownMs - elapsed };
    }
    prefixCooldownHitAt.set(key, now);
    return { ok: true, remainingMs: 0 };
  }

  async function handleOfficialPrefixMessage({
    message,
    resolvedClient,
    defaultPrefix,
    overrideCommand = null,
    maybeSendWrongPrefixHint,
    getCachedOrFetchMember,
    hasAnyStaffBypassPermission,
  }) {
    if (rewriteMessageAliases) {
      rewriteMessageAliases(message, resolvedClient, defaultPrefix);
    }
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    const startsWithDefault = String(message.content || "").startsWith(defaultPrefix);
    let resolvedCommandRef = overrideCommand || null;
    const deleteCommandMessage = async () => {
      if (!shouldDeleteCommandMessage(resolvedCommandRef)) return;
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
    if (removedCommands.has(cmd)) return;

    const command =
      overrideCommand ||
      resolvedClient?.pcommands?.get?.(cmd) ||
      resolvedClient?.pcommands?.get?.(resolvedClient?.aliases?.get?.(cmd)) ||
      null;
    resolvedCommandRef = command;
    if (!command) {
      if (onCommandNotFound) {
        const handled = await onCommandNotFound({
          message,
          resolvedClient,
          cmd,
          args,
          defaultPrefix,
          sendTemporaryMessage,
          sendTemporaryReply,
        });
        if (handled) return;
      }
      const channelId = String(message?.channelId || "");
      const hintChannels = new Set(
        [IDs.channels?.commands, IDs.channels?.staffCmds].filter(Boolean).map(String),
      );
      if (hintChannels.size && !hintChannels.has(channelId)) {
        return;
      }
      if (/^-?\d+$/.test(cmd) || (args[0] != null && /^-\d+$/.test(String(args[0]).trim()))) {
        return;
      }

      await sendTemporaryReply(
        message,
        { content: "<a:VC_Attention:1482534443632558151> Comando non trovato." },
        EPHEMERAL_TTL_SHORT_MS,
      );
      return;
    }

    if (afterCommandResolved) {
      const cont = await afterCommandResolved({
        message,
        resolvedClient,
        command,
        cmd,
        args,
        defaultPrefix,
        usedPrefix,
        deleteCommandMessage,
        sendTemporaryMessage,
        resolveWithTimeout,
      });
      if (cont === false) return;
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
      () =>
        checkPrefixPermission(message, command.name, prefixSubcommand, { returnDetails: true }),
      { allowed: false, reason: "missing_permission", requiredRoles: null, channels: null },
      `permission precheck for ${command.name}`,
    );
    if (!permissionResult?.allowed) {
      if (handlePermissionDenied) {
        const handled = await handlePermissionDenied({
          message,
          command,
          cmd,
          prefixSubcommand,
          permissionResult,
          deleteCommandMessage,
          sendTemporaryMessage,
          getPrefixRequiredRoles,
          buildGlobalPermissionDeniedEmbed,
          buildGlobalChannelDeniedEmbed,
        });
        if (handled) return;
      }
      if (permissionResult?.reason === "channel" && Array.isArray(permissionResult.channels)) {
        await deleteCommandMessage();
        const embed = buildGlobalChannelDeniedEmbed(
          permissionResult.channels,
          "comando",
          message.member,
        );
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
        (typeof hasAnyStaffBypassPermission === "function" &&
          hasAnyStaffBypassPermission(message.member?.permissions)) ||
        String(message.guild?.ownerId || "") === String(message.author?.id || ""),
    );
    let cooldownMember = message.member || null;
    const needsFreshMemberForCooldownBypass =
      !hasPrefixCooldownBypass &&
      (!message.member?.permissions || !message.member?.roles?.cache || Boolean(checkUserCooldown));
    if (needsFreshMemberForCooldownBypass && getCachedOrFetchMember && message.guild) {
      const fetchedMember = await getCachedOrFetchMember(message.guild, message.author.id).catch(
        () => null,
      );
      if (fetchedMember) cooldownMember = fetchedMember;
      hasPrefixCooldownBypass = Boolean(
        (PREFIX_COOLDOWN_BYPASS_ROLE_ID &&
          fetchedMember?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID)) ||
          (typeof hasAnyStaffBypassPermission === "function" &&
            hasAnyStaffBypassPermission(fetchedMember?.permissions)) ||
          String(message.guild?.ownerId || "") === String(message.author?.id || ""),
      );
    }

    if (
      message.guild &&
      !hasPrefixCooldownBypass &&
      !isEditedPrefixExecution &&
      !command.skipCommandCooldown
    ) {
      let cooldownResult = null;
      if (checkUserCooldown) {
        cooldownResult = await checkUserCooldown({
          message,
          resolvedClient,
          command,
          cooldownMember,
          resolveWithTimeout,
        });
      } else if (mapCooldownMs > 0) {
        cooldownResult = consumeMapPrefixCooldown(message.guild.id, message.author.id);
      }
      if (cooldownResult && !cooldownResult.ok) {
        const remaining = Math.max(1, Math.ceil(Number(cooldownResult.remainingMs || 0) / 1000));
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
    const queueLockId = message.guild
      ? `${message.guild.id}:${userId}`
      : allowDmQueueLock
        ? `dm:${userId}`
        : `${userId}`;
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
    if (trackInFlight) {
      if (!resolvedClient.prefixCommandInFlight) resolvedClient.prefixCommandInFlight = new Map();
      resolvedClient.prefixCommandInFlight.set(queueLockId, commandPayload);
    }
    try {
      await executePrefixCommandRuntime({
        payload: { message, args, command },
        resolvedClient,
      });
    } finally {
      resolvedClient.prefixCommandLocks.delete(queueLockId);
      if (trackInFlight) {
        resolvedClient.prefixCommandInFlight?.delete(queueLockId);
        persistPrefixQueueSnapshotNow(resolvedClient);
      }
      await drainPrefixQueue(queueLockId, resolvedClient);
    }
  }

  return { handleOfficialPrefixMessage, ensurePrefixQueueLoaded };
}

export = { createOfficialPrefixDispatcher };
