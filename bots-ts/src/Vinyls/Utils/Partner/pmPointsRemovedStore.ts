const {
  SitePmPointsRemovedEntry,
} = require("../../Schemas/Web/sitePmPointsRemovedSchemas") as typeof import("../../Schemas/Web/sitePmPointsRemovedSchemas");
const { removePartnerPoints, formatPartnerPointsChange } = require("../Staff/partnerPointsUtils") as typeof import("../Staff/partnerPointsUtils");
const { resolvePartnerTotalEarned, resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils") as typeof import("../Staff/partnerPointsDisplayUtils");
const { memberHasPartnerManagerRole } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const {
  buildReviewStatusLine,
  buildUpdatedLogContent,
  disableRows,
} = require("./pmPointsRemovedReviewHelpers") as typeof import("./pmPointsRemovedReviewHelpers");

function entryMessageId(doc?) {
  return String(doc?._id || doc?.id || "");
}

function entryCanReview(doc?) {
  return String(doc?.status || "") === "pending";
}

function docToApiItem(doc?) {
  const messageId = entryMessageId(doc);
  const guildId = String(doc?.guildId || "");
  const channelId = String(doc?.discordChannelId || "");
  const discordMessageId = String(doc?.discordMessageId || "");
  return {
    messageId,
    channelId,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    pmUserId: String(doc?.pmUserId || ""),
    rule: String(doc?.rule || ""),
    messageLink: doc?.messageLink || null,
    invite: doc?.invite || null,
    reporterUserId: doc?.reporterUserId || null,
    actorUserId: doc?.actorUserId || null,
    status: String(doc?.status || "logged"),
    canReview: entryCanReview(doc),
    reviewPmUserId: String(doc?.pmUserId || ""),
    reviewReporterUserId: doc?.reporterUserId || null,
    discordMessageUrl:
      guildId && channelId && discordMessageId
        ? `https://discord.com/channels/${guildId}/${channelId}/${discordMessageId}`
        : null,
  };
}

async function createPmPointsRemovedEntry(payload?) {
  const guildId = String(payload?.guildId || "").trim();
  const pmUserId = String(payload?.pmUserId || "").trim();
  if (!guildId || !/^\d{16,22}$/.test(pmUserId)) return null;

  const status = String(payload?.status || "logged");
  const doc = await SitePmPointsRemovedEntry.create({
    guildId,
    pmUserId,
    rule: String(payload?.rule || "").trim(),
    messageLink: payload?.messageLink || null,
    invite: payload?.invite || null,
    reporterUserId: payload?.reporterUserId || null,
    actorUserId: payload?.actorUserId || null,
    status,
    source: String(payload?.source || "logged"),
    discordMessageId: payload?.discordMessageId || null,
    discordChannelId: payload?.discordChannelId || null,
  }).catch((err?) => {
    if (String(err?.code) === "11000" && payload?.discordMessageId) {
      return SitePmPointsRemovedEntry.findOne({
        guildId,
        discordMessageId: String(payload.discordMessageId),
      }).lean();
    }
    global.logger?.warn?.("[pmPointsRemovedStore] create failed:", err?.message || err);
    return null;
  });

  return doc?.toObject ? doc.toObject() : doc;
}

async function attachDiscordMirror(entryId?, { discordMessageId, discordChannelId } = {}) {
  const id = String(entryId || "").trim();
  const msgId = String(discordMessageId || "").trim();
  if (!id || !msgId) return null;
  const $set: Record<string, any> = { discordMessageId: msgId };
  if (discordChannelId) $set.discordChannelId = String(discordChannelId);
  return SitePmPointsRemovedEntry.findByIdAndUpdate(id, { $set }, { new: true }).lean().catch(() => null);
}

async function findPmPointsRemovedEntry(guildId?, ref?) {
  const gid = String(guildId || "").trim();
  const raw = String(ref || "").trim();
  if (!gid || !raw) return null;
  if (/^[a-f0-9]{24}$/i.test(raw)) {
    return SitePmPointsRemovedEntry.findOne({ _id: raw, guildId: gid }).lean().catch(() => null);
  }
  if (/^\d{16,22}$/.test(raw)) {
    return SitePmPointsRemovedEntry.findOne({ guildId: gid, discordMessageId: raw }).lean().catch(() => null);
  }
  return null;
}

async function listPmPointsRemovedEntries({
  guildId,
  limit = 25,
  before = null,
  pendingOnly = false,
  pmUserId = null,
  q = null,
} = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return { items: [], hasMore: false, nextBefore: null };

  const query: Record<string, any> = { guildId: gid };
  if (pendingOnly) query.status = "pending";
  if (pmUserId && /^\d{16,22}$/.test(String(pmUserId))) query.pmUserId = String(pmUserId);
  if (q) {
    const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ rule: re }, { invite: re }, { pmUserId: re }];
  }

  const beforeRef = String(before || "").trim();
  if (beforeRef) {
    const beforeDoc = await findPmPointsRemovedEntry(gid, beforeRef);
    if (beforeDoc?.createdAt) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { createdAt: { $lt: new Date(beforeDoc.createdAt) } },
          { createdAt: beforeDoc.createdAt, _id: { $lt: beforeDoc._id } },
        ],
      });
    }
  }

  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit) || 25)));
  const docs = await SitePmPointsRemovedEntry.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .lean()
    .catch(() => []);

  const hasMore = docs.length > lim;
  const slice = hasMore ? docs.slice(0, lim) : docs;
  const nextBefore = slice.length ? entryMessageId(slice[slice.length - 1]) : null;
  return {
    items: slice.map(docToApiItem),
    hasMore,
    nextBefore,
  };
}

async function syncDiscordReviewMessage(guild?, entry?, isConfirm?, reviewerUserId?) {
  const channelId = String(entry?.discordChannelId || "").trim();
  const messageId = String(entry?.discordMessageId || "").trim();
  if (!guild || !channelId || !messageId) return;
  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.messages?.fetch) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.id) return;
  const updatedContent = buildUpdatedLogContent(String(message.content || ""), isConfirm, reviewerUserId);
  await message
    .edit({ content: updatedContent, components: disableRows(message.components) })
    .catch(() => null);
}

async function reviewPmPointsRemovedEntry({ guild, entryRef, isConfirm, reviewerUserId }) {
  const entry = typeof entryRef === "object" && entryRef?._id
    ? entryRef
    : await findPmPointsRemovedEntry(guild?.id, entryRef);
  if (!entry?._id) {
    return { ok: false, error: "not_found", message: "Segnalazione non trovata." };
  }
  if (String(entry.status || "") !== "pending") {
    return { ok: false, error: "not_pending", message: "Questa segnalazione non è più in attesa." };
  }

  const pmId = String(entry.pmUserId || "").trim();
  const reviewerId = String(reviewerUserId || "").trim();

  if (isConfirm) {
    const pmMember = await guild.members.fetch(pmId).catch(() => null);
    if (!memberHasPartnerManagerRole(pmMember, guild.id)) {
      return { ok: false, error: "not_pm", message: "L'utente non è più Partner Manager." };
    }
    const staffData = await removePartnerPoints(guild.id, pmId, 1);
    if (!staffData) {
      return { ok: false, error: "points_failed", message: "Impossibile aggiornare i punti partner." };
    }
    await SitePmPointsRemovedEntry.updateOne(
      { _id: entry._id },
      {
        $set: {
          status: "confirmed",
          reviewerUserId: reviewerId,
          reviewedAt: new Date(),
        },
      },
    ).catch(() => null);
    await syncDiscordReviewMessage(guild, entry, true, reviewerId);
    const changeLabel = formatPartnerPointsChange("remove", staffData?._partnerPointsRemoved ?? 1);
    const total = resolvePartnerTotalEarned(staffData?.staff);
    const spendable = resolvePartnerPointsShown(staffData?.staff);
    const saldoHint = Number(spendable) !== Number(total) ? ` · Saldo shop: \`${spendable}\`` : "";
    try {
      const { notifyPuntiToltiReviewed, notifyPuntiToltiPointsRemoved } = require("../Web/siteStaffEventNotifications") as typeof import("../Web/siteStaffEventNotifications");
      const reporterId = String(entry.reporterUserId || "").trim();
      if (/^\d{16,22}$/.test(reporterId)) {
        void notifyPuntiToltiReviewed({
          guild,
          reporterUserId: reporterId,
          pmUserId: pmId,
          isConfirm: true,
          messageId: entryMessageId(entry),
        }).catch(() => 0);
      }
      void notifyPuntiToltiPointsRemoved({
        guild,
        pmUserId: pmId,
        actorName: "High Staff",
        dedupeKey: `pt-confirm:${entryMessageId(entry)}`,
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

  await SitePmPointsRemovedEntry.updateOne(
    { _id: entry._id },
    {
      $set: {
        status: "denied",
        reviewerUserId: reviewerId,
        reviewedAt: new Date(),
      },
    },
  ).catch(() => null);
  await syncDiscordReviewMessage(guild, entry, false, reviewerId);
  try {
    const { notifyPuntiToltiReviewed } = require("../Web/siteStaffEventNotifications") as typeof import("../Web/siteStaffEventNotifications");
    const reporterId = String(entry.reporterUserId || "").trim();
    if (/^\d{16,22}$/.test(reporterId)) {
      void notifyPuntiToltiReviewed({
        guild,
        reporterUserId: reporterId,
        pmUserId: pmId,
        isConfirm: false,
        messageId: entryMessageId(entry),
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

async function logPmPointsRemoved({
  guild,
  pmUserId,
  rule,
  messageLink = null,
  invite = null,
  reporterUserId = null,
  actorUserId = null,
  status = "logged",
  source = "logged",
  mirrorChannel = null,
  mirrorContent = null,
  mirrorComponents = null,
  mirrorAllowedMentions = undefined,
}) {
  if (!guild?.id) return null;
  const entry = await createPmPointsRemovedEntry({
    guildId: guild.id,
    pmUserId,
    rule,
    messageLink,
    invite,
    reporterUserId,
    actorUserId,
    status,
    source,
  });
  if (!entry) return null;
  if (mirrorChannel?.isTextBased?.() && mirrorContent) {
    const { isDiscordStaffChannelPostsEnabled } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
    if (!isDiscordStaffChannelPostsEnabled()) return entry;
    const sendOpts: Record<string, any> = { content: mirrorContent, __skipNoticeEmbed: true };
    if (Array.isArray(mirrorComponents) && mirrorComponents.length) sendOpts.components = mirrorComponents;
    if (mirrorAllowedMentions !== undefined) sendOpts.allowedMentions = mirrorAllowedMentions;
    const sent = await mirrorChannel.send(sendOpts).catch(() => null);
    if (sent?.id) {
      return attachDiscordMirror(entryMessageId(entry), {
        discordMessageId: sent.id,
        discordChannelId: sent.channelId || mirrorChannel.id,
      });
    }
  }
  return entry;
}

export = {
  docToApiItem,
  createPmPointsRemovedEntry,
  attachDiscordMirror,
  findPmPointsRemovedEntry,
  listPmPointsRemovedEntries,
  reviewPmPointsRemovedEntry,
  logPmPointsRemoved,
  entryMessageId,
};
