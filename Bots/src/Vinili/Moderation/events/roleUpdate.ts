const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { toDiscordTimestamp, formatAuditActor, permissionDiff, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleRoleUpdate: antiNukeHandleRoleUpdate } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const ROLE_UPDATE_ACTION = AuditLogEvent?.RoleUpdate ?? 31;

export = {
  name: "roleUpdate",
  async execute(oldRole?, newRole?, client?) {
    const guildId=newRole?.guild?.id||oldRole?.guild?.id||newRole?.guildId||oldRole?.guildId;
    if (!guildId) return;
    if (!isViniliFullFeatureGuild(guildId)) return;

    try {
      const nameChanged = oldRole?.name !== newRole?.name;
      const colorChanged = oldRole?.hexColor !== newRole?.hexColor;
      const hoistChanged = Boolean(oldRole?.hoist) !== Boolean(newRole?.hoist);
      const permsChanged=String(oldRole?.permissions?.bitfield||0n)!==String(newRole?.permissions?.bitfield||0n);

      if (nameChanged || colorChanged || hoistChanged || permsChanged) {
        const audit=await resolveResponsible(newRole.guild,ROLE_UPDATE_ACTION,(entry?) => String(entry?.target?.id||"")===String(newRole.id||""),);
        const responsible = formatAuditActor(audit.executor);
        const executorId = String(audit?.executor?.id || "");

        const logChannel = await resolveChannelRolesLogChannel(newRole.guild);
        if (logChannel?.isTextBased?.()) {
          const lines=[`${E.VC_Staff} **Responsabile:** ${responsible}`,
            `${E.VC_User} **Utente:** ${newRole} \`${newRole.id}\``,
            `${E.VC_Clock} ${toDiscordTimestamp(new Date(),"F")}`,
            "",
            `**${E.VC_tools} Cambiamenti**`,
          ];

          if (nameChanged) {
            lines.push(`${E.VC_Modifica} **Nome:** ${oldRole.name} ${E.VC_Arrow} ${newRole.name}`);
          }
          if (colorChanged) {
            lines.push(
              `${E.VC_Color} **Color:** ${oldRole.hexColor || "#000000"} ${E.VC_Arrow} ${newRole.hexColor || "#000000"}`,
            );
          }
          if (hoistChanged) {
            lines.push(
              `${E.VC_Color} **Hoist:** ${oldRole.hoist ? "Si" : "No"} ${E.VC_Arrow} ${newRole.hoist ? "Si" : "No"}`,
            );
          }
          if (permsChanged) {
            const perms=permissionDiff(oldRole.permissions.bitfield,newRole.permissions.bitfield,);
            lines.push(`${E.VC_Info} **Permessi:**`);
            lines.push(
              `${E.VC_Cross} **Rimossi:** ${perms.removals}`,
            );
            lines.push(
              `${E.VC_Verified} **Aggiunti:** ${perms.additions}`,
            );
          }
          lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "permissions"]));

          const embed=new EmbedBuilder().setColor("#F59E0B").setTitle(`${E.VC_Color} Ruolo Aggiornato`).setDescription(lines.join("\n"));

          await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
        await antiNukeHandleRoleUpdate({ oldRole, newRole, executorId }).catch(() => {});
      }
    } catch (error) {
      global.logger?.error?.("[roleUpdate] failed:", error);
    }

    const nameChanged = oldRole?.name !== newRole?.name;
    const positionChanged = oldRole?.position !== newRole?.position;
    if (!nameChanged && !positionChanged) return;

    queueIdsCatalogSync(client, guildId, "roleUpdate");
  },
};