/**
 * Coda segnalazioni schede Vetrina (staff).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { assertWebsiteStaffAccess } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
const { BL, BR, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { sanitizeText } = require("./boardSanitize") as typeof import("./boardSanitize");

const CATEGORIES = new Set(["spam", "scam", "nsfw", "wrong_info", "impersonation", "other"]);

function assertBoardsModHighStaff(staff?) {
  if (!staff?.ok) {
    return {
      ok: false,
      status: Number(staff?.status) || 403,
      error: staff?.error || "forbidden",
      message: staff?.message || "Accesso staff richiesto.",
    };
  }
  if (!memberIsHighStaffEligible(staff.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Serve high staff." };
  }
  return null;
}

function categoryLabel(c?) {
  const map: Record<string, string> = {
    spam: "Spam",
    scam: "Truffa / phishing",
    nsfw: "Contenuti 18+ non segnalati",
    wrong_info: "Info false o fuorvianti",
    impersonation: "Impersonificazione",
    other: "Altro",
    review: "Recensione",
  };
  return map[String(c || "")] || "Segnalazione";
}

function parseLegacyReviewContent(content?) {
  const raw = String(content || "");
  const m = raw.match(/^review:([a-f0-9]{24}):\s*([\s\S]*)$/i);
  if (!m) return null;
  return { reviewId: m[1], reason: String(m[2] || "").trim() };
}

async function listBoardReports(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const status = String(payload.status || "open").trim() || "open";
  const kind = String(payload.kind || payload.filter || "").trim().toLowerCase();
  const target = String(payload.target || payload.type || "").trim().toLowerCase(); /* listing | review | "" */
  const filter: Record<string, any> = { docType: BR };
  /* include status null/assente (documenti vecchi o create incomplete) */
  if (status === "open") {
    filter.$or = [{ status: { $in: ["open", "pending", ""] } }, { status: null }, { status: { $exists: false } }];
  } else {
    filter.status = status;
  }
  const rows: any[] = await SiteDocument.find(filter).sort({ createdAt: -1 }).limit(120).lean();
  const listingIds = [...new Set(rows.map((r) => String(r.boardListingId || "")).filter((id) => mongoose.isValidObjectId(id)))];
  const listings: any[] = listingIds.length
    ? await SiteDocument.find({ _id: { $in: listingIds }, docType: BL })
        .select({ title: 1, boardSlug: 1, boardKind: 1, boardIconUrl: 1, status: 1, userId: 1 })
        .lean()
    : [];
  const byId = new Map(listings.map((l) => [String(l._id), l]));

  let items = rows.map((r) => {
    const l = byId.get(String(r.boardListingId || ""));
    const mod = r.boardModeration && typeof r.boardModeration === "object" ? r.boardModeration : {};
    const legacy = parseLegacyReviewContent(r.content);
    const isReview =
      String(mod.reportKind || "") === "review" ||
      String(r.reportCategory || "") === "review" ||
      Boolean(mod.reviewId) ||
      Boolean(legacy);
    const reviewId = String(mod.reviewId || legacy?.reviewId || "").trim();
    const catRaw = String(r.reportCategory || "").trim();
    const cat = isReview && (!catRaw || catRaw === "review") ? "other" : catRaw || "other";
    const reason = isReview && legacy ? legacy.reason : String(r.content || "");
    return {
      id: String(r._id),
      reportKind: isReview ? "review" : "listing",
      listingId: String(r.boardListingId || ""),
      listingName: String(l?.title || "Scheda rimossa"),
      listingSlug: String(l?.boardSlug || ""),
      listingKind: String(l?.boardKind || ""),
      listingIconUrl: String(l?.boardIconUrl || ""),
      listingStatus: String(l?.status || ""),
      ownerUserId: String(l?.userId || ""),
      category: isReview && catRaw === "review" ? "other" : cat,
      categoryLabel: isReview
        ? `Recensione · ${categoryLabel(catRaw === "review" ? "other" : cat)}`
        : categoryLabel(cat),
      reason,
      reviewId,
      reviewAuthor: String(mod.reviewAuthor || ""),
      reviewSnippet: String(mod.reviewSnippet || ""),
      reviewRating: Number(mod.reviewRating) || 0,
      reporterId: String(r.userId || ""),
      reporterName: String(r.authorName || ""),
      status: String(r.status || "open") || "open",
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      resolvedAt: r.updatedAt && String(r.status || "") === "resolved" ? new Date(r.updatedAt).toISOString() : null,
      staffNote: String(r.staffReason || ""),
    };
  });

  if (kind === "server" || kind === "bot") {
    items = items.filter((it) => it.listingKind === kind);
  }
  if (target === "review" || target === "listing") {
    items = items.filter((it) => it.reportKind === target);
  }

  return { ok: true, status: 200, items: items.slice(0, 80) };
}

async function resolveBoardReport(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const id = String(payload.id || payload.reportId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BR });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Segnalazione non trovata." };
  const decision = String(payload.decision || "resolve").trim();
  const action = String(payload.action || "").trim().toLowerCase();
  const note = sanitizeText(payload.note || payload.reason, 500);
  const listingId = String(doc.boardListingId || "").trim();
  const modPrev = doc.boardModeration && typeof doc.boardModeration === "object" ? doc.boardModeration : {};
  const reviewId = String(modPrev.reviewId || "").trim();
  const isReview =
    String(modPrev.reportKind || "") === "review" ||
    String(doc.reportCategory || "") === "review" ||
    Boolean(reviewId);

  let actionResult: Record<string, any> | null = null;
  let message = decision === "dismiss" ? "Segnalazione archiviata." : "Segnalazione gestita.";

  if (action === "suspend_listing") {
    if (!mongoose.isValidObjectId(listingId)) {
      return { ok: false, status: 400, error: "no_listing", message: "Scheda collegata non valida." };
    }
    const { modDecide } = require("./boardModeration") as typeof import("./boardModeration");
    const out: any = await modDecide(client, {
      accessToken: payload.accessToken,
      listingId,
      decision: "suspend",
      reason: note || "Scheda sospesa a seguito di segnalazione.",
      notes: note,
    });
    if (!out?.ok) return out;
    actionResult = { suspended: true, listingId };
    message = "Scheda sospesa e segnalazione chiusa.";
  } else if (action === "delete_review") {
    const rid = reviewId || String(payload.reviewId || "").trim();
    if (!mongoose.isValidObjectId(rid)) {
      return { ok: false, status: 400, error: "no_review", message: "Recensione collegata non trovata." };
    }
    if (!isReview && !payload.reviewId) {
      return { ok: false, status: 400, error: "not_review_report", message: "Questa segnalazione non riguarda una recensione." };
    }
    const { staffDeleteListingReview } = require("./boardReviews") as typeof import("./boardReviews");
    const out: any = await staffDeleteListingReview(client, {
      accessToken: payload.accessToken,
      reviewId: rid,
    });
    if (!out?.ok) return out;
    actionResult = { deletedReview: true, reviewId: rid, listingId: out.listingId };
    message = "Recensione eliminata e segnalazione chiusa.";
  }

  doc.status = decision === "dismiss" && !action ? "dismissed" : "resolved";
  doc.staffReason = note;
  const mod = { ...modPrev };
  mod.reviewedBy = String(staff.member?.id || staff.user?.id || "").trim();
  mod.reviewedAt = new Date().toISOString();
  if (action) mod.action = action;
  if (actionResult) mod.actionResult = actionResult;
  doc.boardModeration = mod;
  doc.markModified?.("boardModeration");
  await doc.save();
  return {
    ok: true,
    status: 200,
    message,
    action: action || null,
    actionResult,
  };
}

function sanitizeReportCategory(raw?) {
  const c = String(raw || "").trim().toLowerCase();
  return CATEGORIES.has(c) ? c : "other";
}

export = { listBoardReports, resolveBoardReport, sanitizeReportCategory, categoryLabel, CATEGORIES };
