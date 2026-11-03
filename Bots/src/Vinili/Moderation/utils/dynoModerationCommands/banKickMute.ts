const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { findOpenCases } = require("../modCaseStore") as typeof import("../modCaseStore");
const { closeCasePersist, formatDuration } = require("../moderation") as typeof import("../moderation");
const {
  reasonFrom,
  reply,
  formatTargetLabel,
  executeGuildBan,
  validateModerationTarget,
  successReply,
  sendModerationDm,
  makeCase,
  pickUser,
  parseMaybeDuration,
  parseDynoMuteDuration,
  resolveBanTarget,
} = require("./helpers") as typeof import("./helpers");

async function runBan(message?, args?, client?) {
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
  const resolvedUser = user || (await message.client.users.fetch(userId).catch(() => null));
  if (!resolvedUser) {
    return reply(
      message,
      client,
      "Ban",
      "<:VC_Lock:1482526739044368476> Utente sconosciuto o **ID non valido** (account eliminato o ID errato).",
      "Red",
    );
  }
  const duration = parseMaybeDuration(args[targetIndex + 1]);
  const reason = reasonFrom(args, duration ? targetIndex + 2 : targetIndex + 1, "");
  if (!reason || !reason.trim()) {
    return reply(message, client, "Ban", "<:VC_Lock:1482526739044368476> Il motivo è obbligatorio per il ban. Uso: `+ban [utente] [durata] [motivo]`", "Red");
  }
  const deleteSeconds = mode === "save" ? 0 : 604800;
  await sendModerationDm({
    user: resolvedUser,
    guildId: message.guild.id,
    guildName: message.guild.name,
    action: "ban",
    reason,
  });
  const banOut = await executeGuildBan(message.guild, userId, { reason, deleteMessageSeconds: deleteSeconds });
  if (!banOut.ok) {
    return reply(message, client, "Ban", `<:VC_Lock:1482526739044368476> ${banOut.error}`, "Red");
  }
  await makeCase(client, message, "BAN", userId, reason, duration);
  return successReply(message, formatTargetLabel(resolvedUser), "was banned", reason);
}

async function runKick(message?, args?, client?) {
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
  const dmUser = user || member.user || (await message.client.users.fetch(userId).catch(() => null));
  await sendModerationDm({
    user: dmUser,
    guildId: message.guild.id,
    guildName: message.guild.name,
    action: "kick",
    reason,
  });
  const ok = await member.kick(reason).then(() => true).catch(() => false);
  if (!ok) return reply(message, client, "Kick", "Operazione fallita.", "Red");
  await makeCase(client, message, "KICK", userId, reason);
  return successReply(message, formatTargetLabel(member.user || { id: userId }), "was kicked", reason);
}

async function runMute(message?, args?, client?) {
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
      try {
    const { captureMuteRoleSnapshot } = require("../../services/mutedMirrorRoleService") as typeof import("../../services/mutedMirrorRoleService");
    await captureMuteRoleSnapshot(member, { reason: "Timeout Discord / +mute (pre-timeout)" });
  } catch (err) {
    global.logger?.warn?.("[mute] pre-timeout snapshot:", err?.message || err);
  }
  const ok = await member.timeout(duration, reason).then(() => true).catch(() => false);
  if (!ok) return reply(message, client, "Mute", "Operazione fallita.", "Red");
  try {
    const { applyActiveMuteMirror } = require("../../services/mutedMirrorRoleService") as typeof import("../../services/mutedMirrorRoleService");
    const fresh = (await message.guild.members.fetch(userId).catch(() => null)) || member;
    await applyActiveMuteMirror(fresh, { reason: "Timeout Discord / +mute" });
  } catch (err) {
    global.logger?.warn?.("[mute] active mirror after timeout:", err?.message || err);
  }
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

async function runUnmute(message?, args?, client?) {
  const { user, member, userId } = await pickUser(message, args, 0);
  if (!member || !userId) return reply(message, client, "Unmute", "Uso: `+unmute @utente [motivo]`.", "Red");
  const guard = await validateModerationTarget(message, member, "unmute", userId);
  if (!guard.ok) return reply(message, client, "Unmute", guard.error, "Red");
  const reason = reasonFrom(args, 1);
  const ok = await member.timeout(null, reason).then(() => true).catch(() => false);
  if (!ok) return reply(message, client, "Unmute", "Operazione fallita.", "Red");
  try {
    const { restoreRolesAfterCommunicationTimeoutEnd } = require("../../services/mutedMirrorRoleService") as typeof import("../../services/mutedMirrorRoleService");
    const fresh = (await message.guild.members.fetch(userId).catch(() => null)) || member;
    await restoreRolesAfterCommunicationTimeoutEnd(fresh, {
      reason: `Unmute manuale da ${message.author.id}`,
      wasUnmuteFlow: true,
      client: message.client,
    });
  } catch (err) {
    global.logger?.warn?.("[unmute] role restore after timeout:", err?.message || err);
  }
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

async function runUnban(message?, args?, client?) {
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

export = { runBan, runKick, runMute, runUnmute, runUnban };
