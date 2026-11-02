const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync") as typeof import("../Utils/Config/idsAutoSync");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { handleRoleDeletionAction: antiNukeHandleRoleDeletionAction } = require("../Moderation/services/antiNukeService") as typeof import("../Moderation/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const ROLE_DELETE_ACTION = AuditLogEvent?.RoleDelete ?? 32;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild?, roleId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,ROLE_DELETE_ACTION,(entry?) => String(entry?.target?.id||"")===String(roleId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

export = {
  name: "roleDelete",
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

        const lines=[`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
          `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(),"F")}`,
        ];
        if (audit.reason) lines.push(`<:VC_Modifica:1478859646587633717> **Motivo:** ${audit.reason}`);
        lines.push(
          "",
          "**<:VC_tools:1478862265305272364> Impostazioni precedenti**",
          `<:VC_Modifica:1478859646587633717> **Nome:** ${role.name || "sconosciuto"}`,
          `<:VC_Color:1482532543273238569> **Color:** ${role.hexColor || "#000000"}`,
          `<:VC_Color:1482532543273238569> **Hoist:** ${yesNo(Boolean(role.hoist))}`,
          `<a:VC_Mention:1482526855289634997> **Menzionabile:** ${yesNo(Boolean(role.mentionable))}`,
        );
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "mentionable"]));

        const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("<:VC_Color:1482532543273238569> Ruolo Eliminato")
        .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleRoleDeletionAction({ guild, executorId, roleName: String(role.name || ""), roleId: String(role.id || "") });
    } catch (error) {
      global.logger?.error?.("[roleDelete] failed:", error);
    }

    if (client) {
      queueIdsCatalogSync(client, guildId, "roleDelete");
      try {
        const { getMainGuildId } = require("../Utils/Config/testGuildMirrorRemap") as typeof import("../Utils/Config/testGuildMirrorRemap");
        if (String(guildId) === String(getMainGuildId() || "")) {
          const { mirrorMainRoleDeleteToTest } = require("../Partner/services/testGuildMirrorSyncService") as typeof import("../Partner/services/testGuildMirrorSyncService");
          void mirrorMainRoleDeleteToTest(client, role).catch((err?) => {
            global.logger?.warn?.("[roleDelete] test mirror:", err?.message || err);
          });
        }
      } catch (eMirror) {
        global.logger?.warn?.("[roleDelete] test mirror hook:", eMirror?.message || eMirror);
      }
    }
  },
};