const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { SITE_DOCUMENT_TYPE } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");

const RV = SITE_DOCUMENT_TYPE.REVIEW;

/* boardsImportSiteServerReviews1: lazy require evita cicli con siteBoardsApi */
function mirrorSiteServerReviewToBoard(doc?) {
  try {
    const api = require("../../boards/siteBoardsApi") as typeof import("../../boards/siteBoardsApi");
    return Promise.resolve(api.syncSiteServerReviewToMainBoardListing(doc)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}
function unmirrorSiteServerReviewFromBoard(userId?) {
  try {
    const api = require("../../boards/siteBoardsApi") as typeof import("../../boards/siteBoardsApi");
    return Promise.resolve(api.removeSiteServerReviewFromMainBoardListing(userId)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}

const STAFF_ROLE_ID = String(IDs?.roles?.Staff || "").trim();
const ADMIN_ROLE_ID = String(IDs?.roles?.Admin || "").trim();
const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const FALLBACK_REVIEW_CHANNEL_ID = String(IDs?.channels?.supporters || "").trim();
const STAFF_CACHE_TTL_MS = 2 * 60 * 1000;
const REVIEW_REWARD_LEVELS = 5;

export = {
  IDs,
  RV,
  mirrorSiteServerReviewToBoard,
  unmirrorSiteServerReviewFromBoard,
  STAFF_ROLE_ID,
  ADMIN_ROLE_ID,
  HIGH_STAFF_ROLE_ID,
  FALLBACK_REVIEW_CHANNEL_ID,
  STAFF_CACHE_TTL_MS,
  REVIEW_REWARD_LEVELS,
};
