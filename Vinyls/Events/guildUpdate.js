const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handleVanityGuard: antiNukeHandleVanityGuard } = require("../Services/Moderation/antiNukeService");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils");

function notificationsLabel(value) {
  const n = Number(value);
  if (n === 0) return "Tutti i messaggi";
  if (n === 1) return "Solo menzioni";
  return String(n);
}

function normalizeComparable(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

module.exports = {
  name: "guildUpdate",
  async execute(oldGuild, newGuild) {
    try {
      const guild = newGuild || oldGuild;
      if (!guild) return;

      const changes = [];
      if (oldGuild?.name !== newGuild?.name) {
        changes.push(["Nome", `${oldGuild?.name || "N/A"} <a:VC_Arrow:1482706699365257397> ${newGuild?.name || "N/A"}`]);
      }
      if ((oldGuild?.description || "") !== (newGuild?.description || "")) {
        changes.push(["Descrizione", `${oldGuild?.description || "N/A"} <a:VC_Arrow:1482706699365257397> ${newGuild?.description || "N/A"}`]);
      }
      if (normalizeComparable(oldGuild?.icon) !== normalizeComparable(newGuild?.icon)) {
        changes.push(["Icona", `${oldGuild?.icon || "N/A"} <a:VC_Arrow:1482706699365257397> ${newGuild?.icon || "N/A"}`]);
      }
      if (normalizeComparable(oldGuild?.banner) !== normalizeComparable(newGuild?.banner)) {
        changes.push(["Banner", `${oldGuild?.banner || "N/A"} <a:VC_Arrow:1482706699365257397> ${newGuild?.banner || "N/A"}`]);
      }
      if (Number(oldGuild?.defaultMessageNotifications) !== Number(newGuild?.defaultMessageNotifications)) {
        changes.push(["Notifiche messaggi predefinite", `${notificationsLabel(oldGuild?.defaultMessageNotifications)} <a:VC_Arrow:1482706699365257397> ${notificationsLabel(newGuild?.defaultMessageNotifications)}`]);
      }
      if ((oldGuild?.vanityURLCode || "") !== (newGuild?.vanityURLCode || "")) {
        changes.push(["Invito Vanity", `${oldGuild?.vanityURLCode || "N/A"} <a:VC_Arrow:1482706699365257397> ${newGuild?.vanityURLCode || "N/A"}`]);
      }
      if (!changes.length) return;
      const vanityChanged=(oldGuild?.vanityURLCode||"")!==(newGuild?.vanityURLCode||"");

      const logChannel = await resolveModLogChannel(guild);
      const canLog = Boolean(logChannel?.isTextBased?.());

      let executor = null;
      const auditEntry=await fetchRecentAuditEntry(guild,AuditLogEvent.GuildUpdate,(entry) => String(entry?.target?.id||"")===String(guild.id||""),);
      if (auditEntry?.executor) executor = auditEntry.executor;
      const executorId = String(auditEntry?.executor?.id || "");

      const responsible = formatResponsible(executor);
      const lines = [
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<:VC_Clock:1473359204189474886> ${nowDiscordTs()}`,
        "",
        "**Modifiche**",
      ];

      for (const [label, oldValue, newValue] of changes) {
        lines.push(`<:VC_Modifica:1478859646587633717> **${label}**`);
        lines.push(`${oldValue} <a:VC_Arrow:1482706699365257397> ${newValue}`);
      }
      lines.push(
        ...buildAuditExtraLines(auditEntry, [
          "name",
          "description",
          "icon_hash",
          "banner_hash",
          "default_message_notifications",
          "vanity_url_code",
        ]),
      );

      if (canLog) {
        const embed = new EmbedBuilder()
          .setColor("#F59E0B")
          .setTitle("<a:VC_Verified:1482532479637127188> Server aggiornato")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => null);
      }

      if (vanityChanged) {
        await antiNukeHandleVanityGuard({ oldGuild, newGuild, executorId });
      }
    } catch (error) {
      global.logger?.error?.("[guildUpdate] failed:", error);
    }
  },
};