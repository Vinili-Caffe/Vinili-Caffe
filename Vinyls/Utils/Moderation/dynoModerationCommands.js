const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../Config/ids");
const {
  resolveCaseByGuildCaseId,
  resolveCaseByContextMessageId,
  appendCaseEditStore,
  setCaseReasonStore,
  setCaseDurationStore,
  findActiveModerations,
  countModLogsForUser,
  findModLogsPage,
  findOpenCases,
  findActiveWarns,
} = require("./modCaseStore");
const { appendCaseEdit, closeCasePersist, createModCase, getModConfig, logModCase, parseDuration, formatDuration } = require("./moderation");
const { resolveTarget } = require("./prefixModeration");
const { resolveModLogChannel, sendStaffActionToModLogs, sendModCommandUsageToModLogs } = require("../Logging/modAuditLogUtils");
const { sendDm } = require("../noDmList");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { buildUnbanRequestRow } = require("./unbanRequestButton");

function embed(client, title, description, color = null) {
  return new EmbedBuilder()
    .setColor(color || client?.config?.embedModLight || "#6f4e37")
    .setTitle(title != null ? String(title).slice(0, 256) : "")
    .setDescription(description != null ? String(description).slice(0, 4096) : "");
}

function reasonFrom(args, start = 0, fallback = "Nessun motivo fornito") {
  const value = String(args.slice(start).join(" ") || "").trim();
  return value ? value.slice(0, 512) : fallback;
}

async function reply(message, client, title, description, color = null) {
  return message.channel
    .send({ embeds: [embed(client, title, description, color)] })
    .catch(() => null);
}

function successText(subject, verb, reason) {
  const safeSubject = String(subject || "unknown").trim();
  const safeVerb = String(verb || "was updated").trim();
  const left = `<:success:1461731530333229226> ***${safeSubject} ${safeVerb}.***`;
  if (!reason) return left;
  return `${left} • ${String(reason).trim()}`;
}

function formatTargetLabel(target) {
  const id = String(target?.id || target || "").trim();
  const username = String(target?.username || "").trim();
  if (username) return username.toLowerCase();
  if (/^\d{17,20}$/.test(id)) return id;
  return id || "sconosciuto";
}

function isServerOwner(member, guild) {
  return Boolean(member && guild && String(member.id) === String(guild.ownerId));
}

async function validateModerationTarget(message, member, actionLabel, targetUserId = "") {
  let targetMember = member || null;
  const fallbackId = String(targetUserId || targetMember?.id || "").trim();
  if (!targetMember && /^\d{17,20}$/.test(fallbackId)) {
    targetMember = await message.guild.members.fetch(fallbackId).catch(() => null);
  }
  if (!targetMember) return { ok: true };
  if (String(targetMember.id) === String(message.author.id)) {
    return { ok: false, error: `<:VC_Lock:1482526739044368476> Non puoi usare \`${actionLabel}\` su te stesso.` };
  }
  if (String(targetMember.id) === String(message.client.user.id)) {
    return { ok: false, error: "<:VC_Lock:1482526739044368476> Non puoi moderare il bot." };
  }
  if (isServerOwner(targetMember, message.guild)) {
    return { ok: false, error: "<:VC_Lock:1482526739044368476> Non puoi moderare il proprietario del server." };
  }
  const actorMember = message.member;
  if (actorMember?.roles?.highest != null && targetMember.roles?.highest != null) {
    if (targetMember.roles.highest.position >= actorMember.roles.highest.position) {
      return {
        ok: false,
        error: "<:VC_Lock:1482526739044368476> Non puoi moderare un utente con ruolo superiore o uguale al tuo.",
      };
    }
  }
  const protectedRoleIds = [
    IDs?.roles?.Staff,
    IDs?.roles?.Helper,
    IDs?.roles?.Mod,
    IDs?.roles?.SeniorModerator,
    IDs?.roles?.HighStaff,
    IDs?.roles?.Director,
    IDs?.roles?.Admin,
    IDs?.roles?.Founder,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const actorHighStaffBypass = [IDs?.roles?.HighStaff, IDs?.roles?.Director, IDs?.roles?.Admin, IDs?.roles?.Founder,].map((id) => String(id || "").trim()).filter(Boolean).some((roleId) => message.member?.roles?.cache?.has(roleId));
  const targetHasStaffRole = String(IDs?.roles?.Staff || "").trim() && targetMember.roles?.cache?.has(String(IDs?.roles?.Staff || "").trim());
  const targetHasCoreProtectedRole = [IDs?.roles?.HighStaff, IDs?.roles?.Director, IDs?.roles?.Admin, IDs?.roles?.Founder,].map((id) => String(id || "").trim()).filter(Boolean).some((roleId) => targetMember.roles?.cache?.has(roleId));

  if (
    actorHighStaffBypass &&
    targetHasStaffRole &&
    !targetHasCoreProtectedRole
  ) {
    return { ok: true };
  }

  if (protectedRoleIds.some((roleId) => targetMember.roles?.cache?.has(roleId))) {
    return {
      ok: false,
      error: "<:VC_Lock:1482526739044368476> Non puoi moderare un utente con ruolo Staff o superiore.",
    };
  }
  return { ok: true };
}

async function successReply(message, subject, verb, reason = "") {
  const description = successText(subject, verb, String(reason || "").trim());
  return message.channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#57F287")
          .setDescription(description),
      ],
    })
    .catch(() => null);
}

async function sendModerationDm({ user, guildId, guildName, action, reason = "", durationText = "" }) {
  if (!user) return false;
  const safeReason = String(reason || "").trim();
  const safeDuration = String(durationText || "").trim();
  const actionKey = String(action || "").toLowerCase();
  const withReason = safeReason ? ` | ${safeReason}` : "";
  let baseText = "";
  if (actionKey === "warn") {
    baseText = `<:VC_Alert:1468544520673007626> Hai ricevuto un avviso in ${guildName}.${withReason}`;
  } else if (actionKey === "ban") {
    baseText = `<:VC_Alert:1468544520673007626> Sei stato bannato da ${guildName}.${withReason}`;
  } else if (actionKey === "kick") {
    baseText = `<:VC_Alert:1468544520673007626> Sei stato espulso da ${guildName}.${withReason}`;
  } else if (actionKey === "mute") {
    const durationPart = safeDuration ? ` per ${safeDuration}` : "";
    baseText = `<:VC_Alert:1468544520673007626> Sei stato silenziato in ${guildName}${durationPart}.${withReason}`;
  } else if (actionKey === "unban") {
    baseText = `<:VC_Alert:1468544520673007626> Il tuo ban in ${guildName} è stato revocato.${withReason}`;
  } else if (actionKey === "unmute") {
    baseText = `<:VC_Alert:1468544520673007626> Il tuo mute in ${guildName} è stato revocato.${withReason}`;
  } else if (actionKey === "delwarn") {
    baseText = `<:VC_Alert:1468544520673007626> Un avviso ti è stato rimosso in ${guildName}.${withReason}`;
  } else if (actionKey === "clearwarn") {
    baseText = `<:VC_Alert:1468544520673007626> Tutti i tuoi avvisi sono stati rimossi in ${guildName}.${withReason}`;
  } else {
    return false;
  }

  const embed = new EmbedBuilder().setColor("#ED4245").setDescription(baseText);
  let components = undefined;
  if (actionKey === "ban") {
    components = [buildUnbanRequestRow()];
  } else if (actionKey === "unban") {
    const rawInvite = String(IDs?.links?.invite || "").trim();
    const inviteUrl = /^https?:\/\//i.test(rawInvite) ? rawInvite : rawInvite ? `https://${rawInvite.replace(/^\/+/, "")}` : "";
    if (inviteUrl) {
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Rientra nel server")
            .setEmoji(`<:link:1470064815899803668>`)
            .setURL(inviteUrl),
        ),
      ];
    }
  }
  const sent = await sendDm(user, { embeds: [embed], components }, { guildId, bypassNoDm: true },);
  return Boolean(sent);
}

async function makeCase(client, message, action, userId, reason, durationMs = null) {
  const config = await getModConfig(message.guild.id);
  const contextChannelId = message.invokeChannel?.id || message.channel?.id;
  const { doc, created } = await createModCase({
    guildId: message.guild.id,
    action,
    userId: String(userId),
    modId: message.author.id,
    reason,
    durationMs,
    context: { channelId: contextChannelId, messageId: message.id },
    dedupe: { enabled: true, byMessageId: true, matchReason: false },
  });
  if (created && doc) {
    await logModCase({ client, guild: message.guild, modCase: doc, config });
  }
  return doc;
}

async function pickUser(message, args, index = 0) {
  const target = await resolveTarget(message, args, index);
  return {
    user: target?.user || null,
    member: target?.member || null,
    userId: target?.userId || null,
  };
}

function parseMaybeDuration(raw) {
  const ms = parseDuration(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function parseDynoMuteDuration(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const minutes = Number.parseInt(token, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return minutes * 60 * 1000;
  }
  if (/^\d+s$/.test(token)) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

function formatRemainingWords(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} giorno${days === 1 ? "" : "i"}`);
  if (hours > 0) parts.push(`${hours} ora${hours === 1 ? "" : "e"}`);
  if (minutes > 0) parts.push(`${minutes} minuto${minutes === 1 ? "" : "i"}`);
  if (seconds > 0 || !parts.length) parts.push(`${seconds} secondo${seconds === 1 ? "" : "i"}`);
  return parts.join(", ");
}

function formatDurationWords(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (!total) return null;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} giorno ${days === 1 ? "" : "i"}`);
  if (hours > 0) parts.push(`${hours} ora ${hours === 1 ? "" : "e"}`);
  if (minutes > 0) parts.push(`${minutes} minuto ${minutes === 1 ? "" : "i"}`);
  if (seconds > 0 && !parts.length) parts.push(`${seconds} secondo ${seconds === 1 ? "" : "i"}`);
  return parts.join(", ");
}

function formatDynoDate(value) {
  if (!value) return "Data sconosciuta";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Data sconosciuta";
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, }).format(dt);
  return formatted.replace(",", "").replace(",", "");
}

async function resolveRoleFlexible(message, raw) {
  const mentionRole = message.mentions?.roles?.first();
  if (mentionRole) return mentionRole;
  const token = String(raw || "").replace(/[<@&>]/g, "").trim();
  if (/^\d{17,20}$/.test(token)) {
    return (
      message.guild.roles.cache.get(token) ||
      (await message.guild.roles.fetch(token).catch(() => null))
    );
  }
  const byName = message.guild.roles.cache.find((role) => String(role.name || "").toLowerCase() === String(raw || "").toLowerCase(),);
  if (byName) return byName;
  return null;
}

function parseLockDuration(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

function normalizeLookupToken(raw) {
  return String(raw || "").trim().replace(/^@+/, "").toLowerCase();
}

function matchesBanUserToken(user, token) {
  if (!user || !token) return false;
  const username = String(user.username || "").toLowerCase();
  const globalName = String(user.globalName || "").toLowerCase();
  const tag = String(user.tag || "").toLowerCase();
  return (
    username === token ||
    globalName === token ||
    tag === token
  );
}

async function resolveBanTarget(message, raw) {
  const token = String(raw || "").trim();
  if (!token) return { userId: null, banInfo: null };
  const idLike = token.replace(/[<@!>]/g, "").trim();
  if (/^\d{17,20}$/.test(idLike)) {
    const banInfoById = await message.guild.bans.fetch(idLike).catch(() => null);
    return { userId: idLike, banInfo: banInfoById };
  }

  const lookup = normalizeLookupToken(token);
  if (!lookup) return { userId: null, banInfo: null };
  const bans = await message.guild.bans.fetch().catch(() => null);
  if (!bans?.size) return { userId: null, banInfo: null };
  const banInfo = bans.find((entry) => matchesBanUserToken(entry?.user, lookup)) || null;
  return { userId: banInfo?.user?.id || null, banInfo };
}

function parseModerationCaseUpdatePayload(commandName, args) {
  const cmd = String(commandName || "").toLowerCase();
  if (cmd === "ban") {
    const mode = String(args[0] || "").toLowerCase();
    const hasMode = mode === "save" || mode === "noappeal";
    const targetIndex = hasMode ? 1 : 0;
    const duration = parseMaybeDuration(args[targetIndex + 1]);
    const reason = reasonFrom(args, duration ? targetIndex + 2 : targetIndex + 1, "");
    return { action: "BAN", reason, durationMs: duration || null };
  }
  if (cmd === "kick") {
    return { action: "KICK", reason: reasonFrom(args, 1, ""), durationMs: null };
  }
  if (cmd === "mute") {
    return { action: "MUTE", reason: reasonFrom(args, 2, ""), durationMs: parseDynoMuteDuration(args[1]) || null };
  }
  if (cmd === "unmute") {
    return { action: "UNMUTE", reason: reasonFrom(args, 1), durationMs: null };
  }
  if (cmd === "unban") {
    return { action: "UNBAN", reason: reasonFrom(args, 1), durationMs: null };
  }
  if (cmd === "warn") {
    const reason = String(args.slice(1).join(" ") || "").trim().slice(0, 512);
    return { action: "WARN", reason, durationMs: null };
  }
  if (cmd === "lock" || cmd === "unlock") {
    const hasChannelMention = /^\s*<#\d{17,20}>\s*$/.test(String(args[0] || ""));
    const start = hasChannelMention || /^\d{17,20}$/.test(String(args[0] || "").replace(/[<#>]/g, "")) ? 1 : 0;
    const duration = cmd === "lock" ? parseLockDuration(args[start]) : null;
    const reasonStart = cmd === "lock" && duration ? start + 1 : start;
    const reason = reasonFrom(args, reasonStart, cmd === "lock" ? "Canale bloccato." : "Canale sbloccato.");
    return { action: cmd.toUpperCase(), reason, durationMs: duration || null };
  }
  return null;
}

async function updateCaseFromEditedModerationCommand(commandName, message, args) {
  const resolved = await resolveCaseByContextMessageId(message.guild.id, message.id);
  if (!resolved?.row) return false;
  const row = resolved.row;
  const payload = parseModerationCaseUpdatePayload(commandName, Array.isArray(args) ? args : []);
  if (!payload) return false;

  const refGuildId = String(resolved.guildId || message.guild.id);
  const refUserId = String(resolved.userId || row.userId || "");
  const caseId = Number(row.caseId);
  const editedBy = message.author?.id || null;
  const nextReason = String(payload.reason || "").trim() || "Nessun motivo fornito";
  const prevReason = row.reason;

  if (String(prevReason || "") !== nextReason) {
    await appendCaseEditStore(refGuildId, refUserId, caseId, "reason", prevReason, nextReason, editedBy);
    await setCaseReasonStore(refGuildId, refUserId, caseId, nextReason);
    appendCaseEdit(row, "reason", prevReason, nextReason, editedBy);
    row.reason = nextReason;
  }

  const action = String(row.action || payload.action || "").toUpperCase();
  if (["BAN", "MUTE", "LOCK"].includes(action)) {
    const prevDuration = row.durationMs == null ? null : Number(row.durationMs);
    const nextDuration = payload.durationMs == null ? null : Number(payload.durationMs);
    if ((prevDuration || null) !== (nextDuration || null)) {
      const expiresAt = nextDuration ? new Date(Date.now() + nextDuration) : null;
      await appendCaseEditStore(refGuildId, refUserId, caseId, "durationMs", prevDuration == null ? "" : prevDuration, nextDuration == null ? "" : nextDuration, editedBy);
      await setCaseDurationStore(refGuildId, refUserId, caseId, nextDuration, expiresAt);
      appendCaseEdit(row, "durationMs", prevDuration == null ? "" : prevDuration, nextDuration == null ? "" : nextDuration, editedBy);
      row.durationMs = nextDuration;
      row.expiresAt = expiresAt;
    }
  }

  await sendStaffActionToModLogs(message.guild, row, {
    actionLabel: "Case Updated From Edited Command",
    moderatorId: editedBy,
    reasonOverride: row.reason,
    extraFields: [{ name: "Comando", value: `+${String(commandName || "").toLowerCase()}`, inline: true }],
  }).catch(() => null);
  await successReply(message, `case #${caseId}`, "was updated from the edited command");
  return true;
}

async function runNamed(name, message, args, client) {
  const cmd = String(name || "").toLowerCase();

  if (cmd === "ban") {
    const mode = String(args[0] || "").toLowerCase();
    const hasMode = mode === "save" || mode === "noappeal";
    const targetIndex = hasMode ? 1 : 0;
    const { user, member, userId } = await pickUser(message, args, targetIndex);
    if (!userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +ban**", "", "**Descrizione:** Banna un utente, con durata opzionale.", "**Cooldown:** 3 secondi", "**Uso:**", "+ban [utente] [durata] [motivo]", "+ban save [utente] [durata] [motivo]", "+ban noappeal [utente] [durata] [motivo]", "**Esempio:**", "+ban @utente 2d Spam", "", ""].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "ban", userId);
    if (!guard.ok) return reply(message, client, "Ban", guard.error, "Red");
    const duration = parseMaybeDuration(args[targetIndex + 1]);
    const reason = reasonFrom(args, duration ? targetIndex + 2 : targetIndex + 1, "");
    if (!reason || !reason.trim()) {
      return reply(message, client, "Ban", "<:VC_Lock:1482526739044368476> Il motivo è obbligatorio per il ban. Uso: `+ban [utente] [durata] [motivo]`", "Red");
    }
    const deleteSeconds = mode === "save" ? 0 : 604800;
    const ok = await message.guild.members.ban(userId, { reason, deleteMessageSeconds: deleteSeconds }).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Ban", "<:VC_Lock:1482526739044368476> Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "ban",
      reason,
    });
    await makeCase(client, message, "BAN", userId, reason, duration);
    return successReply(message, formatTargetLabel(user || { id: userId }), "was banned", reason);
  }

  if (cmd === "kick") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +kick**", "", "**Descrizione:** Espelle un utente dal server.", "**Cooldown:** 3 secondi", "**Uso:**", "+kick [utente] [motivo]", "**Esempio:**", "+kick @utente Regolamento non rispettato"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "kick", userId);
    if (!guard.ok) return reply(message, client, "Kick", guard.error, "Red");
    const reason = reasonFrom(args, 1, "");
    if (!reason || !reason.trim()) {
      return reply(message, client, "Kick", "<:VC_Lock:1482526739044368476> Il motivo è obbligatorio per il kick. Uso: `+kick [utente] [motivo]`", "Red");
    }
    const ok = await member.kick(reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Kick", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "kick",
      reason,
    });
    await makeCase(client, message, "KICK", userId, reason);
    return successReply(message, formatTargetLabel(member.user || { id: userId }), "was kicked", reason);
  }

  if (cmd === "mute") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +mute**", "", "**Descrizione:** Silenzia un utente per un tempo definito.", "**Cooldown:** 3 secondi", "**Uso:**", "+mute [utente] [durata] [motivo]", "**Esempio:**", "+mute @utente 10m Spam", "+mute @utente 1d Flood", "", ""].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "mute", userId);
    if (!guard.ok) return reply(message, client, "Mute", guard.error, "Red");
    const durationRaw = String(args[1] || "").trim();
    if (!durationRaw) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Devi specificare una durata per il mute."),
          ],
        })
        .catch(() => null);
    }
    const duration = parseDynoMuteDuration(durationRaw);
    const maxMuteMs = 14 * 24 * 60 * 60 * 1000;
    if (!duration || duration > maxMuteMs) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(
                "<:cancel:1461730653677551691> Usa una durata valida inferiore a 14 giorni (esempio: 3m, 2h, 1d).",
              ),
          ],
        })
        .catch(() => null);
    }
    const reason = reasonFrom(args, 2, "");
    if (!reason || !reason.trim()) {
      return reply(message, client, "Mute", "Il motivo è obbligatorio per il mute. Uso: `+mute [utente] [durata] [motivo]`", "Red");
    }
    const ok = await member.timeout(duration, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Mute", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "mute",
      reason,
      durationText: formatDuration(duration),
    });
    await makeCase(client, message, "MUTE", userId, reason, duration);
    return successReply(message, formatTargetLabel(member.user || { id: userId }), "was muted", reason);
  }

  if (cmd === "unmute") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) return reply(message, client, "Unmute", "Uso: `+unmute @utente [motivo]`.", "Red");
    const guard = await validateModerationTarget(message, member, "unmute", userId);
    if (!guard.ok) return reply(message, client, "Unmute", guard.error, "Red");
    const reason = reasonFrom(args, 1);
    const ok = await member.timeout(null, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Unmute", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "unmute",
      reason,
    });
    const openMutes = await findOpenCases(message.guild.id, userId, "MUTE");
    for (const item of openMutes) {
      await closeCasePersist(item, `Unmute manuale da ${message.author.id}`);
    }
    await makeCase(client, message, "UNMUTE", userId, reason);
    return successReply(message, formatTargetLabel(member.user || { id: userId }), "was unmuted", reason);
  }

  if (cmd === "unban") {
    const raw = String(args[0] || "").trim();
    if (!raw) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +unban**", "", "**Descrizione:** Revoca il ban di un utente.", "**Cooldown:** 5 secondi", "**Uso:**", "+unban [utente] (motivo opzionale)", "**Esempio:**", "+unban 155037590859284481 Appello accettato", "+unban @username Appello accettato", "+unban username Appello accettato"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const { userId: id, banInfo: resolvedBanInfo } = await resolveBanTarget(message, raw);
    if (!id) return reply(message, client, "Unban", "<:VC_Lock:1482526739044368476> Utente bannato non trovato (usa tag, ID o username).", "Red");
    const reason = reasonFrom(args, 1);
    const banInfo = resolvedBanInfo || (await message.guild.bans.fetch(id).catch(() => null));
    const ok = await message.guild.bans.remove(id, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Unban", "Operazione fallita.", "Red");
    const targetUser = banInfo?.user || (await message.client.users.fetch(id).catch(() => null));
    await sendModerationDm({
      user: targetUser,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "unban",
      reason,
    });
    const openBans = await findOpenCases(message.guild.id, id, "BAN");
    for (const item of openBans) {
      await closeCasePersist(item, `Unban manuale da ${message.author.id}`);
    }
    await makeCase(client, message, "UNBAN", id, reason);
    const subject = formatTargetLabel(banInfo?.user || { id });
    return successReply(message, subject, "was unbanned");
  }

  if (cmd === "warn") {
    const { user, userId } = await pickUser(message, args, 0);
    if (!userId) return reply(message, client, "Warn", "Uso: `+warn @utente [testo]`.", "Red");
    if (String(userId) === String(message.author.id)) {
      return reply(message, client, "Warn", "<:VC_Lock:1482526739044368476> Non puoi usare `warn` su te stesso.", "Red");
    }
    const warnMember = message.guild.members.cache.get(String(userId)) || (await message.guild.members.fetch(String(userId)).catch(() => null));
    const guard = await validateModerationTarget(message, warnMember, "warn", userId);
    if (!guard.ok) return reply(message, client, "Warn", guard.error, "Red");
    const content = String(args.slice(1).join(" ") || "").trim();
    if (!content) {
      return reply(message, client, "Warn", "<:VC_Lock:1482526739044368476> Il motivo è obbligatorio per il warn. Uso: `+warn [utente] [motivo]`", "Red");
    }
    const reasonContent = content.slice(0, 512);
    await makeCase(client, message, "WARN", userId, reasonContent);
    await sendModerationDm({
      user,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "warn",
      reason: reasonContent,
    });
    const targetUser = await message.client.users.fetch(userId).catch(() => null);
    const label = formatTargetLabel(targetUser || { id: userId });
    return successReply(message, label, "was warned", reasonContent);
  }

  if (cmd === "warnings") {
    const { userId } = await pickUser(message, args, 0);
    if (!userId) return reply(message, client, cmd, `<:VC_Lock:1482526739044368476> Uso: \`+${cmd} @utente\`.`, "Red");
    const rows = await findActiveWarns(message.guild.id, userId, 20);
    if (!rows.length) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#3498DB")
              .setDescription("<:VC_Lock:1482526739044368476> Nessun warning attivo trovato."),
          ],
        })
        .catch(() => null);
    }
    const targetUser = (await message.client.users.fetch(userId).catch(() => null)) || null;
    const titleCount = rows.length === 1 ? "1 warning" : `${rows.length} warning`;
    const lines = [];
    for (const row of rows.slice(0, 10)) {
      let moderator = row.modId;
      if (/^\d{17,20}$/.test(String(row.modId || ""))) {
        const modUser = await message.client.users.fetch(String(row.modId)).catch(() => null);
        if (modUser?.username) moderator = modUser.username;
      }
      const when = row.createdAt ? `<t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>`
        : "data sconosciuta";
      lines.push(`<:VC_Staff:1494286904089247754> **Moderatore:** ${moderator}\n<:VC_reason:1478517122929004544> ${row.reason || "Nessun motivo"} - ${when}`);
    }
    const warningEmbed = new EmbedBuilder().setColor("#ED4245").setTitle(String(`${titleCount}per ${targetUser?.username || userId}(${userId})`).slice(0, 256))
      .setDescription(String(lines.join("\n\n")).slice(0, 4096))
      .setThumbnail(userAvatarUrlDynamic(typeof targetMember !== "undefined" && targetMember ? targetMember : targetUser, { size: 128 }) || null);
    return message.channel.send({ embeds: [warningEmbed] }).catch(() => null);
  }

  if (cmd === "delwarn") {
    const target = await pickUser(message, args, 0);
    const warningText = String(args.slice(1).join(" ") || "").trim();
    if (!target.userId || !warningText) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +delwarn**", "", "**Alias:** +nwarn", "**Descrizione:** Rimuove un warning.", "**Cooldown:** 3 secondi", "**Uso:**", "+delwarn [utente] [testo warning]", "**Esempio:**", "+delwarn @utente Flood in chat generale"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guardDelwarn = await validateModerationTarget(message, target.member, "delwarn", target.userId);
    if (!guardDelwarn.ok) return reply(message, client, "Delwarn", guardDelwarn.error, "Red");
    const rows = await findActiveWarns(message.guild.id, target.userId, 50);
    const needle = warningText.toLowerCase();
    const row = rows.find((r) => String(r.reason || "").toLowerCase() === needle) || rows.find((r) => String(r.reason || "").toLowerCase().includes(needle)) || null;
    if (!row) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Nessun warning trovato con quel testo."),
          ],
        })
        .catch(() => null);
    }
    await closeCasePersist(row, `Avviso rimosso da ${message.author.id}`);
    const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
    await sendModerationDm({
      user: targetUser,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "delwarn",
      reason: warningText,
    }).catch(() => null);
    const modLogChannel = await resolveModLogChannel(message.guild);
    if (modLogChannel?.isTextBased?.()) {
      const targetLabel = targetUser ? `${targetUser}` : `\`${target.userId}\``;
      const responsibleLabel = message.author?.bot ? `${message.author} [BOT] \`${message.author.id}\`` : `${message.author} \`${message.author.id}\``;
      const warnRemovedEmbed = new EmbedBuilder().setColor("#57F287").setTitle("Warning Removed").setDescription([
        `<:VC_BanHammer:1482534474502897795> **Warning for** ${targetLabel} **has been removed**`,
        `<:VC_Staff:1494286904089247754> **Responsible:** ${responsibleLabel}`,
        `<:VC_Clock:1473359204189474886> <t:${Math.floor(Date.now() / 1000)}:F>`,
        `<:VC_reason:1478517122929004544> **Warning text:** ${(warningText || "").slice(0, 200)}${(warningText || "").length > 200 ? "…" : ""}`,
      ].join("\n"),
      )
        .setFooter({ text: `ID: ${target.userId}` })
        .setTimestamp();
      await modLogChannel.send({ embeds: [warnRemovedEmbed] }).catch(() => null);
    }
    return successReply(
      message,
      formatTargetLabel(targetUser || { id: target.userId }),
      "had 1 warning removed",
      warningText,
    );
  }

  if (cmd === "clearwarn") {
    const target = await pickUser(message, args, 0);
    if (!target.userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +clearwarn**", "", "**Descrizione:** Rimuove tutti i warning attivi da un utente.", "**Uso:**", "+clearwarn [utente]", "**Esempio:**", "+clearwarn @utente"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guardClearwarn = await validateModerationTarget(message, target.member, "clearwarn", target.userId);
    if (!guardClearwarn.ok) return reply(message, client, "Clearwarn", guardClearwarn.error, "Red");
    const rows = await findActiveWarns(message.guild.id, target.userId, 5000);
    if (!rows.length) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Nessun warning attivo trovato per questo utente."),
          ],
        })
        .catch(() => null);
    }
    const closeReason = `Warning azzerati da ${message.author.id}`;
    for (const row of rows) {
      await closeCasePersist(row, closeReason);
    }
    const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
    await sendModerationDm({
      user: targetUser,
      guildId: message.guild.id,
      guildName: message.guild.name,
      action: "clearwarn",
      reason: closeReason,
    }).catch(() => null);
    const modLogChannel = await resolveModLogChannel(message.guild);
    if (modLogChannel?.isTextBased?.()) {
      const targetLabel = targetUser ? `${targetUser}` : `\`${target.userId}\``;
      const responsibleLabel = message.author?.bot ? `${message.author} [BOT] \`${message.author.id}\`` : `${message.author} \`${message.author.id}\``;
      const clearWarnEmbed = new EmbedBuilder().setColor("#57F287").setTitle("Warning Cleared").setDescription([
        `<a:VC_Alert:1482706673176150077> **Tutti i warning per** ${targetLabel} **sono stati rimossi** (${rows.length} ${rows.length === 1 ? "avviso" : "avvisi"})`,
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleLabel}`,
        `<:VC_Clock:1473359204189474886> <t:${Math.floor(Date.now() / 1000)}:F>`,
      ].join("\n"),
      )
        .setFooter({ text: `ID: ${target.userId}` })
        .setTimestamp();
      await modLogChannel.send({ embeds: [clearWarnEmbed] }).catch(() => null);
    }
    return successReply(
      message,
      formatTargetLabel(targetUser || { id: target.userId }),
      rows.length === 1 ? "had 1 warning removed" : `had ${rows.length} warnings removed`,
    );
  }

  if (cmd === "case" || cmd === "reason" || cmd === "duration") {
    const caseId = Number.parseInt(args[0], 10);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      if (cmd === "case") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            ["**Comando: +case**", "", "**Descrizione:** Mostra un caso moderazione specifico.", "**Cooldown:** 3 secondi", "**Uso:**", "+case [id caso]", "**Esempio:**", "+case 1234"].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      if (cmd === "reason") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            ["**Comando: +reason**", "", "**Descrizione:** Imposta o aggiorna il motivo di un caso moderazione.", "**Cooldown:** 3 secondi", "**Uso:**", "+reason [case num] [reason]", "**Esempio:**", "+reason 5 Spam in immagini non appropriate"].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      if (cmd === "duration") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            ["**Comando: +duration**", "", "**Descrizione:** Modifica la durata di un mute/ban.", "**Cooldown:** 60 secondi", "**Uso:**", "+duration [modlog ID] [limit]", "**Esempio:**", "+duration 69 420m"].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      return reply(message, client, cmd, `Uso: \`+${cmd} <case> [...]\`.`, "Red");
    }
    const resolved = await resolveCaseByGuildCaseId(message.guild.id, caseId);
    if (!resolved?.row) return reply(message, client, cmd, "Caso non trovato.", "Red");
    const row = resolved.row;
    const refGuildId = String(resolved.guildId || message.guild.id);
    const refUserId = String(resolved.userId || row.userId || "");
    if (cmd === "case") {
      const targetUser = await message.client.users.fetch(String(row.userId || "")).catch(() => null);
      const modUser = await message.client.users.fetch(String(row.modId || "")).catch(() => null);
      const action = String(row.action || "Sconosciuto").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
      const hh = new Date(row.createdAt || Date.now()).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, });
      const caseEmbed = new EmbedBuilder().setColor("#FEE75C").setTitle(`Case ${caseId} · ${action} · ${targetUser?.username || row.userId}`)
        .addFields(
          { name: "<:member_role_icon:1330530086792728618> Utente", value: targetUser?.username || String(row.userId || "Sconosciuto"), inline: true },
          { name: "<:VC_Staff:1494286904089247754> Moderatore", value: modUser ? `<@${modUser.id}>` : String(row.modId || "Sconosciuto"), inline: true },
          { name: "<:VC_reason:1478517122929004544> Motivo", value: row.reason || "Nessun motivo fornito", inline: true },
        )
        .setFooter({
          text: `ID: ${row.userId} • Oggi alle ${hh}${Array.isArray(row.edits) && row.edits.length ? ` | Modificato ${row.edits.length} volta/e` : ""}`,
        });
      return message.channel.send({ embeds: [caseEmbed] }).catch(() => null);
    }
    if (cmd === "reason") {
      const rawReason = String(args.slice(1).join(" ") || "").trim();
      if (!rawReason) {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            ["**Comando: +reason**", "", "**Descrizione:** Imposta o aggiorna il motivo di un caso moderazione.", "**Cooldown:** 3 secondi", "**Uso:**", "+reason [case num] [reason]", "**Esempio:**", "+reason 5 Spam in immagini non appropriate"].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      const nextReason = reasonFrom(args, 1);
      const prevReason = row.reason;
      await appendCaseEditStore(refGuildId, refUserId, caseId, "reason", prevReason, nextReason, message.author.id);
      await setCaseReasonStore(refGuildId, refUserId, caseId, nextReason);
      appendCaseEdit(row, "reason", prevReason, nextReason, message.author.id);
      row.reason = nextReason;
      await sendStaffActionToModLogs(message.guild, row, {
        actionLabel: "Reason Updated",
        moderatorId: message.author.id,
        reasonOverride: nextReason,
      }).catch(() => null);
      return successReply(message, `case #${caseId}`, "reason was updated");
    }
    if (!String(args[1] || "").trim()) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +duration**", "", "**Descrizione:** Modifica la durata di un mute/ban.", "**Cooldown:** 60 secondi", "**Uso:**", "+duration [modlog ID] [limit]", "**Esempio:**", "+duration 69 420m"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    if (!["MUTE", "BAN"].includes(String(row.action || "").toUpperCase())) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> La durata può essere modificata solo per casi mute/ban."),
          ],
        })
        .catch(() => null);
    }
    const duration = parseDynoMuteDuration(args[1]) || parseMaybeDuration(args[1]);
    if (!duration) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(
                "<:cancel:1461730653677551691> Usa una durata valida inferiore a 14 giorni (esempio: 3m, 2h, 1d).",
              ),
          ],
        })
        .catch(() => null);
    }
    const expiresAt = new Date(Date.now() + duration);
    await appendCaseEditStore(
      refGuildId,
      refUserId,
      caseId,
      "durationMs",
      row.durationMs == null ? "" : row.durationMs,
      duration,
      message.author.id,
    );
    await setCaseDurationStore(refGuildId, refUserId, caseId, duration, expiresAt);
    appendCaseEdit(
      row,
      "durationMs",
      row.durationMs == null ? "" : row.durationMs,
      duration,
      message.author.id,
    );
    row.durationMs = duration;
    row.expiresAt = expiresAt;
    row.active = true;
    await sendStaffActionToModLogs(message.guild, row, {
      actionLabel: "Duration Updated",
      moderatorId: message.author.id,
      extraFields: [{ name: "New duration", value: formatDuration(row.durationMs), inline: true }],
    }).catch(() => null);
    if (String(row.action || "").toUpperCase() === "MUTE") {
      const member = await message.guild.members.fetch(String(row.userId || "")).catch(() => null);
      if (member) {
        await member.timeout(duration, `Caso #${caseId} aggiornato`).catch(() => null);
      }
    }
    return successReply(message, `case #${caseId}`, "duration was updated");
  }

  if (cmd === "modlogs" || cmd === "moderations") {
    const target = await pickUser(message, args, 0);
    if (cmd === "moderations") {
      const limit = target.userId ? 10 : 25;
      const rows = await findActiveModerations(message.guild.id, target.userId || null, limit);
      if (!rows.length) {
        const msg = target.userId ? "<:cancel:1461730653677551691> Non ci sono moderazioni attive per questo utente." : "<:cancel:1461730653677551691> Non ci sono moderazioni attive al momento.";
        return message.channel
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor("#3498DB")
                .setDescription(`<:VC_InactiveStatus:1482526984234860574> **${msg}**`),
            ],
          })
          .catch(() => null);
      }
      const now = Date.now();
      const singleUserId = target.userId ? String(target.userId).trim() : null;
      const singleUsername = singleUserId ? (message.client.users.cache.get(singleUserId) || (await message.client.users.fetch(singleUserId).catch(() => null)))?.username?.toLowerCase() || singleUserId : null;
      const lines = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const type = String(row.action || "").toUpperCase() === "MUTE" ? "Mute" : "Ban";
        const expiresAt = new Date(row.expiresAt || Date.now()).getTime();
        const remaining = formatRemainingWords(expiresAt - now);
        let username = singleUsername;
        if (username == null) {
          const uid = String(row.userId || "").trim();
          const u = uid ? (message.client.users.cache.get(uid) || (await message.client.users.fetch(uid).catch(() => null))) : null;
          username = u?.username?.toLowerCase() ?? uid ?? "sconosciuto";
        }
        lines.push(`${i + 1}. **${username}**\n${type} | Tempo rimanente: ${remaining}`);
      }
      const title = singleUserId ? `Moderazioni attive per ${singleUsername || singleUserId}`
        : "Moderazioni attive";
      const activeEmbed = new EmbedBuilder().setColor("#3498DB").setTitle(title).setDescription(lines.join("\n\n")).setFooter({
        text: rows.length === 1 ? "1 moderazione attiva" : `${rows.length}moderazioni attive`,
      });
      return message.channel.send({ embeds: [activeEmbed] }).catch(() => null);
    }

    if (!target.userId) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }

    const rawPage = Number.parseInt(args[1], 10);
    const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const perPage = 6;
    const total = await countModLogsForUser(message.guild.id, target.userId);
    if (total <= 0) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }

    const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(requestedPage, totalPages);
    const skip = (safePage - 1) * perPage;
    const rows = await findModLogsPage(message.guild.id, target.userId, skip, perPage);
    if (!rows.length) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }
    const lines = [];
    for (const row of rows) {
      const modUser = await message.client.users.fetch(String(row.modId || "")).catch(() => null);
      const type = String(row.action || "Sconosciuto").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
      const createdAt = formatDynoDate(row.createdAt);
      const length = formatDurationWords(row.durationMs);
      const blockLines = [
        `<:VC_id:1478517313618575419> **Case ${row.caseId}**`,
        `<:VC_InactiveStatus:1482526984234860574> **Tipo:** ${type}`,
        `<:member_role_icon:1330530086792728618> **Utente:** \`${target.userId}\` · ${targetUser?.username || "Sconosciuto"}`,
        `<:VC_Staff:1494286904089247754> **Moderatore:** ${modUser?.username || row.modId || "Sconosciuto"}`,
      ];
      if (length) blockLines.push(`<:VC_Clock:1473359204189474886> **Durata:** ${length}`);
      blockLines.push(`<:VC_reason:1478517122929004544> **Motivo:** ${row.reason || "Nessun motivo fornito."} - ${createdAt}`);
      lines.push(blockLines.join("\n"));
    }

    const logsEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle(String(`Modlog di ${targetUser?.username || target.userId} (Pagina ${safePage} di ${totalPages})`).slice(0, 256))
      .setDescription(String(lines.join("\n\n")).slice(0, 4096))
      .setFooter({ text: `${total} log totali | Usa +modlogs [utente] [pagina] per vedere un'altra pagina` });

    return message.channel.send({ embeds: [logsEmbed] }).catch(() => null);
  }

  if (cmd === "lock" || cmd === "unlock") {
    if (!args.length) {
      if (cmd === "lock") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            ["**Comando: +lock**", "", "**Descrizione:** Blocca un canale con timer e messaggio opzionali.", "**Cooldown:** 5 secondi", "**Uso:**", "+lock [canale] (durata) (messaggio)", "**Esempio:**", "+lock #general Torniamo subito", "+lock #support 2h Questo canale resterà bloccato per due ore.", "+lock #help 4h"].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          ["**Comando: +unlock**", "", "**Descrizione:** Sblocca un canale bloccato in precedenza.", "**Cooldown:** 5 secondi", "**Uso:**", "+unlock [canale] (messaggio)", "**Esempio:**", "+unlock #general", "+unlock #support Siamo tornati!"].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }

    const channel = message.mentions?.channels?.first() || message.guild.channels.cache.get(String(args[0] || "").replace(/[<#>]/g, "")) || message.channel;
    const start = message.mentions?.channels?.size ? 1 : 0;
    const duration = cmd === "lock" ? parseLockDuration(args[start]) : null;
    const reasonStart = cmd === "lock" && duration ? start + 1 : start;
    const reason = reasonFrom(args, reasonStart, cmd === "lock" ? "Canale bloccato." : "Canale sbloccato.");
    const me = message.guild.members.me;
    const perms = channel?.permissionsFor?.(me);
    if (!perms?.has(PermissionsBitField.Flags.ManageChannels)) return reply(message, client, cmd, "<:VC_Lock:1482526739044368476> Non posso gestire quel canale.", "Red");
    await channel.permissionOverwrites
      .edit(
        message.guild.roles.everyone,
        cmd === "lock"
          ? { SendMessages: false, SendMessagesInThreads: false }
          : { SendMessages: null, SendMessagesInThreads: null },
        { reason },
      )
      .catch(() => null);

    if (cmd === "lock") {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setTitle("<:VC_Lock:1482526739044368476> Canale bloccato")
              .setDescription(`<:VC_Lock:1482526739044368476> Lock: ${reason}`),
          ],
        })
        .catch(() => null);
      if (duration) {
        setTimeout(() => {
          channel.permissionOverwrites
            .edit(
              message.guild.roles.everyone,
              { SendMessages: null, SendMessagesInThreads: null },
              { reason: "<a:VC_Unlock:1482532082466029608> Sblocco automatico (timer scaduto)." },
            )
            .catch(() => null);
        }, duration);
      }
    }

    await makeCase(client, message, cmd.toUpperCase(), `CHANNEL:${channel.id}`, reason, duration || null);
    return successReply(
      message,
      `<#${channel.id}>`,
      cmd === "lock" ? "was locked" : "was unlocked",
    );
  }

  return reply(message, client, "Moderazione", `<:VC_Lock:1482526739044368476> Comando non supportato: ${cmd}`, "Red");
}

async function executeDynoModerationCommand(commandName, message, args, client) {
  if (message?.__fromMessageUpdatePrefix) {
    const updated = await updateCaseFromEditedModerationCommand(commandName, message, args).catch((err) => {
      global.logger?.error?.("[dynoModerationCommands] edited command case update failed:", err);
      return false;
    });
    if (updated) return null;
  }
  if (message?.guild) {
    sendModCommandUsageToModLogs(message.guild, message, commandName).catch(() => null);
  }
  await message.channel.sendTyping().catch(() => { });
  return runNamed(commandName, message, Array.isArray(args) ? args : [], client);
}

module.exports = { executeDynoModerationCommand };