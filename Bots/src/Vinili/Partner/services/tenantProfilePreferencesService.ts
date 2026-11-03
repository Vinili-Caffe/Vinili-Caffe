const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { normalizeTenantLanguage } = require("../i18n/tenantPartnershipI18n/languages") as typeof import("../i18n/tenantPartnershipI18n/languages");
const { BADGE_DEFS } = require("../tenant/tenantObjectiveDefs") as typeof import("../tenant/tenantObjectiveDefs");
const {
  getTenantPartnershipStorageGuildId,
  loadCanonicalTenantPartnershipRows,
} = require("./tenantPartnershipProgressStore") as typeof import("./tenantPartnershipProgressStore");

const VALID_BADGE_IDS = new Set(BADGE_DEFS.map((row?) => row.id));

const DEFAULT_PREFS = Object.freeze({
  suppressManagerPing: false,
  ephemeralCommands: false,
  language: "it",
  languageManual: false,
  selectedBadges: [],
  notificationsReadAt: null,
});

function normalizePrefs(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const selectedBadges = Array.isArray(src.selectedBadges)
    ? src.selectedBadges.map((id?) => String(id || "").trim()).filter((id?) => VALID_BADGE_IDS.has(id)).slice(0, 2)
    : [];
  const hasStoredLanguage = Object.prototype.hasOwnProperty.call(src, "language");
  return {
    suppressManagerPing: src.suppressManagerPing === true,
    ephemeralCommands: src.ephemeralCommands === true,
    language: src.language ? normalizeTenantLanguage(src.language) : DEFAULT_PREFS.language,
    languageManual: src.languageManual === true || hasStoredLanguage,
    selectedBadges,
    notificationsReadAt: src.notificationsReadAt ? new Date(src.notificationsReadAt) : null,
  };
}

function mergeTenantPartnershipPrefs(canonicalTp?, legacyTp?) {
  const main = normalizePrefs(canonicalTp);
  if (!legacyTp) return main;
  const legacy = normalizePrefs(legacyTp);
  return {
    suppressManagerPing: main.suppressManagerPing || legacy.suppressManagerPing,
    ephemeralCommands: main.ephemeralCommands || legacy.ephemeralCommands,
    languageManual: main.languageManual || legacy.languageManual,
    language: main.languageManual ? main.language : legacy.languageManual ? legacy.language : main.language,
    selectedBadges: main.selectedBadges.length ? main.selectedBadges : legacy.selectedBadges,
    notificationsReadAt:
      main.notificationsReadAt && legacy.notificationsReadAt
        ? main.notificationsReadAt > legacy.notificationsReadAt
          ? main.notificationsReadAt
          : legacy.notificationsReadAt
        : main.notificationsReadAt || legacy.notificationsReadAt,
  };
}

async function getTenantProfilePrefs(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { ...DEFAULT_PREFS };
  const { canonical, legacy } = await loadCanonicalTenantPartnershipRows(
    gid,
    uid,
    "profile.tenantPartnership",
  );
  return mergeTenantPartnershipPrefs(
    canonical?.profile?.tenantPartnership,
    legacy?.profile?.tenantPartnership,
  );
}

async function updateTenantProfilePrefs(guildId?, userId?, patch: Record<string, any> = {}) {
  const gid = getTenantPartnershipStorageGuildId(guildId);
  const uid = String(userId || "").trim();
  if (!gid || !uid) return null;
  const $set: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "suppressManagerPing")) {
    $set["profile.tenantPartnership.suppressManagerPing"] = patch.suppressManagerPing === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ephemeralCommands")) {
    $set["profile.tenantPartnership.ephemeralCommands"] = patch.ephemeralCommands === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "language")) {
    $set["profile.tenantPartnership.language"] = normalizeTenantLanguage(patch.language);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "languageManual")) {
    $set["profile.tenantPartnership.languageManual"] = patch.languageManual === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "selectedBadges")) {
    const ids = Array.isArray(patch.selectedBadges)
      ? patch.selectedBadges.map((id?) => String(id || "").trim()).filter(Boolean).slice(0, 2)
      : [];
    $set["profile.tenantPartnership.selectedBadges"] = ids;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notificationsReadAt")) {
    $set["profile.tenantPartnership.notificationsReadAt"] = patch.notificationsReadAt
      ? new Date(patch.notificationsReadAt)
      : new Date();
  }
  if (!Object.keys($set).length) return getTenantProfilePrefs(gid, uid);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    { $set, $setOnInsert: { guildId: gid, userId: uid } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .select("profile.tenantPartnership")
    .catch(() => null);
  return normalizePrefs(doc?.profile?.tenantPartnership);
}

async function userWantsTenantEphemeralCommands(guildId?, userId?) {
  const prefs = await getTenantProfilePrefs(guildId, userId);
  return prefs.ephemeralCommands === true;
}

async function userSuppressesManagerPing(guildId?, userId?) {
  const prefs = await getTenantProfilePrefs(guildId, userId);
  return prefs.suppressManagerPing === true;
}

async function resolveManagerSelectedBadgeEmojis(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  try {
    const prefs = await getTenantProfilePrefs(gid, uid);
    const ids = Array.isArray(prefs?.selectedBadges) ? prefs.selectedBadges : [];
    const out = [];
    for (const id of ids) {
      const def = BADGE_DEFS.find((row?) => row.id === id);
      const emoji = String(def?.emoji || "").trim();
      if (emoji) out.push(emoji);
    }
    return out.slice(0, 2);
  } catch {
    return [];
  }
}

export = {
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
  userWantsTenantEphemeralCommands,
  userSuppressesManagerPing,
  resolveManagerSelectedBadgeEmojis,
};
