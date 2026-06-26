const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { removePartnerPoints, formatPartnerPointsChange } = require("../../Utils/Staff/partnerPointsUtils");
const { buildPartnershipMessageLink, buildPartnerPointLogContent, getPartnerPointHighStaffPingRoleIds, parsePartnerPointModalId } = require("../../Utils/Partner/partnerPointContextUtils");

const IN_RULE = "regolaViolata";
const EPHEMERAL = MessageFlags.Ephemeral;

function getModalText(interaction, customId) {
  return String(interaction.fields?.getTextInputValue?.(customId) || "").trim();
}

async function handlePartnerSegnalaModal(interaction) {
  const parsed = parsePartnerPointModalId(interaction.customId, "partner_segnala_m:");
  if (!parsed) return false;
  if (String(interaction.user.id) !== parsed.actorId) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto la segnalazione può inviarla.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const rule = getModalText(interaction, IN_RULE);
  if (!rule) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Indica la regola violata.", flags: EPHEMERAL });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) return true;
  const pmMember = await guild.members.fetch(parsed.pmUserId).catch(() => null);
  if (!pmMember?.roles?.cache?.has?.(IDs.roles?.PartnerManager)) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const logChannel =
    guild.channels.cache.get(IDs.channels?.puntiTolti) ||
    (await getGuildChannelCached(guild, IDs.channels?.puntiTolti));
  if (!logChannel?.isTextBased?.()) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Canale punti tolti non disponibile.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const messageLink = buildPartnershipMessageLink(guild.id, parsed.channelId, parsed.partnershipMsgId);
  const content = buildPartnerPointLogContent({
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    reporterUserId: parsed.actorId,
    pingHighStaff: true,
    statusLine: "<:VC_Attention:1482534443632558151> In attesa di conferma High Staff.",
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partner_pt_ok:${parsed.pmUserId}:${parsed.actorId}`)
      .setLabel("Conferma rimozione")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`partner_pt_no:${parsed.pmUserId}:${parsed.actorId}`)
      .setLabel("Nega segnalazione")
      .setStyle(ButtonStyle.Secondary),
  );
  await logChannel
    .send({
      content,
      components: [row],
      allowedMentions: { roles: getPartnerPointHighStaffPingRoleIds() },
    })
    .catch(() => null);
  await interaction.reply({
    content: "<:success:1461731530333229226> Segnalazione inviata in <#" + String(IDs.channels?.puntiTolti || "") + ">.",
    flags: EPHEMERAL,
  });
  return true;
}

async function handlePartnerRimuoviModal(interaction) {
  const parsed = parsePartnerPointModalId(interaction.customId, "partner_rimuovi_m:");
  if (!parsed) return false;
  if (String(interaction.user.id) !== parsed.actorId) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto la rimozione può confermarla.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const rule = getModalText(interaction, IN_RULE);
  if (!rule) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Indica la regola violata.", flags: EPHEMERAL });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) return true;
  const pmMember = await guild.members.fetch(parsed.pmUserId).catch(() => null);
  if (!pmMember?.roles?.cache?.has?.(IDs.roles?.PartnerManager)) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const staffData = await removePartnerPoints(guild.id, parsed.pmUserId, 1);
  if (!staffData) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Impossibile aggiornare i punti partner.",
      flags: EPHEMERAL,
    });
    return true;
  }
  const logChannel =
    guild.channels.cache.get(IDs.channels?.puntiTolti) ||
    (await getGuildChannelCached(guild, IDs.channels?.puntiTolti));
  const messageLink = buildPartnershipMessageLink(guild.id, parsed.channelId, parsed.partnershipMsgId);
  const content = buildPartnerPointLogContent({
    pmUserId: parsed.pmUserId,
    rule,
    messageLink,
    actorUserId: parsed.actorId,
  });
  if (logChannel?.isTextBased?.()) {
    await logChannel.send({ content }).catch(() => null);
  }
  const changeLabel = formatPartnerPointsChange("remove", 1);
  const total = staffData?.staff?.partnerCount ?? 0;
  await interaction.reply({
    content: `<:success:1461731530333229226> **${changeLabel}** a <@${parsed.pmUserId}>. Totale: \`${total}\`.`,
    flags: EPHEMERAL,
  });
  return true;
}

async function handlePartnerPointContextModal(interaction) {
  if (!interaction?.isModalSubmit?.()) return false;
  const id = String(interaction.customId || "");
  if (id.startsWith("partner_segnala_m:")) return handlePartnerSegnalaModal(interaction);
  if (id.startsWith("partner_rimuovi_m:")) return handlePartnerRimuoviModal(interaction);
  return false;
}

module.exports = {
  handlePartnerPointContextModal,
  parsePartnerPointModalId,
};