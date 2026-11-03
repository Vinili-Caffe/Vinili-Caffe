declare const targetMember: any; // usato solo dopo typeof targetMember !== "undefined"
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { findActiveWarns } = require("../modCaseStore") as typeof import("../modCaseStore");
const { closeCasePersist } = require("../moderation") as typeof import("../moderation");
const { resolveModLogChannel } = require("../modAuditLogUtils") as typeof import("../modAuditLogUtils");
const { userAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const {
  reply,
  formatTargetLabel,
  validateModerationTarget,
  successReply,
  sendModerationDm,
  makeCase,
  pickUser,
} = require("./helpers") as typeof import("./helpers");

async function runWarn(message?, args?, client?) {
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

async function runWarnings(message?, args?, client?, cmd = "warnings") {
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

async function runDelwarn(message?, args?, client?) {
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
  const row = rows.find((r?) => String(r.reason || "").toLowerCase() === needle) || rows.find((r?) => String(r.reason || "").toLowerCase().includes(needle)) || null;
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
    const warnRemovedEmbed = new EmbedBuilder().setColor("#57F287").setTitle("Warn Rimosso").setDescription([
      `<:VC_BanHammer:1482534474502897795> **Warn per** ${targetLabel} **è stato rimosso**`,
      `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleLabel}`,
      `<:VC_Clock:1473359204189474886> <t:${Math.floor(Date.now() / 1000)}:F>`,
      `<:VC_reason:1478517122929004544> **Motivo:** ${(warningText || "").slice(0, 200)}${(warningText || "").length > 200 ? "…" : ""}`,
    ].join("\n"),
    )
      .setFooter({ text: `ID: ${target.userId}` })
      .setTimestamp();
    await modLogChannel.send({ embeds: [warnRemovedEmbed] }).catch(() => null);
  }
  return successReply(
    message,
    formatTargetLabel(targetUser || { id: target.userId }),
    "ha 1 warn rimosso",
    warningText,
  );
}

async function runClearwarn(message?, args?, client?) {
  const target = await pickUser(message, args, 0);
  if (!target.userId) {
    const helpEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setDescription(
        ["**Comando: +clearwarn**", "", "**Descrizione:** Rimuove tutti i warn attivi da un utente.", "**Uso:**", "+clearwarn [utente]", "**Esempio:**", "+clearwarn @utente"].join("\n"),
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
            .setDescription("<:cancel:1461730653677551691> Nessun warn attivo trovato per questo utente."),
        ],
      })
      .catch(() => null);
  }
  const closeReason = `Warn azzerati da ${message.author.id}`;
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
      `<a:VC_Alert:1482706673176150077> **Tutti i warn per** ${targetLabel} **sono stati rimossi** (${rows.length} ${rows.length === 1 ? "avviso" : "avvisi"})`,
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

export = { runWarn, runWarnings, runDelwarn, runClearwarn };
