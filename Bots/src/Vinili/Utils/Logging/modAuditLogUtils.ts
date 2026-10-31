const { PermissionsBitField, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { resolveModLogChannelId } = require("../../MultiGuild/utils/tenantModLogChannel") as typeof import("../../MultiGuild/utils/tenantModLogChannel");

function logModLogSendFailure(guild?, channel?, err?, context?) {
  global.logger?.warn?.("[modLogs] invio fallito:", {
    guildId: guild?.id,
    channelId: channel?.id || null,
    context: String(context || ""),
    message: err?.message || err,
  });
}

async function resolveTextChannelInGuild(guild?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!guild || !cid) return null;
  const channel = guild.channels.cache.get(cid) || (await getGuildChannelCached(guild, cid));
  if (channel?.isTextBased?.()) return channel;
  return null;
}

async function resolveModLogChannel(guild?) {
  const channelId = resolveModLogChannelId(guild?.id);
  if (!guild || !channelId) return null;
  const channel = await resolveTextChannelInGuild(guild, channelId);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[modLogs] canale non valido o non testuale:", { guildId: guild.id, channelId });
    return null;
  }
  const me = channel.guild?.members?.me;
  const perms = channel.permissionsFor(me);
  if (
    !perms?.has(PermissionsBitField.Flags.ViewChannel) ||
    !perms?.has(PermissionsBitField.Flags.SendMessages)
  ) {
    global.logger?.warn?.("[modLogs] bot senza permessi nel canale:", { guildId: guild.id, logGuildId: channel.guild?.id, channelId: channel.id });
    return null;
  }
  return channel;
}

function canViewAuditLog(guild?) {
  return Boolean(
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
}

async function fetchRecentAuditEntry(guild?, actionType?, matcher?, limit = 20, windowMs = 120000) {
  if (!canViewAuditLog(guild)) return null;
  const logs = await guild.fetchAuditLogs({ type: actionType, limit }).catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const candidates = [];
  logs.entries.forEach((item?) => {
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > windowMs) return;

    let score = 1;
    if (typeof matcher === "function") {
      const result = matcher(item);
      if (!result) return;
      if (typeof result === "number" && Number.isFinite(result)) score += result;
      else score += 3;
    }

    score += Math.max(0, windowMs - (now - created)) / windowMs;
    candidates.push({ item, score, created });
  });

  candidates.sort((a?, b?) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.created - a.created;
  });
  return candidates[0]?.item || null;
}

function formatResponsible(executor?) {
  if (!executor) return "sconosciuto";
  const flags = [];
  if (executor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${executor}${suffix} \`${executor.id}\``;
}

function nowDiscordTs() {
  return `<t:${Math.floor(Date.now() / 1000)}:F>`;
}

function formatDurationForModLog(ms?) {
  if (!ms || ms <= 0) return "N/A";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function buildStaffActionModLogEmbed(modCase?, options: Record<string, any> = {}) {
  const actionLabel = options.actionLabel || String(modCase.action || "Unknown").toLowerCase().replace(/^\w/, (c?) => c.toUpperCase());
  const moderatorId = options.moderatorId != null ? options.moderatorId : modCase.modId;
  const reasonText = options.reasonOverride !== undefined ? (options.reasonOverride && String(options.reasonOverride).slice(0, 1024)) || "No reason given." : (modCase.reason && String(modCase.reason).slice(0, 1024)) || "No reason given.";
  const embed = new EmbedBuilder().setColor("#57F287").setTitle(`Case ${modCase.caseId} · ${actionLabel} · ${options.targetUsername != null ? options.targetUsername : modCase.userId}`,
  );
  const hasDuration = Number.isFinite(modCase.durationMs) && modCase.durationMs > 0;
  const fields = [{ name: "<:member_role_icon:1330530086792728618> User", value: `<@${modCase.userId}>`, inline: true },
  { name: "<:VC_Staff:1494286904089247754> Moderator", value: `<@${moderatorId}>`, inline: true },
  ];
  if (hasDuration) {
    fields.push({
      name: "<:VC_Clock:1473359204189474886> Duration",
      value: formatDurationForModLog(modCase.durationMs),
      inline: true,
    });
    fields.push({ name: "<:VC_reason:1478517122929004544> Reason", value: reasonText, inline: false });
  } else {
    fields.push({ name: "<:VC_reason:1478517122929004544> Reason", value: reasonText, inline: true });
  }
  embed.addFields(...fields.slice(0, 25));
  const sanctionDate = modCase.createdAt ? new Date(modCase.createdAt) : new Date();
  embed.setTimestamp(sanctionDate.getTime());
  const footerTs = sanctionDate.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, });
  embed.setFooter({ text: `ID: ${modCase.userId} • ${footerTs}` });
  if (Array.isArray(options.extraFields) && options.extraFields.length) {
    const currentCount = embed.data?.fields?.length ?? 0;
    const remaining = Math.max(0, 25 - currentCount);
    options.extraFields.slice(0, remaining).forEach((f?) => embed.addFields(f));
  }
  return embed;
}

async function sendStaffActionToModLogs(guild?, modCase?, options: Record<string, any> = {}) {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) {
    const configuredId = resolveModLogChannelId(guild?.id);
    if (!configuredId) {
      global.logger?.warn?.("[modLogs] canale non configurato per guild:", guild?.id);
    }
    return;
  }
  let targetUsername = options.targetUsername;
  if (targetUsername == null && guild?.client?.users && modCase.userId) {
    const user = await guild.client.users.fetch(String(modCase.userId)).catch(() => null);
    targetUsername = user?.username || modCase.userId;
  }
  const embed = buildStaffActionModLogEmbed(modCase, { ...options, targetUsername: targetUsername ?? modCase.userId, });
  await channel.send({ embeds: [embed] }).catch((err?) => logModLogSendFailure(guild, channel, err, "staff_action"));
}

async function sendModCommandUsageToModLogs(guild?, message?, commandName?) {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.() || !message?.author) {
    if (message?.author && !resolveModLogChannelId(guild?.id)) {
      global.logger?.warn?.("[modLogs] uso comando senza canale log:", guild?.id, commandName);
    }
    return;
  }
  const auditCh = message.invokeChannel || message.channel;
  const channelLabel = auditCh?.name ? `# ${auditCh.name}` : "# canale";
  const fullCommand = String(message.content || "").trim() || `+${commandName}`;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timestamp = `${day}/${month}/${year} ${hours}:${minutes}`;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({
      name: accountUsername(message.member || message.author),
      iconURL: guildMemberDisplayAvatarUrlDynamic(message.member || message.author, { size: 32 }) || undefined,
    })
    .setDescription(`Used \`${commandName}\` command in ${channelLabel}\n\n\`${fullCommand}\``)
    .setFooter({ text: timestamp });
  await channel.send({ embeds: [embed] }).catch((err?) => logModLogSendFailure(guild, channel, err, "command_usage"));
}

export = { resolveModLogChannel, logModLogSendFailure, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, formatDurationForModLog, buildStaffActionModLogEmbed, sendStaffActionToModLogs, sendModCommandUsageToModLogs };