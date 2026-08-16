const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { ARROW, toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleRoleCreationAction: antiNukeHandleRoleCreationAction } = require("../Services/Moderation/antiNukeService");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope");
const ROLE_CREATE_ACTION = AuditLogEvent?.RoleCreate ?? 30;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild, roleId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,ROLE_CREATE_ACTION,(entry) => String(entry?.target?.id||"")===String(roleId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;
    if (!isViniliFullFeatureGuild(guildId)) return;

    try {
      const guild=role?.guild||client?.guilds?.cache?.get?.(guildId)||(await client?.guilds?.fetch?.(guildId).catch(() => null));
      if (!guild) return;

      let executorId = "";
      const audit = await resolveResponsibleWithRetry(guild, role?.id);
      executorId = String(audit?.executor?.id || "");
      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit.executor);

        const lines=[`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
          `<:VC_User:1482527453586002103> **Utente:** ${role} \`${role.id}\``,
          `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(),"F")}`,
          "",
          "**<:VC_tools:1478862265305272364> Impostazioni**",
          `<:VC_Modifica:1478859646587633717> **Nome:** ${role.name||"sconosciuto"}`,
          `<:VC_Color:1482532543273238569> **Colore:** ${role.hexColor||"#000000"}`,
          `<:VC_Color:1482532543273238569> **Hoist:** ${yesNo(Boolean(role.hoist))}`,
          `<a:VC_Mention:1482526855289634997> **Menzionabile:** ${yesNo(Boolean(role.mentionable))}`,
        ];
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "mentionable"]));

        const embed=new EmbedBuilder().setColor("#57F287").setTitle("<:VC_Color:1482532543273238569> Ruolo Creato").setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      await antiNukeHandleRoleCreationAction({ guild, executorId, roleId: String(role.id || "") });
    } catch (error) {
      global.logger?.error?.("[roleCreate] failed:", error);
    }

    if (client) {
      queueIdsCatalogSync(client, guildId, "roleCreate");
    }
  },
};