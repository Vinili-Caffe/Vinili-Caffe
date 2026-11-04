const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildAuditExtraLines } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handlePruneAction: antiNukeHandlePruneAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { resolveModLogChannel, formatResponsible, nowDiscordTs, } = require("../../Moderation/utils/modAuditLogUtils") as typeof import("../../Moderation/utils/modAuditLogUtils");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { grantBestStaffPauseBonusYear } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { onStafferDellaSettimanaRoleAdded } = require("../../Staff/services/stafferDellaSettimanaService") as typeof import("../../Staff/services/stafferDellaSettimanaService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MEMBER_ROLE_UPDATE_ACTION = AuditLogEvent.MemberRoleUpdate ?? 25;

function auditEntryChangeAddsRoleId(entry?, roleId?) {
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

async function maybeGrantBestStaffPauseBonusFromAudit(entry?, guild?) {
  if (String(guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  if (entry.action !== MEMBER_ROLE_UPDATE_ACTION) return;
  const stafferDelMeseId = String(IDs.roles?.StafferDelMese || "").trim();
  if (!stafferDelMeseId || !auditEntryChangeAddsRoleId(entry, stafferDelMeseId)) return;
  const userId = String(entry.targetId ?? entry.target?.id ?? "").trim();
  if (!/^\d{17,20}$/.test(userId)) return;
  await grantBestStaffPauseBonusYear(guild.id, userId).catch((err?) => {
    global.logger?.warn?.("[guildAuditLogEntryCreate] bestStaffPauseBonusYear:", userId, err?.message || err);
  });
}

async function maybeGrantStafferDellaSettimanaBonusFromAudit(entry?, guild?) {
  if (String(guild?.id || "") !== String(IDs.guilds?.main || "")) return;
  if (entry.action !== MEMBER_ROLE_UPDATE_ACTION) return;
  const roleId = String(IDs.roles?.StafferDellaSettimana || "").trim();
  if (!roleId || !auditEntryChangeAddsRoleId(entry, roleId)) return;
  const userId = String(entry.targetId ?? entry.target?.id ?? "").trim();
  if (!/^\d{17,20}$/.test(userId)) return;
  await onStafferDellaSettimanaRoleAdded(guild.id, userId).catch((err?) => {
    global.logger?.warn?.(
      "[guildAuditLogEntryCreate] stafferDellaSettimanaBonus:",
      userId,
      err?.message || err,
    );
  });
}

export = {
  name: "guildAuditLogEntryCreate",
  async execute(entry?, guild?) {
    try {
      if (!entry || !guild) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;

      await maybeGrantBestStaffPauseBonusFromAudit(entry, guild);
      await maybeGrantStafferDellaSettimanaBonusFromAudit(entry, guild);

      if (entry.action !== AuditLogEvent.MemberPrune) return;

      const logChannel = await resolveModLogChannel(guild);

      const executor = entry.executor || null;
      const responsible = formatResponsible(executor);

      const rawMembersRemoved = Number(entry.extra?.removed ?? entry.extra?.membersRemoved ?? 0);
      const rawDeleteDays = Number(entry.extra?.deleteMemberDays ?? entry.extra?.days ?? 0);
      const membersRemoved = Number.isFinite(rawMembersRemoved) ? Math.max(0, rawMembersRemoved) : 0;
      const deleteDays = Number.isFinite(rawDeleteDays) ? Math.max(0, rawDeleteDays) : 0;
      const extraLines = buildAuditExtraLines(entry, ["removed", "members_removed", "delete_member_days", "days"]);
      const cleanedExtraLines=extraLines.filter((line?,index?) => !(index===0&&line==="")&&line!==`**${E.VC_tools} Informazioni aggiuntive**`,);

      if (logChannel?.isTextBased?.()) {
        const embed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle(`${E.VC_User} Member Prune`)
            .setDescription([`${E.VC_Staff} **Responsabile:** ${responsible}`,
              `${E.VC_Clock} ${nowDiscordTs()}`,
              entry.reason ? `${E.VC_reason} **Motivo:** ${entry.reason}` : null,
              "",
              `**${E.VC_tools} Informazioni aggiuntive**`,
              `${E.VC_Info} **Conteggio:** ${membersRemoved}`,
              `${E.VC_Info} **Giorni:** ${deleteDays}`,
              ...(cleanedExtraLines.length ? ["", `**${E.VC_tools} Dettagli audit**`, ...cleanedExtraLines] : []),
            ]
              .filter(Boolean)
              .join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => null);
      }
      await antiNukeHandlePruneAction({ guild: guild, executorId: String(entry?.executor?.id || ""), removedCount: membersRemoved });
    } catch (error) {
      global.logger?.error?.("[guildAuditLogEntryCreate] failed:", error);
    }
  },
};