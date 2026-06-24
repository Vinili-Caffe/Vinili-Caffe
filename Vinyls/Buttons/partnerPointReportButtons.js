const { MessageFlags } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { removePartnerPoints, formatPartnerPointsChange } = require("../Utils/Staff/partnerPointsUtils");
const { memberIsHighStaffForPointReview } = require("../Utils/Partner/partnerPointContextUtils");

const PREFIX_OK = "partner_pt_ok:";
const PREFIX_NO = "partner_pt_no:";
const EPHEMERAL = MessageFlags.Ephemeral;

function parseReportButton(customId, prefix) {
  const raw = String(customId || "");
  if (!raw.startsWith(prefix)) return null;
  const parts = raw.split(":");
  const pmUserId = String(parts[1] || "").trim();
  const reporterUserId = String(parts[2] || "").trim();
  if (!/^\d{16,20}$/.test(pmUserId)) return null;
  if (!/^\d{16,20}$/.test(reporterUserId)) return null;
  return { pmUserId, reporterUserId };
}

function disableRows(components) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row) => {
    const comps = Array.isArray(row?.components) ? row.components : [];
    return {
      type: row.type,
      components: comps.map((c) => ({
        type: c.type,
        style: c.style,
        label: c.label,
        custom_id: c.customId || c.custom_id,
        disabled: true,
      })),
    };
  });
}

module.exports = {
  name: "partnerPointReportButtons",
  order: 40,
  match(interaction) {
    const id = String(interaction?.customId || "");
    return interaction?.isButton?.() && (id.startsWith(PREFIX_OK) || id.startsWith(PREFIX_NO));
  },
  async execute(interaction) {
    if (!interaction.guild || !interaction.member) return true;
    if (!memberIsHighStaffForPointReview(interaction.member)) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> Solo l'High Staff può gestire le segnalazioni.",
        flags: EPHEMERAL,
      });
      return true;
    }
    const isConfirm = String(interaction.customId || "").startsWith(PREFIX_OK);
    const parsed = parseReportButton(interaction.customId, isConfirm ? PREFIX_OK : PREFIX_NO);
    if (!parsed) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Pulsante non valido.", flags: EPHEMERAL });
      return true;
    }
    const originalContent = String(interaction.message?.content || "");
    const statusLine = isConfirm
      ? `<:success:1461731530333229226> Rimozione **confermata** da <@${interaction.user.id}> (<t:${Math.floor(Date.now() / 1000)}:f>).`
      : `<:cancel:1461730653677551691> Segnalazione **negata** da <@${interaction.user.id}> (<t:${Math.floor(Date.now() / 1000)}:f>).`;
    const nextContent = originalContent
      .replace(/\n?<:VC_Attention:1482534443632558151> In attesa di conferma High Staff\.\s*$/i, "")
      .trim();
    const updatedContent = `${nextContent}\n${statusLine}`;
    if (isConfirm) {
      const pmMember = await interaction.guild.members.fetch(parsed.pmUserId).catch(() => null);
      if (!pmMember?.roles?.cache?.has?.(IDs.roles?.PartnerManager)) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> L'utente non è più Partner Manager.",
          flags: EPHEMERAL,
        });
        return true;
      }
      const staffData = await removePartnerPoints(interaction.guild.id, parsed.pmUserId, 1);
      if (!staffData) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> Impossibile aggiornare i punti partner.",
          flags: EPHEMERAL,
        });
        return true;
      }
      await interaction.message
        ?.edit({ content: updatedContent, components: disableRows(interaction.message.components) })
        .catch(() => null);
      const changeLabel = formatPartnerPointsChange("remove", 1);
      const total = staffData?.staff?.partnerCount ?? 0;
      await interaction.reply({
        content: `<:success:1461731530333229226> **${changeLabel}** a <@${parsed.pmUserId}>. Totale: \`${total}\`.`,
        flags: EPHEMERAL,
      });
      return true;
    }
    await interaction.message
      ?.edit({ content: updatedContent, components: disableRows(interaction.message.components) })
      .catch(() => null);
    await interaction.reply({
      content: "<:success:1461731530333229226> Segnalazione negata.",
      flags: EPHEMERAL,
    });
    return true;
  },
};