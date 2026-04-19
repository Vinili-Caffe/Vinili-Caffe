const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handlePruneAction: antiNukeHandlePruneAction } = require("../Services/Moderation/antiNukeService");
const { resolveModLogChannel, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils");
const IDs = require("../Utils/Config/ids");
const { grantBestStaffPauseBonusYear } = require("../Utils/Pause/pauseHandlersUtils");

const MEMBER_ROLE_UPDATE_ACTION = AuditLogEvent.MemberRoleUpdate ?? 25;

function auditEntryChangeAddsRoleId(entry, roleId) {
  if (!roleId) return false;
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  for (const change of changes) {
    if (String(change?.key || "") !== "$add") continue;
    const raw = Array.isArray(change?.new) ? change.new : [];
    for (const item of raw) {
      const id = String(item?.id ?? item?.role_id ?? "").trim();
      if (id === roleId) return true;
    }
  }
  return false;
}

async function maybeGrantBestStaffPauseBonusFromAudit(entry, guild) {
  if (String(guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  if (entry.action !== MEMBER_ROLE_UPDATE_ACTION) return;
  const stafferDelMeseId = String(IDs.roles?.StafferDelMese || "").trim();
  if (!stafferDelMeseId || !auditEntryChangeAddsRoleId(entry, stafferDelMeseId)) return;
  const userId = String(entry.targetId ?? entry.target?.id ?? "").trim();
  if (!/^\d{17,20}$/.test(userId)) return;
  await grantBestStaffPauseBonusYear(guild.id, userId).catch((err) => {
    global.logger?.warn?.("[guildAuditLogEntryCreate] bestStaffPauseBonusYear:", userId, err?.message || err);
  });
}

module.exports = {
  name: "guildAuditLogEntryCreate",
  async execute(entry, guild) {
    try {
      if (!entry || !guild) return;

      await maybeGrantBestStaffPauseBonusFromAudit(entry, guild);

      if (entry.action !== AuditLogEvent.MemberPrune) return;

      const logChannel = await resolveModLogChannel(guild);

      const executor = entry.executor || null;
      const responsible = formatResponsible(executor);

      const rawMembersRemoved = Number(entry.extra?.removed ?? entry.extra?.membersRemoved ?? 0);
      const rawDeleteDays = Number(entry.extra?.deleteMemberDays ?? entry.extra?.days ?? 0);
      const membersRemoved = Number.isFinite(rawMembersRemoved) ? Math.max(0, rawMembersRemoved) : 0;
      const deleteDays = Number.isFinite(rawDeleteDays) ? Math.max(0, rawDeleteDays) : 0;
      const extraLines = buildAuditExtraLines(entry, ["removed", "members_removed", "delete_member_days", "days"]);
      const cleanedExtraLines=extraLines.filter((line,index) => !(index===0&&line==="")&&line!=="**Additional Information**",);

      if (logChannel?.isTextBased?.()) {
        const embed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("Member Prune")
            .setDescription([`${ARROW} **Responsible:** ${responsible}`,
              `${ARROW} ${nowDiscordTs()}`,
              entry.reason ? `${ARROW} **Reason:** ${entry.reason}` : null,
              "",
              "**Additional Information**",
              `${ARROW} **Count:** ${membersRemoved}`,
              `${ARROW} **Days:** ${deleteDays}`,
              ...(cleanedExtraLines.length ? ["", "**Audit Details**", ...cleanedExtraLines] : []),
            ]
              .filter(Boolean)
              .join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => null);
      }
      await antiNukeHandlePruneAction({
        guild,
        executorId: String(entry?.executor?.id || ""),
        removedCount: membersRemoved,
      });
    } catch (error) {
      global.logger?.error?.("[guildAuditLogEntryCreate] failed:", error);
    }
  },
};