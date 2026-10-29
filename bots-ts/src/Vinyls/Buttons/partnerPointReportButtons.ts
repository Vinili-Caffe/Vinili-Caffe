const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { memberIsHighStaffForPointReview } = require("../Utils/Partner/partnerPointContextUtils") as typeof import("../Utils/Partner/partnerPointContextUtils");
const { reviewPartnerPointReport } = require("../Utils/Partner/partnerPointReportReviewRuntime") as typeof import("../Utils/Partner/partnerPointReportReviewRuntime");

const PREFIX_OK = "partner_pt_ok:";
const PREFIX_NO = "partner_pt_no:";
const EPHEMERAL = MessageFlags.Ephemeral;

function parseReportButton(customId?, prefix?) {
  const raw = String(customId || "");
  if (!raw.startsWith(prefix)) return null;
  const parts = raw.split(":");
  const pmUserId = String(parts[1] || "").trim();
  const reporterUserId = String(parts[2] || "").trim();
  if (!/^\d{16,20}$/.test(pmUserId)) return null;
  if (!/^\d{16,20}$/.test(reporterUserId)) return null;
  return { pmUserId, reporterUserId };
}

export = {
  name: "partnerPointReportButtons",
  order: 40,
  match(interaction?) {
    const id = String(interaction?.customId || "");
    return interaction?.isButton?.() && (id.startsWith(PREFIX_OK) || id.startsWith(PREFIX_NO));
  },
  async execute(interaction?) {
    if (!interaction.guild || !interaction.member) return true;
    if (!memberIsHighStaffForPointReview(interaction.member)) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> Solo High Staff o gestore PM può gestire le segnalazioni.",
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
    const result = await reviewPartnerPointReport({
      guild: interaction.guild,
      message: interaction.message,
      entryId: interaction.message?.id,
      isConfirm,
      reviewerUserId: String(interaction.user.id),
      pmUserId: parsed.pmUserId,
      reporterUserId: parsed.reporterUserId,
    });
    if (!result.ok) {
      await interaction.reply({
        content: `<a:VC_Cross:1482532424570376253> ${result.message || "Operazione non riuscita."}`,
        flags: EPHEMERAL,
      });
      return true;
    }
    await interaction.reply({
      content: `<:success:1461731530333229226> ${result.message || "Fatto."}`,
      flags: EPHEMERAL,
    });
    return true;
  },
};