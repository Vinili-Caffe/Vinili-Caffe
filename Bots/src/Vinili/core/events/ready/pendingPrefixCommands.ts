const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const PENDING_COMMANDS_LOOKBACK_MS = 10 * 60 * 1000;
const PENDING_COMMANDS_FETCH_LIMIT = 40;
const PENDING_ORPHAN_LOOKBACK_MS = 10 * 60 * 1000;
const PENDING_REPLY_WINDOW_MS = 2 * 60 * 1000;
const PENDING_SCAN_CONCURRENCY = 4;
const PENDING_EXEC_GAP_MS = 250;

function pendingPriorityChannelIds() {
  return [
    IDs.channels?.ship,
    IDs.channels?.commands,
    IDs.channels?.staffCmds,
    IDs.channels?.counting,
    IDs.channels?.media,
    IDs.channels?.economy,
  ]
    .map((id?) => String(id || "").trim())
    .filter(Boolean);
}

async function mapWithConcurrency(items?, concurrency?, worker?) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  let idx = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (idx < list.length) {
      const current = idx;
      idx += 1;
      await worker(list[current], current);
    }
  });
  await Promise.all(runners);
}

function resolvePendingPrefixCommandToken(client?, message?, prefix?) {
  const content = String(message?.content || "").trim();
  const safePrefix = String(prefix || "+");
  if (!content.startsWith(safePrefix)) return null;
  const args = content.slice(safePrefix.length).trim().split(/\s+/).filter(Boolean);
  const raw = String(args[0] || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  return (
    client?.pcommands?.get?.(raw) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(raw)) ||
    null
  );
}

async function botAlreadyRepliedToPrefixMessage(message?, client?) {
  const botId = String(client?.user?.id || "");
  if (!botId || !message?.id || !message?.channel?.messages?.fetch) return false;
  const cmdTs = Number(message.createdTimestamp || 0);
  const authorId = String(message.author?.id || "");
  try {
    const newer = await message.channel.messages.fetch({ after: message.id, limit: 25 });
    for (const reply of newer.values()) {
      if (String(reply.author?.id || "") !== botId) continue;
            if (String(reply.reference?.messageId || "") === String(message.id)) return true;
                        if (reply.reference?.messageId) continue;
      const replyTs = Number(reply.createdTimestamp || 0);
      if (!cmdTs || !replyTs || replyTs - cmdTs < 0 || replyTs - cmdTs > PENDING_REPLY_WINDOW_MS) continue;
      if (!authorId) continue;
      const mentionsAuthor =
        Boolean(reply.mentions?.users?.has?.(authorId)) ||
        String(reply.content || "").includes(`<@${authorId}>`) ||
        String(reply.content || "").includes(`<@!${authorId}>`);
      if (!mentionsAuthor) continue;
      if (reply.embeds?.length || String(reply.content || "").trim()) return true;
    }
  } catch {
      }
  return false;
}

function isPrefixLoadingReaction(reaction?) {
  if (!reaction) return false;
  const loadingId = String(IDs.emojis?.loadingAnimatedId || "");
  const fallbackId = String(IDs.emojis?.loadingFallbackId || "");
  const emojiId = String(reaction.emoji?.id || "");
  if (loadingId && emojiId === loadingId) return true;
  if (fallbackId && emojiId === fallbackId) return true;
  const name = String(reaction.emoji?.name || "");
  return name === "\u23F3" || name === "⏳" || name === "VC_Loading";
}

function messageHasBotLoadingReaction(message?, client?) {
  const botId = String(client?.user?.id || "");
  if (!message?.reactions?.cache?.size) return false;
  for (const reaction of message.reactions.cache.values()) {
    if (!isPrefixLoadingReaction(reaction)) continue;
        if (reaction.me === true) return true;
    if (botId && reaction.users?.cache?.has(botId)) return true;
  }
  return false;
}

function isPendingDeepScanGuild(guildId?) {
  const id = String(guildId || "").trim();
  if (!id) return false;
  const main = String(IDs.guilds?.main || "").trim();
  const test = String(IDs.guilds?.test || "").trim();
  return id === main || (test && id === test);
}

async function collectPendingPrefixScanChannels(guild?, { deep = false } = {}) {
  const { ChannelType } = require("discord.js") as typeof import("discord.js");
  const byId = new Map();
  const isScannableChannel = (ch?) =>
    ch?.messages?.fetch &&
    (ch?.isTextBased?.() || ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice) &&
    !(ch?.isThread?.() && ch.archived);

  const priorityIds = pendingPriorityChannelIds();

    if (deep) {
    await guild.channels.fetch().catch(() => null);
  } else {
    for (const id of priorityIds) {
      if (guild.channels.cache.has(id)) continue;
      await guild.channels.fetch(id).catch(() => null);
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (isScannableChannel(channel)) byId.set(channel.id, channel);
  }
  if (deep && typeof guild.channels.fetchActiveThreads === "function") {
    try {
      const active = await guild.channels.fetchActiveThreads();
      const threads = active?.threads;
      const list = threads ? (typeof threads.values === "function" ? [...threads.values()] : [...threads]) : [];
      for (const thread of list) {
        if (isScannableChannel(thread)) byId.set(thread.id, thread);
      }
    } catch {
          }
  }

  const priority = new Set(priorityIds);
  let all = [...byId.values()];
  if (!deep) {
    all = all.filter((ch?) => priority.has(String(ch.id)) || ch.messages?.cache?.size > 0);
    if (!all.length) all = [...byId.values()].slice(0, 8);
  }
  all.sort((a?, b?) => {
    const ap = priority.has(String(a.id)) ? 0 : 1;
    const bp = priority.has(String(b.id)) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return String(a.id).localeCompare(String(b.id));
  });
  return all;
}

async function processPendingPrefixCommands(client?) {
  const envValue = String(process.env.PROCESS_PENDING_COMMANDS_ON_STARTUP || "").trim().toLowerCase();
  const enabled = envValue
    ? ["1", "true", "yes", "on"].includes(envValue)
    : client?.config?.processPendingCommands === true;
  if (!enabled) return;
  if (client.__prefixCommandsReady === false || !client?.pcommands?.size) {
    global.logger?.warn?.("[READY] pending prefix skip: pcommands non pronti");
    return;
  }
  const { handleOfficialPrefixMessage, ensurePrefixQueueLoaded } = require("../../../core/officialPrefixDispatcher") as typeof import("../../../core/officialPrefixDispatcher");
    try {
    ensurePrefixQueueLoaded(client);
  } catch (err) {
    global.logger?.warn?.("[READY] prefix queue restore:", err?.message || err);
  }
  const { getCachedOrFetchMember } = require("../../../Community/services/officialMessageAutomationHandlers") as typeof import("../../../Community/services/officialMessageAutomationHandlers");
  const { resolveCommandPrefixForGuildFresh } = require("../../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../../MultiGuild/core/tenantGuildSettings");
  const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
  const fallbackPrefix = String(client?.config?.prefix || "+").trim();
  const hasAnyStaffBypassPermission = (permissions?) => permissions && typeof permissions.has === "function" && [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers].some((p?) => permissions.has(p));
  const noopWrongPrefixHint = () => Promise.resolve(false);

  const collected = [];
  const seenIds = new Set();
  const scanStartedAt = Date.now();

  const scanChannel = async (channel?, guildPrefix?, me?) => {
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.ReadMessageHistory)) return;
    try {
      const messages = await channel.messages.fetch({ limit: PENDING_COMMANDS_FETCH_LIMIT }).catch(() => null);
      if (!messages) return;
      const now = Date.now();
      const cutoffLoading = now - PENDING_COMMANDS_LOOKBACK_MS;
      const cutoffOrphan = now - PENDING_ORPHAN_LOOKBACK_MS;
      for (const msg of messages.values()) {
        if (msg.author?.bot || !msg.content?.trim().startsWith(guildPrefix)) continue;
        const msgId = String(msg.id || "");
        if (!msgId || seenIds.has(msgId)) continue;

                const hasLoading = messageHasBotLoadingReaction(msg, client);
        if (hasLoading) {
          if (msg.createdTimestamp < cutoffLoading) continue;
          seenIds.add(msgId);
          collected.push({ message: msg, ts: msg.createdTimestamp, reason: "loading", prefix: guildPrefix });
          continue;
        }

        if (msg.createdTimestamp < cutoffOrphan) continue;
        const command = resolvePendingPrefixCommandToken(client, msg, guildPrefix);
        if (!command) continue;
        seenIds.add(msgId);
        collected.push({ message: msg, ts: msg.createdTimestamp, reason: "orphan", prefix: guildPrefix });
      }
    } catch (err) {
      global.logger?.warn?.("[READY] pending commands fetch failed:", channel?.id, err?.message || err);
    }
  };

  const executeCollected = async (rows?, label?) => {
    rows.sort((a?, b?) => a.ts - b.ts);
    if (!rows.length) return;
    const loadingN = rows.filter((row?) => row.reason === "loading").length;
    global.logger?.info?.(
      `[READY] ${label}: recupero ${rows.length} prefix (loading=${loadingN}, orphan=${rows.length - loadingN}).`,
    );
    for (const { message, prefix: msgPrefix } of rows) {
      try {
        if (await botAlreadyRepliedToPrefixMessage(message, client)) continue;
        try {
          const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
          const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
          const emoji = loadingEmojiId ? message.client?.emojis?.cache?.get(loadingEmojiId) : null;
          if (emoji) await message.react(emoji).catch(() => { });
          else if (fallbackEmojiId) await message.react(fallbackEmojiId).catch(() => { });
          else await message.react("\u23F3").catch(() => { });
        } catch (_) { }
        message.__fromPendingPrefixRecovery = true;
        await handleOfficialPrefixMessage({
          message,
          resolvedClient: client,
          defaultPrefix: msgPrefix || fallbackPrefix,
          overrideCommand: null,
          maybeSendWrongPrefixHint: noopWrongPrefixHint,
          getCachedOrFetchMember,
          hasAnyStaffBypassPermission,
        });
        if (PENDING_EXEC_GAP_MS > 0) {
          await new Promise((resolve?) => setTimeout(resolve, PENDING_EXEC_GAP_MS));
        }
      } catch (err) {
        global.logger?.warn?.("[READY] pending command execution failed:", message?.id, err?.message || err);
      }
    }
  };

  client.__pendingPrefixRecoveryActive = true;
  try {
    const priorityIds = new Set(pendingPriorityChannelIds());
    const guilds = [...client.guilds.cache.values()].filter((g?) => isPendingDeepScanGuild(g.id));
        if (!guilds.length) {
      global.logger?.warn?.("[READY] pending prefix: nessun guild main/test da scansionare");
    }

    for (const guild of guilds) {
      const me = guild.members.me;
      let guildPrefix = fallbackPrefix;
      try {
        guildPrefix = String(await resolveCommandPrefixForGuildFresh(guild.id, client) || fallbackPrefix).trim() || fallbackPrefix;
      } catch {
        guildPrefix = fallbackPrefix;
      }

      const channels = await collectPendingPrefixScanChannels(guild, { deep: true });
      const priorityChannels = channels.filter((ch?) => priorityIds.has(String(ch.id)));
      const restChannels = channels.filter((ch?) => !priorityIds.has(String(ch.id)));

            const phase1 = [];
      const prevCollected = collected.length;
      await mapWithConcurrency(priorityChannels, PENDING_SCAN_CONCURRENCY, (channel?) => scanChannel(channel, guildPrefix, me));
      phase1.push(...collected.slice(prevCollected));
      await executeCollected(phase1, `priority ${guild.name || guild.id}`);

            const phase2Start = collected.length;
      await mapWithConcurrency(restChannels, Math.min(2, PENDING_SCAN_CONCURRENCY), (channel?) => scanChannel(channel, guildPrefix, me));
      await executeCollected(collected.slice(phase2Start), `rest ${guild.name || guild.id}`);
    }
  } finally {
    client.__pendingPrefixRecoveryActive = false;
  }

  if (collected.length) {
    global.logger?.info?.(
      `[READY] Scan prefix completato (total=${collected.length}, scanMs=${Date.now() - scanStartedAt}).`,
    );
  }
}

export = {
  processPendingPrefixCommands,
};
