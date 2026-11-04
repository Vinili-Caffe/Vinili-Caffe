const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleRoleCreationAction: antiNukeHandleRoleCreationAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const ROLE_CREATE_ACTION = AuditLogEvent?.RoleCreate ?? 30;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild?, roleId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,ROLE_CREATE_ACTION,(entry?) => String(entry?.target?.id||"")===String(roleId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

export = {
  name: "roleCreate",
  async execute(role?, client?) {
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

        const lines=[`${E.VC_Staff} **Responsabile:** ${responsible}`,
          `${E.VC_User} **Utente:** ${role} \`${role.id}\``,
          `${E.VC_Clock} ${toDiscordTimestamp(new Date(),"F")}`,
          "",
          `**${E.VC_tools} Impostazioni**`,
          `${E.VC_Modifica} **Nome:** ${role.name||"sconosciuto"}`,
          `${E.VC_Color} **Colore:** ${role.hexColor||"#000000"}`,
          `${E.VC_Color} **Hoist:** ${yesNo(Boolean(role.hoist))}`,
          `${E.VC_Mention} **Menzionabile:** ${yesNo(Boolean(role.mentionable))}`,
        ];
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "mentionable"]));

        const embed=new EmbedBuilder().setColor("#57F287").setTitle(`${E.VC_Color} Ruolo Creato`).setDescription(lines.join("\n"));

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