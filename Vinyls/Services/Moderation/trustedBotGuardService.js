const { AuditLogEvent, PermissionsBitField, UserFlagsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getJoinGateConfigSnapshot } = require("./joinGateService");
const { createModCase, logModCase } = require("../../Utils/Moderation/moderation");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const AUDIT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFIED_BOT_USER_CACHE = new Map();
const AUTOMATION_CHANNEL_IDS = new Set(
  [IDs.channels?.supporters, IDs.channels?.commands].filter(Boolean).map((id) => String(id)),
);

function isTrustedAutomationChannelMessage(message) {
  const channelId = String(message?.channelId || "");
  if (!channelId || !AUTOMATION_CHANNEL_IDS.has(channelId)) return false;
  return Boolean(message?.author?.bot || message?.webhookId || message?.applicationId);
}

function buildTrustedBotIdSet(client) {
  const ids = new Set();
  for (const value of Object.values(IDs?.bots || {})) {
    const id = String(value || "").trim();
    if (/^\d{5,30}$/.test(id)) ids.add(id);
  }
  const selfId = String(client?.user?.id || "").trim();
  if (/^\d{5,30}$/.test(selfId)) ids.add(selfId);
  const cfg = getJoinGateConfigSnapshot();
  for (const id of Array.isArray(cfg?.trustedBotOnly?.extraBotIds) ? cfg.trustedBotOnly.extraBotIds : []) {
    const safe = String(id || "").trim();
    if (/^\d{5,30}$/.test(safe)) ids.add(safe);
  }
  return ids;
}

async function isDiscordVerifiedBotUser(user) {
  if (!user?.bot) return false;
  const id = String(user.id || "").trim();
  if (!id) return false;
  if (VERIFIED_BOT_USER_CACHE.has(id)) return VERIFIED_BOT_USER_CACHE.get(id);
  let verified = false;
  try {
    const flags =
      user.flags ||
      (typeof user.fetchFlags === "function" ? await user.fetchFlags().catch(() => null) : null);
    verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
  } catch {
    verified = false;
  }
  VERIFIED_BOT_USER_CACHE.set(id, verified);
  return verified;
}

async function isTrustedBotMember(member, client) {
  if (!member?.user?.bot) return false;
  const trusted = buildTrustedBotIdSet(client);
  const userId = String(member.user.id || "");
  const appId = String(member.user.id || "");
  if (trusted.has(userId) || trusted.has(appId)) return true;
  return isDiscordVerifiedBotUser(member.user);
}

async function isTrustedBotMessage(message, client) {
  if (!message?.author?.bot) return false;
  const trusted = buildTrustedBotIdSet(client || message.client);
  const authorId = String(message.author?.id || "");
  const applicationId = String(message.applicationId || "");
  if (trusted.has(authorId) || (applicationId && trusted.has(applicationId))) return true;
  return isDiscordVerifiedBotUser(message.author);
}

async function fetchRecentBotAddExecutorId(guild, botId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return null;
  }
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 25 }).catch(() => null);
  if (!logs?.entries?.size) return null;
  const now = Date.now();
  const entry =
    logs.entries.find((row) => {
      const createdTs = Number(row?.createdTimestamp || 0);
      return (
        createdTs > 0 &&
        now - createdTs <= AUDIT_LOOKBACK_MS &&
        String(row?.target?.id || "") === String(botId || "")
      );
    }) || null;
  return entry ? String(entry.executor?.id || entry.executorId || "").trim() || null : null;
}

async function punishMemberForBotAbuse(guild, userId, reason, action = "ban") {
  const id = String(userId || "").trim();
  if (!guild || !/^\d{5,30}$/.test(id)) return { ok: false, reason: "invalid_target" };
  if (id === String(guild.client?.user?.id || "")) return { ok: false, reason: "self" };

  const member = await getGuildMemberCached(guild, id);
  const normalized = ["ban", "kick", "timeout"].includes(String(action || "").toLowerCase())
    ? String(action).toLowerCase()
    : "ban";
  const me = guild.members.me;
  let applied = false;
  let appliedAction = normalized;

  if (normalized === "ban" && me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
    applied = await guild.members
      .ban(id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch(() => false);
  } else if (normalized === "kick" && member?.kickable) {
    applied = await member.kick(reason).then(() => true).catch(() => false);
  } else if (normalized === "timeout" && member?.moderatable) {
    applied = await member
      .timeout(24 * 60 * 60_000, reason)
      .then(() => true)
      .catch(() => false);
  }

  if (!applied && member?.kickable) {
    applied = await member.kick(reason).then(() => true).catch(() => false);
    appliedAction = "kick";
  }

  if (applied) {
    try {
      const modCase = await createModCase({
        guildId: guild.id,
        action: appliedAction,
        userId: id,
        modId: guild.client.user.id,
        reason,
      });
      await logModCase(guild.client, modCase);
    } catch (err) {
      global.logger?.warn?.("[trustedBotGuard] modcase failed:", err?.message || err);
    }
  }

  return { ok: applied, action: appliedAction };
}

async function enforceUntrustedBotMember(member, options = {}) {
  const guild = member?.guild;
  const client = guild?.client || member?.client;
  if (!guild || !member?.user?.bot) return { blocked: false, reason: "not_bot" };
  if (await isTrustedBotMember(member, client)) return { blocked: false, reason: "trusted" };

  const cfg = getJoinGateConfigSnapshot();
  const rule = cfg?.trustedBotOnly || {};
  if (!cfg?.enabled || rule?.enabled === false) return { blocked: false, reason: "disabled" };

  const action = String(rule?.action || "ban").toLowerCase();
  const reason = String(
    options?.reason ||
      "Bot/app non autorizzato nel server (trusted bot whitelist).",
  );
  const executorId =
    String(options?.executorId || "").trim() ||
    (await fetchRecentBotAddExecutorId(guild, member.user.id));

  let botPunished = false;
  if (action === "ban" && member.bannable) {
    botPunished = await guild.members
      .ban(member.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch(() => false);
  } else if (member.kickable) {
    botPunished = await member.kick(reason).then(() => true).catch(() => false);
  }

  let adderPunished = false;
  if (rule?.punishAdder !== false && executorId && executorId !== member.id) {
    const adderAction = String(rule?.punishAdderAction || "ban").toLowerCase();
    const adderResult = await punishMemberForBotAbuse(
      guild,
      executorId,
      `Ha aggiunto un bot/app non autorizzato: ${member.user?.tag || member.id}`,
      adderAction,
    );
    adderPunished = Boolean(adderResult?.ok);
  }

  if (botPunished || adderPunished) {
    global.logger?.warn?.(
      `[trustedBotGuard] bot=${member.user?.id || "?"} action=${action} adder=${executorId || "unknown"} adderPunished=${adderPunished}`,
    );
  }

  return {
    blocked: botPunished,
    botPunished,
    adderPunished,
    executorId: executorId || null,
    action,
  };
}

async function isTrustedApplicationMessage(message, client) {
  const appId = String(message?.applicationId || "").trim();
  if (!appId) return false;
  const resolvedClient = client || message?.client;
  const trusted = buildTrustedBotIdSet(resolvedClient);
  if (trusted.has(appId)) return true;
  if (appId === String(resolvedClient?.user?.id || "")) return true;
  if (message?.author?.bot && (await isTrustedBotMessage(message, resolvedClient))) return true;
  try {
    const user =
      resolvedClient?.users?.cache?.get(appId) ||
      (await resolvedClient?.users?.fetch?.(appId).catch(() => null));
    if (user?.bot && (await isDiscordVerifiedBotUser(user))) return true;
  } catch {
      }
  return false;
}

function resolveApplicationMessageActorId(message) {
  const fromInteraction = String(
    message?.interactionMetadata?.user?.id || message?.interaction?.user?.id || "",
  ).trim();
  if (fromInteraction) return fromInteraction;
  if (!message?.author?.bot) return String(message?.author?.id || "").trim() || null;
  return null;
}

async function handleUntrustedApplicationMessage(message) {
  const guild = message?.guild;
  const appId = String(message?.applicationId || "").trim();
  if (!guild || !appId) return false;
  if (MAIN_GUILD_ID && String(guild.id) !== MAIN_GUILD_ID) return false;
  if (isTrustedAutomationChannelMessage(message)) return false;
  if (await isTrustedApplicationMessage(message)) return false;

  const cfg = getJoinGateConfigSnapshot();
  const rule = cfg?.untrustedUserInstallApps || cfg?.untrustedBotMessages || {};
  if (!cfg?.enabled || rule?.enabled === false) return false;

  const actorId = resolveApplicationMessageActorId(message);
  const action = String(rule?.punishActorAction || rule?.action || "ban").toLowerCase();
  const reason = `App non autorizzata usata nel server (user-install / selfbot app: ${appId}).`;

  await message.delete().catch(() => {});

  if (actorId) {
    const actorMember = await getGuildMemberCached(guild, actorId);
    if (actorMember && !actorMember.user?.bot) {
      await punishMemberForBotAbuse(guild, actorId, reason, action);
    }
  }

  if (message.author?.bot) {
    const botMember = message.member || (await getGuildMemberCached(guild, message.author.id));
    if (botMember) {
      await enforceUntrustedBotMember(botMember, {
        reason,
        executorId: actorId,
      });
    } else if (guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
      await guild.members
        .ban(message.author.id, { deleteMessageSeconds: 604800, reason })
        .catch(() => {});
    }
  }

  global.logger?.warn?.(
    `[trustedBotGuard] blocked untrusted application message app=${appId} actor=${actorId || "unknown"}`,
  );
  return true;
}

async function handleUntrustedBotMessage(message) {
  const guild = message?.guild;
  if (!guild || !message?.author?.bot) return false;
  if (MAIN_GUILD_ID && String(guild.id) !== MAIN_GUILD_ID) return false;
  if (isTrustedAutomationChannelMessage(message)) return false;
  if (await isTrustedBotMessage(message)) return false;

  const cfg = getJoinGateConfigSnapshot();
  const rule = cfg?.untrustedBotMessages || {};
  if (!cfg?.enabled || rule?.enabled === false) return false;

  await message.delete().catch(() => {});

  const member = message.member || (await getGuildMemberCached(guild, message.author.id));
  if (member) {
    await enforceUntrustedBotMember(member, {
      reason: "Spam/azione da bot/app non autorizzato.",
      executorId: await fetchRecentBotAddExecutorId(guild, message.author.id),
    });
  } else if (guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
    await guild.members
      .ban(message.author.id, {
        deleteMessageSeconds: 604800,
        reason: "Spam da bot/app non autorizzato (non più nel server).",
      })
      .catch(() => {});
  }

  return true;
}

async function sweepUntrustedBotsInGuild(guild, client) {
  if (!guild) return { removed: 0, scanned: 0 };
  if (MAIN_GUILD_ID && String(guild.id) !== MAIN_GUILD_ID) return { removed: 0, scanned: 0 };
  const cfg = getJoinGateConfigSnapshot();
  if (!cfg?.enabled || cfg?.trustedBotOnly?.enabled === false) return { removed: 0, scanned: 0 };

  let removed = 0;
  let scanned = 0;
  for (const member of guild.members.cache.values()) {
    if (!member.user?.bot) continue;
    scanned += 1;
    if (await isTrustedBotMember(member, client || guild.client)) continue;
    const result = await enforceUntrustedBotMember(member, {
      reason: "Bot/app non autorizzato rilevato durante sweep di sicurezza.",
    });
    if (result?.blocked) removed += 1;
  }
  if (removed > 0) {
    global.logger?.warn?.(`[trustedBotGuard] sweep removed ${removed} untrusted bot(s) in ${guild.id}`);
  }
  return { removed, scanned };
}

module.exports = {
  buildTrustedBotIdSet,
  isTrustedBotMember,
  isTrustedBotMessage,
  isTrustedApplicationMessage,
  resolveApplicationMessageActorId,
  enforceUntrustedBotMember,
  handleUntrustedBotMessage,
  handleUntrustedApplicationMessage,
  sweepUntrustedBotsInGuild,
  punishMemberForBotAbuse,
  fetchRecentBotAddExecutorId,
};
