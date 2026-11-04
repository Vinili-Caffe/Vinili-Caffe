const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildAuditExtraLines } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleVanityGuard: antiNukeHandleVanityGuard } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../../Moderation/utils/modAuditLogUtils") as typeof import("../../Moderation/utils/modAuditLogUtils");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function notificationsLabel(value?) {
  const n = Number(value);
  if (n === 0) return "Tutti i messaggi";
  if (n === 1) return "Solo menzioni";
  return String(n);
}

function normalizeComparable(value?) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

export = {
  name: "guildUpdate",
  async execute(oldGuild?, newGuild?) {
    try {
      const guild = newGuild || oldGuild;
      if (!guild) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;

      const changes = [];
      if (oldGuild?.name !== newGuild?.name) {
        changes.push(["Nome", `${oldGuild?.name || "N/A"} ${E.VC_Arrow} ${newGuild?.name || "N/A"}`]);
      }
      if ((oldGuild?.description || "") !== (newGuild?.description || "")) {
        changes.push(["Descrizione", `${oldGuild?.description || "N/A"} ${E.VC_Arrow} ${newGuild?.description || "N/A"}`]);
      }
      if (normalizeComparable(oldGuild?.icon) !== normalizeComparable(newGuild?.icon)) {
        changes.push(["Icona", `${oldGuild?.icon || "N/A"} ${E.VC_Arrow} ${newGuild?.icon || "N/A"}`]);
      }
      if (normalizeComparable(oldGuild?.banner) !== normalizeComparable(newGuild?.banner)) {
        changes.push(["Banner", `${oldGuild?.banner || "N/A"} ${E.VC_Arrow} ${newGuild?.banner || "N/A"}`]);
      }
      if (Number(oldGuild?.defaultMessageNotifications) !== Number(newGuild?.defaultMessageNotifications)) {
        changes.push(["Notifiche messaggi predefinite", `${notificationsLabel(oldGuild?.defaultMessageNotifications)} ${E.VC_Arrow} ${notificationsLabel(newGuild?.defaultMessageNotifications)}`]);
      }
      if ((oldGuild?.vanityURLCode || "") !== (newGuild?.vanityURLCode || "")) {
        changes.push(["Invito Vanity", `${oldGuild?.vanityURLCode || "N/A"} ${E.VC_Arrow} ${newGuild?.vanityURLCode || "N/A"}`]);
      }
      if (!changes.length) return;
      const vanityChanged=(oldGuild?.vanityURLCode||"")!==(newGuild?.vanityURLCode||"");

      const logChannel = await resolveModLogChannel(guild);
      const canLog = Boolean(logChannel?.isTextBased?.());

      let executor = null;
      const auditEntry=await fetchRecentAuditEntry(guild,AuditLogEvent.GuildUpdate,(entry?) => String(entry?.target?.id||"")===String(guild.id||""),);
      if (auditEntry?.executor) executor = auditEntry.executor;
      const executorId = String(auditEntry?.executor?.id || "");

      const responsible = formatResponsible(executor);
      const lines = [
        `${E.VC_Staff} **Responsabile:** ${responsible}`,
        `${E.VC_Clock} ${nowDiscordTs()}`,
        "",
        "**Modifiche**",
      ];

      for (const [label, oldValue, newValue] of changes) {
        lines.push(`${E.VC_Modifica} **${label}**`);
        lines.push(`${oldValue} ${E.VC_Arrow} ${newValue}`);
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
          .setTitle(`${E.VC_Verified} Server aggiornato`)
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