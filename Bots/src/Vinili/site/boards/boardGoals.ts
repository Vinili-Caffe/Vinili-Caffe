/**
 * Obiettivi visita/voto/interazione sulla scheda (Gestisci → Statistiche).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, featureGate } = require("./boardReviews") as typeof import("./boardReviews");

function sanitizeGoals(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const clamp = (n) => {
    const v = Math.floor(Number(n) || 0);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(1_000_000, v);
  };
  return {
    views: clamp(src.views),
    engagements: clamp(src.engagements),
    votes: clamp(src.votes),
  };
}

async function assertOwnerOrStaff(client?, accessToken?, listingId?, isHighStaff = false) {
  const auth: any = await resolveBoardsUser(accessToken);
  if (!auth.ok) return auth;
  if (!mongoose.isValidObjectId(listingId)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (!isHighStaff && String(doc.userId || "") !== String(auth.userId)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
  }
  return { ok: true, auth, doc };
}

async function getListingGoals(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const owned: any = await assertOwnerOrStaff(client, payload.accessToken, payload.listingId, Boolean(payload.isHighStaff));
  if (!owned.ok) return owned;
  return { ok: true, status: 200, goals: sanitizeGoals(owned.doc.boardGoals) };
}

async function setListingGoals(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const owned: any = await assertOwnerOrStaff(client, payload.accessToken, payload.listingId, Boolean(payload.isHighStaff));
  if (!owned.ok) return owned;
  const goals = sanitizeGoals(payload.goals);
  owned.doc.boardGoals = goals;
  owned.doc.markModified?.("boardGoals");
  await owned.doc.save();
  return { ok: true, status: 200, goals, message: "Obiettivi salvati." };
}

export = { sanitizeGoals, getListingGoals, setListingGoals };
