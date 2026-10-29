const { AvatarPrivacy, BannerPrivacy, QuotePrivacy, RepostPrivacy } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");

const PRIVACY_CONTENT_KINDS = Object.freeze(["avatar", "banner", "quotes", "reposts"]);
const PRIVACY_CONTENT_LABELS = Object.freeze({
  avatar: "Avatar",
  banner: "Banner",
  quotes: "Quote",
  reposts: "Repost",
});
const PRIVACY_CONTENT_MODELS = Object.freeze({
  avatar: AvatarPrivacy,
  banner: BannerPrivacy,
  quotes: QuotePrivacy,
  reposts: RepostPrivacy,
});

function privacyContentModel(kind?) {
  return PRIVACY_CONTENT_MODELS[kind] || null;
}

export = {
  PRIVACY_CONTENT_KINDS,
  PRIVACY_CONTENT_LABELS,
  PRIVACY_CONTENT_MODELS,
  privacyContentModel,
};