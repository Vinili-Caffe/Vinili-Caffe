const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService");
const Ticket = require("../Schemas/Ticket/ticketSchema");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveBanAuditEntry(guild, targetUserId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const entry=await fetchRecentAuditEntry(guild,AuditLogEvent.MemberBanAdd,(item) => String(item?.target?.id||"")===String(targetUserId||""),);
    if (entry) return entry;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return null;
}

function normalizeReason(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 900) return text;
  return `${text.slice(0, 897)}...`;
}

async function closeOpenTicketsForBannedUser(guild, userId, reason = null) {
  if (!guild || !userId) return { closed: 0 };
  const openTickets = await Ticket.find({
    guildId: String(guild.id),
    userId: String(userId),
    open: true,
  }).limit(30).lean().catch(() => []);
  if (!Array.isArray(openTickets) || openTickets.length === 0) return { closed: 0 };

  let closed = 0;
  for (const ticket of openTickets) {
    try {
      const channelId = String(ticket?.channelId || "");
      const channel = channelId
        ? (guild.channels.cache.get(channelId) || (await getClientChannelCached(guild.client, channelId)))
        : null;

      await Ticket.updateOne(
        { _id: ticket._id, guildId: String(guild.id), open: true },
        {
          $set: {
            open: false,
            closedAt: new Date(),
            closeReason: reason || "Ticket chiuso automaticamente: utente bannato.",
            closedBy: "system:ban",
          },
        },
      ).catch(() => ({ modifiedCount: 0 }));

      if (channel?.deletable) {
        await channel.delete(`Ticket auto-chiuso: utente bannato (${userId})`).catch(() => { });
      }
      closed += 1;
    } catch {
    }
  }
  return { closed };
}

module.exports = {
  name: "guildBanAdd",
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
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
        .setTitle("Member Banned")
        .setDescription([`${ARROW} **Responsible:** ${responsible}`,
              `${ARROW} **Target:** ${ban.user || "sconosciuto"}\`${targetId}\``,
              `${ARROW} ${nowDiscordTs()}`,
              reason ? `${ARROW} **Reason:** ${reason}` : null,
              ticketClose?.closed ? `${ARROW} **Ticket chiusi automaticamente:** ${ticketClose.closed}` : null,
              ...buildAuditExtraLines(auditEntry, ["reason"]),
            ]
              .filter(Boolean)
              .join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleKickBanAction({
        guild,
        executorId,
        action: "ban",
        targetId,
      });
    } catch (error) {
      global.logger?.error?.("[guildBanAdd] failed:", error);
    }
  },
};