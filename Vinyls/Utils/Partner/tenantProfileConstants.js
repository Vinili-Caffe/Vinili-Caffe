const { TENANT_LANGUAGES, TENANT_LANGUAGE_OPTIONS, LANGUAGE_PICKER_ROWS, BADGE_COPY, OBJECTIVE_COPY, buildObjectiveDefs, normalizeTenantLanguage, t, getLanguageFlag, getLanguageLabel, resolveTenantLanguage } = require("./tenantPartnershipI18n");
const { TENANT_PARTNERSHIP_ARROWS } = require("./tenantPartnershipArrows");
const { BADGE_DEFS } = require("./tenantObjectiveDefs");
const MAX_SELECTED_BADGES = 2;
const BADGES_PER_PAGE = 8;
const BADGES_BROWSE_PER_PAGE = 14;
const OBJECTIVES_PER_PAGE = 3;
const NOTIFICATIONS_LIMIT = 5;
const TENANT_PROFILE_SECTIONS = Object.freeze({
  HOME: "home",
  NOTIFICATIONS: "notifications",
  OBJECTIVES: "objectives",
  BADGES: "badges",
  BADGE_SELECT: "badge_select",
  BADGE_BROWSE: "badge_browse",
  SETTINGS: "settings",
  LANGUAGE: "language",
});

const TENANT_PROFILE_BADGE_ARROWS = Object.freeze({
  back: TENANT_PARTNERSHIP_ARROWS.left,
  expandDown: TENANT_PARTNERSHIP_ARROWS.down,
  collapseUp: TENANT_PARTNERSHIP_ARROWS.up,
});

function buildObjectiveDefsLocal() {
  return buildObjectiveDefs();
}

module.exports = { MAX_SELECTED_BADGES, BADGES_PER_PAGE, BADGES_BROWSE_PER_PAGE, OBJECTIVES_PER_PAGE, NOTIFICATIONS_LIMIT, TENANT_PROFILE_SECTIONS, TENANT_PROFILE_BADGE_ARROWS, TENANT_PARTNERSHIP_ARROWS, TENANT_LANGUAGES, TENANT_LANGUAGE_OPTIONS, LANGUAGE_PICKER_ROWS, BADGE_DEFS, BADGE_COPY, OBJECTIVE_COPY, buildObjectiveDefs: buildObjectiveDefsLocal, normalizeTenantLanguage, getLanguageFlag, getLanguageLabel, t, resolveTenantLanguage };
