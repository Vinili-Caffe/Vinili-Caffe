const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { resolveCaseByGuildCaseId, appendCaseEditStore, setCaseReasonStore, setCaseDurationStore } = require("../modCaseStore") as typeof import("../modCaseStore");
const { appendCaseEdit, closeCasePersist, formatDuration } = require("../moderation") as typeof import("../moderation");
const { sendStaffActionToModLogs } = require("../modAuditLogUtils") as typeof import("../modAuditLogUtils");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  reasonFrom,
  reply,
  resolveCaseDurationChange,
  successReply,
  parseMaybeDuration,
  parseDynoMuteDuration,
} = require("./helpers") as typeof import("./helpers");

async function runCaseFamily(cmd?, message?, args?, client?) {
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
    const action = String(row.action || "Sconosciuto").toLowerCase().replace(/^\w/, (c?) => c.toUpperCase());
    const hh = new Date(row.createdAt || Date.now()).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, });
    const caseEmbed = new EmbedBuilder().setColor("#FEE75C").setTitle(`Case ${caseId} · ${action} · ${targetUser?.username || row.userId}`)
      .addFields(
        { name: `${E.member_role_icon} Utente`, value: targetUser?.username || String(row.userId || "Sconosciuto"), inline: true },
        { name: `${E.VC_Staff} Moderatore`, value: modUser ? `<@${modUser.id}>` : String(row.modId || "Sconosciuto"), inline: true },
        { name: `${E.VC_reason} Motivo`, value: row.reason || "Nessun motivo fornito", inline: true },
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
    return successReply(message, `case #${caseId}`, "motivo aggiornato");
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
            .setDescription(`${E.cancel} La durata può essere modificata solo per casi mute/ban.`),
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
              `${E.cancel} Usa una durata valida inferiore a 14 giorni (esempio: 3m, 2h, 1d).`,
            ),
        ],
      })
      .catch(() => null);
  }
  const changed = resolveCaseDurationChange(row, duration);
  await appendCaseEditStore(refGuildId, refUserId, caseId, "durationMs", row.durationMs == null ? "" : row.durationMs, changed.durationMs, message.author.id);
  await setCaseDurationStore(refGuildId, refUserId, caseId, changed.durationMs, changed.expiresAt);
  appendCaseEdit(row, "durationMs", row.durationMs == null ? "" : row.durationMs, changed.durationMs, message.author.id);
  row.durationMs = changed.durationMs;
  row.expiresAt = changed.expiresAt;
  row.active = changed.remainingMs > 0;
  await sendStaffActionToModLogs(message.guild, row, {
    actionLabel: "Durata Aggiornata",
    moderatorId: message.author.id,
    extraFields: [
      { name: "Nuova durata", value: formatDuration(row.durationMs), inline: true },
      { name: "Rimanente", value: formatDuration(changed.remainingMs), inline: true },
    ],
  }).catch(() => null);
  if (String(row.action || "").toUpperCase() === "MUTE") {
    const member = await message.guild.members.fetch(String(row.userId || "")).catch(() => null);
    if (member) {
      if (changed.remainingMs > 0) {
        await member.timeout(changed.remainingMs, `Caso #${caseId} aggiornato`).catch(() => null);
      } else {
        await member.timeout(null, `Caso #${caseId}: durata scaduta dopo aggiornamento`).catch(() => null);
      }
    }
  }
  if (changed.remainingMs <= 0) {
    row.guildId = row.guildId || refGuildId;
    row.userId = row.userId || refUserId;
    await closeCasePersist(row, "Durata aggiornata: tempo già scaduto").catch(() => null);
    return successReply(message, `case #${caseId}`, "durata aggiornata (già scaduta: sanzione rimossa)");
  }
  return successReply(message, `case #${caseId}`, `durata aggiornata (rimangono ${formatDuration(changed.remainingMs)})`);
}

export = { runCaseFamily };
