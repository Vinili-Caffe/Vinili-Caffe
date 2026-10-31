const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils") as typeof import("../Utils/Logging/modAuditLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService") as typeof import("../Services/Moderation/antiNukeService");
const { closeOpenTicketsForGuildUser } = require("../features/tickets/discord/ticketCloseRuntime") as typeof import("../features/tickets/discord/ticketCloseRuntime");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");

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
        .setTitle("<:VC_User:1482527453586002103> Member Banned")
        .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
              `<:VC_User:1482527453586002103> **Utente:** ${ban.user || "sconosciuto"}\`${targetId}\``,
              `<:VC_Clock:1473359204189474886> ${nowDiscordTs()}`,
              reason ? `<:VC_reason:1478517122929004544> **Motivo:** ${reason}` : null,
              ticketClose?.closed ? `<:VC_Info:1482526956703580372> **Ticket chiuso:** ${ticketClose.closed}` : null,
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