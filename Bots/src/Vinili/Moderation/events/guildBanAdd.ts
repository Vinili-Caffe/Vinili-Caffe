const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildAuditExtraLines } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../../Moderation/utils/modAuditLogUtils") as typeof import("../../Moderation/utils/modAuditLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { closeOpenTicketsForGuildUser } = require("../../../MultiGuild/tickets/discord/ticketCloseRuntime") as typeof import("../../../MultiGuild/tickets/discord/ticketCloseRuntime");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveBanAuditEntry(guild?, targetUserId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const entry=await fetchRecentAuditEntry(guild,AuditLogEvent.MemberBanAdd,(item?) => String(item?.target?.id||"")===String(targetUserId||""),);
    if (entry) return entry;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return null;
}

function normalizeReason(value?) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 900) return text;
  return `${text.slice(0, 897)}...`;
}

async function closeOpenTicketsForBannedUser(guild?, userId?, reason = null) {
  return closeOpenTicketsForGuildUser(guild, userId, {
    closeReason: reason || "Ticket chiuso automaticamente: utente bannato.",
    closedBy: "system:ban",
    deleteReason: `Ticket chiuso automaticamente: utente bannato (${userId})`,
  });
}

export = {
  name: "guildBanAdd",
  async execute(ban?) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;
      const targetId = String(ban?.user?.id || "");
      if (!targetId) return;

      let executor = null;
      let reason = normalizeReason(ban?.reason);
      const auditEntry = await resolveBanAuditEntry(guild, targetId);
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = normalizeReason(auditEntry.reason);
      const executorId = String(auditEntry?.executor?.id || "");
      const ticketClose = await closeOpenTicketsForBannedUser(guild, targetId, reason);

      const logChannel = await resolveModLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatResponsible(executor);

        const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle(`${E.VC_User} Member Banned`)
        .setDescription([`${E.VC_Staff} **Responsabile:** ${responsible}`,
              `${E.VC_User} **Utente:** ${ban.user || "sconosciuto"}\`${targetId}\``,
              `${E.VC_Clock} ${nowDiscordTs()}`,
              reason ? `${E.VC_reason} **Motivo:** ${reason}` : null,
              ticketClose?.closed ? `${E.VC_Info} **Ticket chiuso:** ${ticketClose.closed}` : null,
              ...buildAuditExtraLines(auditEntry, ["reason"]),
            ]
              .filter(Boolean)
              .join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleKickBanAction({
        guild: guild, executorId: executorId, action: "ban", targetId: targetId });
    } catch (error) {
      global.logger?.error?.("[guildBanAdd] failed:", error);
    }
  },
};