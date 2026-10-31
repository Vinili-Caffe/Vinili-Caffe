/** Bacheche: revisione dello staff (elenco in attesa, approva/rifiuta). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { assertWebsiteStaffAccess } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { sanitizeText } = require("./boardSanitize") as typeof import("./boardSanitize");
const { BL, emitBoardsChanged, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { refreshListingStats } = require("./boardStats") as typeof import("./boardStats");
const { serializeListing } = require("./boardInvites") as typeof import("./boardInvites");

async function enrichListingAuthor(client?, listing?) {
  if (!listing || !listing.ownerUserId) return listing;
  if (listing.authorAvatarUrl && listing.authorName) return listing;
  try {
    const u =
      client?.users?.cache?.get(listing.ownerUserId) ||
      (await client?.users?.fetch?.(listing.ownerUserId).catch(() => null));
    if (!u) return listing;
    if (!listing.authorName) {
      listing.authorName = String(u.globalName || u.username || "").trim();
    }
    if (!listing.authorAvatar && u.avatar) {
      listing.authorAvatar = String(u.avatar);
    }
    if (!listing.authorAvatarUrl && u.displayAvatarURL) {
      listing.authorAvatarUrl = String(
        u.displayAvatarURL({ size: 64, extension: "png", forceStatic: false }),
      );
    } else if (!listing.authorAvatarUrl && listing.authorAvatar) {
      const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
      listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${listing.ownerUserId}/${listing.authorAvatar}.${ext}?size=64`;
    }
  } catch (_) {}
  return listing;
}

function assertBoardsModHighStaff(staff?) {
  if (!staff?.ok) {
    return {
      ok: false,
      status: Number(staff?.status) || 403,
      error: staff?.error || "forbidden",
      message: staff?.message || "Accesso staff richiesto.",
    };
  }
  /* boardsRevHsOnly1: moderazione bacheca solo High Staff */
  if (!memberIsHighStaffEligible(staff.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo High Staff.",
    };
  }
  return null;
}

async function modListPending(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const status = String(payload.status || "pending").trim() || "pending";
  const kind = String(payload.kind || payload.filter || "").trim().toLowerCase();
  const filter: Record<string, any> = { docType: BL };
  if (status === "all") {
    filter.status = { $nin: ["draft"] };
  } else if (status === "draft") {
    filter.status = "pending";
  } else {
    filter.status = status;
  }
  if (kind === "server" || kind === "bot") filter.boardKind = kind;
  const rows = await SiteDocument.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return { ok: true, status: 200, listings: rows.map((r?) => serializeListing(r, { includeMod: true })) };
}

/* boardsRevPreview1: staff anteprima scheda pending (anche senza slug pubblico) */
async function getListingForStaffReview(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  let listing = await enrichListingAuthor(client, serializeListing(doc, { includeMod: true }));
  listing = await refreshListingStats(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    review: true,
    publicOpen: gate.cfg.publicOpen,
  };
}

async function modDecide(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const id = String(payload.listingId || payload.id || "").trim();
  const decision = String(payload.decision || "").trim().toLowerCase();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  if (!["approve", "reject", "suspend"].includes(decision)) {
    return { ok: false, status: 400, error: "invalid_decision", message: "decision: approve|reject|suspend." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  const next =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "suspended";
  doc.status = next;
  doc.decidedAt = new Date();
  doc.staffReason = sanitizeText(payload.reason, 1000);
  const mod = doc.boardModeration && typeof doc.boardModeration === "object" ? { ...doc.boardModeration } : {};
  mod.reviewedBy = String(staff.member?.id || staff.user?.id || "").trim();
  mod.reviewedAt = new Date().toISOString();
  mod.notes = sanitizeText(payload.notes, 1000);
  mod.rejectReason = doc.staffReason;
  doc.boardModeration = mod;
  await doc.save();
  try {
    const { onBoardsListingDecided } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    const decidedBy = String(staff.member?.id || staff.user?.id || "").trim();
    const decidedByName = String(
      staff.member?.displayName || staff.user?.globalName || staff.user?.username || "",
    ).trim();
    void onBoardsListingDecided(client, doc, {
      decision,
      reason: doc.staffReason,
      decidedBy,
      decidedByName,
      notifyOwner: true,
    }).catch(() => null);
  } catch (_) {}
  emitBoardsChanged(decision === "approved" ? "mod_approve" : "mod_reject", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

export = { enrichListingAuthor, modListPending, getListingForStaffReview, modDecide };
