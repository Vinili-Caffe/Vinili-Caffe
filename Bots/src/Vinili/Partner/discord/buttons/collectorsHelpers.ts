const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { createPromptMessageCollector } = require("../../../../shared/discord/promptMessageCollectorRuntime") as typeof import("../../../../shared/discord/promptMessageCollectorRuntime");
const { tenantI18nNoticePayload } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");

const PRIVATE_FLAG = 1 << 6;

function ephemeralNotice(lang?, key?, guild?, vars: Record<string, any> = {}) {
  return {
    ...tenantI18nNoticePayload(lang, key, guild, vars, { ephemeral: true }),
    flags: PRIVATE_FLAG,
  };
}

function createCollectorRegistry() {
  const active = new Map();

  function stopCollector(key?) {
    const existing = active.get(key);
    if (existing) {
      existing.stop();
      active.delete(key);
    }
  }

  function forgetCollector(key?) {
    active.delete(key);
  }

  function createTrackedCollector(key?, channel?, userId?, ttlMs?) {
    const collector = createPromptMessageCollector(channel, {
      userId,
      time: ttlMs,
      max: 1,
    });
    if (!collector) return null;
    active.set(key, collector);
    return collector;
  }

  return { stopCollector, forgetCollector, createTrackedCollector };
}

function botCanUseChannel(guild?, channel?) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages),
  );
}

function botCanCreateInviteInChannel(guild?, channel?) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  return Boolean(channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
}

async function resolveChannelFromMessage(message?) {
  const guild = message.guild;
  if (!guild) return { channel: null, error: "guild_missing" };
  const raw = String(message.content || "").trim();
  if (!raw) return { channel: null, error: "missing_input" };
  if (/^(annulla|cancel)$/i.test(raw)) return { channel: null, cancel: true };

  const mention = message.mentions?.channels?.first?.();
  if (mention?.isTextBased?.()) return { channel: mention };

  const mentionMatch = raw.match(/^<#(\d{16,20})>$/);
  const channelId = mentionMatch ? mentionMatch[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (channelId) {
    const channel =
      guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
    return { channel };
  }
  return { channel: null, error: "invalid_channel" };
}

function resolveRoleFromMessage(message?) {
  const guild = message.guild;
  if (!guild) return { role: null, error: "guild_missing" };
  const raw = String(message.content || "").trim();
  if (!raw) return { role: null, error: "missing_input" };
  if (/^(annulla|cancel)$/i.test(raw)) return { role: null, cancel: true };

  const mention = message.mentions?.roles?.first?.();
  if (mention) return { role: mention };

  const mentionMatch = raw.match(/^<@&(\d{16,20})>$/);
  const roleId = mentionMatch ? mentionMatch[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return { role: null, error: "invalid_role" };
    return { role };
  }
  return { role: null, error: "invalid_role" };
}

function parseOptionalInt(raw?) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function parseCustomRoleToken(raw?) {
  const customRoleRaw = String(raw || "").trim();
  if (!customRoleRaw) return null;
  const mentionMatch = customRoleRaw.match(/^<@&(\d{16,20})>$/);
  return mentionMatch
    ? mentionMatch[1]
    : /^\d{16,20}$/.test(customRoleRaw)
      ? customRoleRaw
      : null;
}

export = {
  PRIVATE_FLAG,
  ephemeralNotice,
  createCollectorRegistry,
  botCanUseChannel,
  botCanCreateInviteInChannel,
  resolveChannelFromMessage,
  resolveRoleFromMessage,
  parseOptionalInt,
  parseCustomRoleToken,
};
