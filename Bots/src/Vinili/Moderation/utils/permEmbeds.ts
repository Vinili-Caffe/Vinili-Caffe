/** Permessi: messaggi di accesso negato. */
const { normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { HIGH_STAFF_COMMANDS_ZONE_TOKEN, PM_COMMANDS_THREAD_ZONE_TOKEN } = require("./permReferences") as typeof import("./permReferences");
const { createPermissionDeniedEmbeds } = require("../../../shared/moderation/createPermissionDeniedEmbeds") as typeof import("../../../shared/moderation/createPermissionDeniedEmbeds");
const { memberCanViewChannel } = require("../../../shared/discord/visibleChannelMentions") as typeof import("../../../shared/discord/visibleChannelMentions");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
} = createPermissionDeniedEmbeds({
  color: "#6f4e37",
  normalizeRoleList,
  enrichChannelDeniedEmbed: ({ embed, rawIds, viewer }) => {
    const { staffCmdsChannelId } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
    const staffCmdsId = staffCmdsChannelId();
    const canSeeStaffCmds = Boolean(staffCmdsId && memberCanViewChannel(viewer, staffCmdsId));
    const hasHighStaffZone = rawIds.some((id?) => String(id) === HIGH_STAFF_COMMANDS_ZONE_TOKEN);
    const hasPmZone = rawIds.some((id?) => String(id) === PM_COMMANDS_THREAD_ZONE_TOKEN);
    const hasNumericChannels = rawIds.some((id?) => /^\d{5,30}$/.test(String(id || "").trim()));

    if (hasHighStaffZone && canSeeStaffCmds) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Arrow} Usa il comando nel thread **Comandi High Staff** sotto #staff-cmds.`,
      });
      return true;
    }
    if (hasPmZone && canSeeStaffCmds) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Arrow} Usa il comando nel thread **Comandi Partner Manager** sotto #staff-cmds.`,
      });
      return true;
    }
    if (hasNumericChannels || hasHighStaffZone || hasPmZone) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Arrow} Usa il comando in un canale consentito a cui hai accesso.`,
      });
      return true;
    }
    return false;
  },
});

export = { buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed };
