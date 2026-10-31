/** Permessi: messaggi di accesso negato. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { HIGH_STAFF_COMMANDS_ZONE_TOKEN, PM_COMMANDS_THREAD_ZONE_TOKEN } = require("./permReferences") as typeof import("./permReferences");

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = "comando", customDescription = null, guild = null) {
  const roles = normalizeRoleList(Array.isArray(requiredRoleIds) ? requiredRoleIds : []);
  void guild;
  const rolesText = roles.length
    ? roles.map((id?) => `<@&${id}>`).join(", ")
    : "<:VC_Attention:1482534443632558151> Nessun ruolo configurato.";
  const description =
    customDescription != null
      ? customDescription
      : `<:VC_Lock:1482526739044368476> Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(description);
  if (roles.length > 0) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Ottieni uno dei seguenti ruoli: ${rolesText}`,
    });
  }
  return embed;
}

function buildGlobalChannelDeniedEmbed(allowedChannelIds = [], entityLabel = "comando", viewer = null) {
  const { formatVisibleChannelMentionsList, memberCanViewChannel } = require("../Discord/visibleChannelMentions") as typeof import("../Discord/visibleChannelMentions");
  const { staffCmdsChannelId } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
  const rawIds = Array.isArray(allowedChannelIds) ? allowedChannelIds : [];
  const channelsText = formatVisibleChannelMentionsList(rawIds, viewer, {
    sep: ", ",
    emptyFallback: "",
  });
  const hasVisibleChannels = Boolean(channelsText);
  const staffCmdsId = staffCmdsChannelId();
  const canSeeStaffCmds = Boolean(staffCmdsId && memberCanViewChannel(viewer, staffCmdsId));
  const hasHighStaffZone = rawIds.some((id?) => String(id) === HIGH_STAFF_COMMANDS_ZONE_TOKEN);
  const hasPmZone = rawIds.some((id?) => String(id) === PM_COMMANDS_THREAD_ZONE_TOKEN);
  const hasNumericChannels = rawIds.some((id?) => /^\d{5,30}$/.test(String(id || "").trim()));

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(`<:VC_Lock:1482526739044368476> Questo ${entityLabel} è disponibile solo in canali specifici.`);
  if (hasVisibleChannels) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Usa il comando in uno dei seguenti canali: ${channelsText}`,
    });
  } else if (hasHighStaffZone && canSeeStaffCmds) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi High Staff** sotto #staff-cmds.",
    });
  } else if (hasPmZone && canSeeStaffCmds) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi Partner Manager** sotto #staff-cmds.",
    });
  } else if (hasNumericChannels || hasHighStaffZone || hasPmZone) {
        embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando in un canale consentito a cui hai accesso.",
    });
  } else {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<:VC_Attention:1482534443632558151> Nessun canale configurato.",
    });
  }
  return embed;
}

function buildGlobalNotYourControlEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Accesso negato**")
    .setDescription("<:VC_Attention:1482534443632558151> Questo controllo non è associato al tuo comando.");
}

export = { buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed };
