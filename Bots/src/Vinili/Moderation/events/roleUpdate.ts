const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { toDiscordTimestamp, formatAuditActor, permissionDiff, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleRoleUpdate: antiNukeHandleRoleUpdate } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
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
          const lines=[`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
            `<:VC_User:1482527453586002103> **Utente:** ${newRole} \`${newRole.id}\``,
            `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(),"F")}`,
            "",
            "**<:VC_tools:1478862265305272364> Cambiamenti**",
          ];

          if (nameChanged) {
            lines.push(`<:VC_Modifica:1478859646587633717> **Nome:** ${oldRole.name} <a:VC_Arrow:1482706699365257397> ${newRole.name}`);
          }
          if (colorChanged) {
            lines.push(
              `<:VC_Color:1482532543273238569> **Color:** ${oldRole.hexColor || "#000000"} <a:VC_Arrow:1482706699365257397> ${newRole.hexColor || "#000000"}`,
            );
          }
          if (hoistChanged) {
            lines.push(
              `<:VC_Color:1482532543273238569> **Hoist:** ${oldRole.hoist ? "Si" : "No"} <a:VC_Arrow:1482706699365257397> ${newRole.hoist ? "Si" : "No"}`,
            );
          }
          if (permsChanged) {
            const perms=permissionDiff(oldRole.permissions.bitfield,newRole.permissions.bitfield,);
            lines.push(`<:VC_Info:1482526956703580372> **Permessi:**`);
            lines.push(
              `<a:VC_Cross:1482532424570376253> **Rimossi:** ${perms.removals}`,
            );
            lines.push(
              `<a:VC_Verified:1482532479637127188> **Aggiunti:** ${perms.additions}`,
            );
          }
          lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "permissions"]));

          const embed=new EmbedBuilder().setColor("#F59E0B").setTitle("<:VC_Color:1482532543273238569> Ruolo Aggiornato").setDescription(lines.join("\n"));

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