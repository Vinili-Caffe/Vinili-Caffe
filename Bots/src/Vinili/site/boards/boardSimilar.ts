/**
 * Schede simili: stessa tipologia, overlap su categorie / tag / lingue, score alto.
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { BL, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { serializeListing } = require("./boardInvites") as typeof import("./boardInvites");

const SELECT =
  "title boardKind boardDiscordId boardSlug status boardTagline boardCategories boardLocales boardTags boardIconUrl boardBannerUrl boardInviteUrl boardBotInviteUrl boardScore boardVotes30d boardVotesMonth boardVotesMonthKey boardBumps7d boardBumpedAt boardRatingAvg boardReviewsCount boardAccent boardStats boardNsfw boardFeatures boardModeration createdAt updatedAt userId authorName";

function setOf(arr?): Set<string> {
  return new Set((Array.isArray(arr) ? arr : []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>) {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

async function getSimilarListings(_client?, listingId?, limit = 8) {
  const gate = featureGate(_client);
  if (!gate.ok) return gate;
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" })
    .select({ boardKind: 1, boardCategories: 1, boardTags: 1, boardLocales: 1, boardLocale: 1, boardScore: 1 })
    .lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  const kind = String(doc.boardKind || "") === "bot" ? "bot" : "server";
  const cats = setOf(doc.boardCategories);
  const tags = setOf(doc.boardTags);
  const locales = setOf(
    Array.isArray(doc.boardLocales) && doc.boardLocales.length ? doc.boardLocales : doc.boardLocale ? [doc.boardLocale] : [],
  );

  const candidates: any[] = await SiteDocument.find({
    docType: BL,
    status: "approved",
    boardKind: kind,
    _id: { $ne: id },
  })
    .select(SELECT)
    .sort({ boardScore: -1, boardBumpedAt: -1 })
    .limit(80)
    .lean();

  const scored = candidates
    .map((row) => {
      const c = setOf(row.boardCategories);
      const t = setOf(row.boardTags);
      const l = setOf(
        Array.isArray(row.boardLocales) && row.boardLocales.length ? row.boardLocales : row.boardLocale ? [row.boardLocale] : [],
      );
      const catN = overlap(cats, c);
      const tagN = overlap(tags, t);
      const locN = overlap(locales, l);
      const score = catN * 5 + tagN * 3 + locN * 2 + Math.min(4, Number(row.boardScore) || 0) / 50;
      return { row, score, catN, tagN, locN };
    })
    .filter((x) => x.catN + x.tagN + x.locN > 0)
    .sort((a, b) => b.score - a.score || Number(b.row.boardScore) - Number(a.row.boardScore))
    .slice(0, Math.max(1, Math.min(24, Number(limit) || 8)));

  return {
    ok: true,
    status: 200,
    items: scored.map((x) => serializeListing(x.row, { mode: "card" })),
  };
}

export = { getSimilarListings };
