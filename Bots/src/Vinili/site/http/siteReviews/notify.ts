const { enqueueSiteInAppNotification } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
const { getHighStaffUserIds } = require("./staffTargets") as typeof import("./staffTargets");
const { reviewNotifOpenUrl } = require("./helpers") as typeof import("./helpers");

async function notifyHighStaffNewReview(guild?, review?, authorName?) {
  const rid = String(review?._id || "").trim();
  const kind = String(review?.reviewKind || "server");
  /* staffReviewTargetOnly1: recensioni staff → solo lo staffer recensito
     (notifyReviewedStafferNewReview), niente broadcast High Staff. */
  if (kind === "staff") return;
  const isBot = kind === "bot";
  const title = isBot ? "Nuova recensione bot" : "Nuova recensione community";
  const body = isBot
    ? `${authorName || "Un utente"} ha pubblicato una recensione del bot.`
    : `${authorName || "Un utente"} ha pubblicato una recensione della community.`;
  const userIds = await getHighStaffUserIds(guild);
  for (const userId of userIds) {
    try {
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId,
        title,
        body,
        kind: "review",
        channel: "inbox",
        openUrl: reviewNotifOpenUrl(rid, kind),
        dedupeKey: `rev-new:${rid}:${userId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }
}

/** reviewsStaffReply1: the reviewed staffer gets an Inbox ping for their own review. */
async function notifyReviewedStafferNewReview(guild?, review?, authorName?) {
  const rid = String(review?._id || "").trim();
  const kind = String(review?.reviewKind || "").trim().toLowerCase();
  if (kind !== "staff") return;
  const staffUserId = String(review?.staffUserId || "").trim();
  if (!staffUserId || !/^\d{5,32}$/.test(staffUserId)) return;
  try {
    await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId: staffUserId,
      title: "Nuova recensione su di te",
      body: `${authorName || "Un utente"} ti ha lasciato una recensione.`,
      kind: "review",
      channel: "inbox",
      openUrl: reviewNotifOpenUrl(rid, "staff", { stafferId: staffUserId }),
      dedupeKey: `rev-staff-target:${rid}`,
      dedupeWindowMs: 86_400_000,
    });
  } catch (_) {}
}

export = { notifyHighStaffNewReview, notifyReviewedStafferNewReview };
