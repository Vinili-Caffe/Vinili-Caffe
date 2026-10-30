const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils") as typeof import("../Utils/Logging/modAuditLogUtils");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveUnbanAuditEntry(guild?, targetUserId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const entry=await fetchRecentAuditEntry(guild,AuditLogEvent.MemberBanRemove,(item?) => String(item?.target?.id||"")===String(targetUserId||""),);
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

export = {
  name: "guildBanRemove",
  async execute(ban?) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;
      const targetId = String(ban?.user?.id || "");
      if (!targetId) return;

      const logChannel = await resolveModLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      let executor = null;
      let reason = normalizeReason(ban?.reason);
      const auditEntry = await resolveUnbanAuditEntry(guild, targetId);
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = normalizeReason(auditEntry.reason);

      const responsible = formatResponsible(executor);

      const targetLabel = ban.user ? `${ban.user}` : "sconosciuto";
      const embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("<:VC_User:1482527453586002103> Ban Removed")
      .setDescription([`<:VC_User:1482527453586002103> **Ban per** ${targetLabel} **è stato rimosso**`,
            `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
            `<:VC_Clock:1473359204189474886> ${nowDiscordTs()}`,
            reason ? `<:VC_reason:1478517122929004544> **Motivo:** ${reason}` : null,
            ...buildAuditExtraLines(auditEntry, ["reason"]),
          ]
            .filter(Boolean)
            .join("\n"))
      .setFooter({ text: `ID: ${targetId}` })
      .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => null);

      try {
        const { autoClosePendingAppealsForUser } = require("../Web/siteStaffAppealsRuntime") as typeof import("../Web/siteStaffAppealsRuntime");
        void autoClosePendingAppealsForUser(guild, targetId, "unban").catch((err?) => {
          global.logger?.warn?.("[guildBanRemove] appeal auto-close unban:", targetId, err?.message || err);
        });
      } catch (_) {}
    } catch (error) {
      global.logger?.error?.("[guildBanRemove] failed:", error);
    }
  },
};