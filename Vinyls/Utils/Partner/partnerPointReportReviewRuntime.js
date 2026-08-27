const { removePartnerPoints, formatPartnerPointsChange } = require("../Staff/partnerPointsUtils");
const { resolvePartnerTotalEarned, resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils");
const { memberHasPartnerManagerRole } = require("./partnershipConfigResolver");
const {
  disableRows,
  buildReviewStatusLine,
  buildUpdatedLogContent,
} = require("./pmPointsRemovedReviewHelpers");
const {
  findPmPointsRemovedEntry,
  reviewPmPointsRemovedEntry,
} = require("./pmPointsRemovedStore");

async function reviewPartnerPointReport({
  guild,
  message,
  entryId = null,
  isConfirm,
  reviewerUserId,
  pmUserId,
  reporterUserId = null,
}) {
  const ref = entryId || message?.id;
  const mongoEntry = await findPmPointsRemovedEntry(guild?.id, ref);
  if (mongoEntry) {
    return reviewPmPointsRemovedEntry({
      guild,
      entryRef: mongoEntry,
      isConfirm,
      reviewerUserId,
    });
  }

  if (!guild?.id || !message?.id) {
    return { ok: false, error: "invalid_message", message: "Segnalazione non valida." };
  }
  const pmId = String(pmUserId || "").trim();
  if (!/^\d{16,20}$/.test(pmId)) {
    return { ok: false, error: "invalid_pm", message: "Partner Manager non valido." };
  }

  const originalContent = String(message.content || "");
  const updatedContent = buildUpdatedLogContent(originalContent, isConfirm, reviewerUserId);

  if (isConfirm) {
    const pmMember = await guild.members.fetch(pmId).catch(() => null);
    if (!memberHasPartnerManagerRole(pmMember, guild.id)) {
      return {
        ok: false,
        error: "not_pm",
        message: "L'utente non è più Partner Manager.",
      };
    }
    const staffData = await removePartnerPoints(guild.id, pmId, 1);
    if (!staffData) {
      return {
        ok: false,
        error: "points_failed",
        message: "Impossibile aggiornare i punti partner.",
      };
    }
    await message
      .edit({ content: updatedContent, components: disableRows(message.components) })
      .catch(() => null);
    const changeLabel = formatPartnerPointsChange("remove", staffData?._partnerPointsRemoved ?? 1);
    const total = resolvePartnerTotalEarned(staffData?.staff);
    const spendable = resolvePartnerPointsShown(staffData?.staff);
    const saldoHint = Number(spendable) !== Number(total) ? ` · Saldo shop: \`${spendable}\`` : "";
    try {
      const { notifyPuntiToltiReviewed, notifyPuntiToltiPointsRemoved } = require("../Web/siteStaffEventNotifications");
      const reporterId = String(reporterUserId || "").trim();
      if (/^\d{16,22}$/.test(reporterId)) {
        void notifyPuntiToltiReviewed({
          guild,
          reporterUserId: reporterId,
          pmUserId: pmId,
          isConfirm: true,
          messageId: message.id,
        }).catch(() => 0);
      }
      void notifyPuntiToltiPointsRemoved({
        guild,
        pmUserId: pmId,
        actorName: "High Staff",
        dedupeKey: `pt-confirm:${message.id}`,
      }).catch(() => 0);
    } catch (_) {}
    return {
      ok: true,
      action: "confirm",
      message: `**${changeLabel}** a <@${pmId}>. Totale: \`${total}\`${saldoHint}.`,
      pmUserId: pmId,
      total,
      spendable,
    };
  }

  await message
    .edit({ content: updatedContent, components: disableRows(message.components) })
    .catch(() => null);
  try {
    const { notifyPuntiToltiReviewed } = require("../Web/siteStaffEventNotifications");
    const reporterId = String(reporterUserId || "").trim();
    if (/^\d{16,22}$/.test(reporterId)) {
      void notifyPuntiToltiReviewed({
        guild,
        reporterUserId: reporterId,
        pmUserId: pmId,
        isConfirm: false,
        messageId: message.id,
      }).catch(() => 0);
    }
  } catch (_) {}
  return {
    ok: true,
    action: "deny",
    message: "Segnalazione negata.",
    pmUserId: pmId,
  };
}

module.exports = {
  disableRows,
  buildReviewStatusLine,
  buildUpdatedLogContent,
  reviewPartnerPointReport,
};
