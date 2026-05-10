const { PermissionFlagsBits } = require("discord.js");
const IDs = require("../Config/ids");
const { handleOfficialPrefixMessage } = require("./officialPrefixDispatcher");
const { getGuildMemberCached } = require("../Interaction/entityCache");

const BOT_MENTION_REGEX = /<@!?\d+>/;
const WRONG_PREFIX_HINT_CHANNEL_IDS = new Set(
  [IDs.channels?.commands, IDs.channels?.staffCmds].filter(Boolean).map((id) => String(id)),
);
const TEMPORARY_NOTICE_LIFETIME_MS = 8000;

const STAFF_BYPASS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
];

function hasAnyStaffBypassPermission(permissions) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm) => permissions.has(perm));
}

function deleteMessageLater(message, delayMs = TEMPORARY_NOTICE_LIFETIME_MS) {
  if (!message || typeof message.delete !== "function") return;
  const timer = setTimeout(() => message.delete().catch(() => {}), delayMs);
  timer.unref?.();
}

async function sendTemporaryReply(message, payload, delayMs = TEMPORARY_NOTICE_LIFETIME_MS) {
  const sent = await message.reply(payload).catch(() => null);
  if (sent) deleteMessageLater(sent, delayMs);
  return sent;
}

async function sendTemporaryChannelNotice(channel, payload, delayMs = TEMPORARY_NOTICE_LIFETIME_MS) {
  if (!channel || typeof channel.send !== "function") return null;
  const sent = await channel.send(payload).catch(() => null);
  if (sent) deleteMessageLater(sent, delayMs);
  return sent;
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

function parseWrongPrefixAttempt(content, validPrefix = "-") {
  const text = String(content || "").trim();
  const safePrefix = String(validPrefix || "-");
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

function shouldSendWrongPrefixHint(message, usedPrefix, commandName) {
  const client = message?.client;
  if (!client) return true;
  if (!client._wrongPrefixHintCooldown) {
    client._wrongPrefixHintCooldown = new Map();
  }
  const key = [
    String(message.guildId || "noguild"),
    String(message.channelId || "nochannel"),
    String(message.author?.id || "nouser"),
    String(usedPrefix || ""),
    String(commandName || ""),
  ].join(":");
  const now = Date.now();
  const lastAt = Number(client._wrongPrefixHintCooldown.get(key) || 0);
  if (now - lastAt < 10_000) return false;
  client._wrongPrefixHintCooldown.set(key, now);
  return true;
}

async function maybeSendWrongPrefixHint(message, client, validPrefix = "-") {
  const channelId = String(message?.channelId || "");
  if (WRONG_PREFIX_HINT_CHANNEL_IDS.size && !WRONG_PREFIX_HINT_CHANNEL_IDS.has(channelId)) {
    return false;
  }
  const safePrefix = String(validPrefix || "-");
  const attempt = parseWrongPrefixAttempt(message?.content || "", safePrefix);
  if (!attempt?.token || !attempt?.usedPrefix) return false;
  if (attempt.usedPrefix === safePrefix) return false;
  const command = resolvePrefixCommandByToken(client, attempt.token);
  if (!command) return false;
  const commandName = String(command.name || "").toLowerCase();
  if (commandName === "help") return false;
  if (!shouldSendWrongPrefixHint(message, attempt.usedPrefix, commandName)) {
    return true;
  }
  await sendTemporaryChannelNotice(message.channel, {
    content: `\`${attempt.usedPrefix}${attempt.token}\` non è valido. Usa \`${safePrefix}${commandName}\`.`,
  });
  return true;
}

async function dispatchPrefixMessage(message, client) {
  if (!message?.guild || message.author?.bot) return false;

  const content = (message.content || "").trim();
  if (!content) return false;
  const safePrefix = String(client?.config?.prefix || "-").trim() || "-";

  let startsWithPrefix = content.startsWith(safePrefix);
  const isMention =
    client.user &&
    BOT_MENTION_REGEX.test(content) &&
    content.replace(BOT_MENTION_REGEX, "").trim().length > 0;

  if (!startsWithPrefix && !isMention) {
    await maybeSendWrongPrefixHint(message, client, safePrefix);
    return false;
  }

  if (!startsWithPrefix && isMention) {
    try {
      message.content = content.replace(BOT_MENTION_REGEX, safePrefix).replace(/\s+/g, " ").trim();
    } catch (e) {
      global.logger?.warn?.("[PREFIX] mention normalize failed:", e?.message || e);
      return false;
    }
  }

  try {
    await handleOfficialPrefixMessage({
      message,
      resolvedClient: client,
      defaultPrefix: safePrefix,
      overrideCommand: null,
      maybeSendWrongPrefixHint,
      getCachedOrFetchMember: getGuildMemberCached,
      hasAnyStaffBypassPermission,
    });
  } catch (err) {
    global.logger?.error?.("[PREFIX] handleOfficialPrefixMessage:", err);
  }
  return true;
}

module.exports = { dispatchPrefixMessage, maybeSendWrongPrefixHint };