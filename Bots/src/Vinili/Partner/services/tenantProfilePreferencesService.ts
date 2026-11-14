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

/*
 * Preferenze uguali in tutti i server (niente ping, risposte solo per me, lingua): si salvano una volta
 * per utente in una riga a parte. Badge in vetrina e notifiche restano di ogni server.
 * Finché uno non le cambia dal sito, valgono quelle vecchie di quel server.
 */
const GLOBAL_PREFS_GUILD = "global-prefs";
const GLOBAL_KEYS = ["suppressManagerPing", "ephemeralCommands", "language", "languageManual"] as const;

async function loadGlobalPrefs(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const doc: any = await ActivityUserProfile.findOne({ guildId: GLOBAL_PREFS_GUILD, userId: uid })
    .select("profile.tenantPartnership")
    .lean()
    .catch(() => null);
  const tp = doc?.profile?.tenantPartnership;
  return tp && typeof tp === "object" ? tp : null;
}

function applyGlobalPrefs(prefs?, globalTp?) {
  if (!globalTp) return prefs;
  const out = { ...prefs };
  if (Object.prototype.hasOwnProperty.call(globalTp, "suppressManagerPing")) out.suppressManagerPing = globalTp.suppressManagerPing === true;
  if (Object.prototype.hasOwnProperty.call(globalTp, "ephemeralCommands")) out.ephemeralCommands = globalTp.ephemeralCommands === true;
  if (globalTp.language) {
    out.language = normalizeTenantLanguage(globalTp.language);
    out.languageManual = true;
  }
  return out;
}

/** Solo le preferenze globali (profilo del sito). */
async function getGlobalProfilePrefs(userId?) {
  return applyGlobalPrefs({ ...DEFAULT_PREFS }, await loadGlobalPrefs(userId));
}

async function getTenantProfilePrefs(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!uid) return { ...DEFAULT_PREFS };
  if (!gid) return getGlobalProfilePrefs(uid);
  const [{ canonical, legacy }, globalTp] = await Promise.all([
    loadCanonicalTenantPartnershipRows(gid, uid, "profile.tenantPartnership"),
    loadGlobalPrefs(uid),
  ]);
  return applyGlobalPrefs(
    mergeTenantPartnershipPrefs(canonical?.profile?.tenantPartnership, legacy?.profile?.tenantPartnership),
    globalTp,
  );
}

async function updateTenantProfilePrefs(guildId?, userId?, patch: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  /* le preferenze globali vanno nella riga dell'utente valida per tutti i server */
  const $global: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "suppressManagerPing")) {
    $global["profile.tenantPartnership.suppressManagerPing"] = patch.suppressManagerPing === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ephemeralCommands")) {
    $global["profile.tenantPartnership.ephemeralCommands"] = patch.ephemeralCommands === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "language")) {
    $global["profile.tenantPartnership.language"] = normalizeTenantLanguage(patch.language);
    $global["profile.tenantPartnership.languageManual"] = true;
  }
  if (Object.keys($global).length) {
    await ActivityUserProfile.updateOne(
      { guildId: GLOBAL_PREFS_GUILD, userId: uid },
      { $set: $global, $setOnInsert: { guildId: GLOBAL_PREFS_GUILD, userId: uid } },
      { upsert: true },
    ).catch(() => null);
  }
  const gid = getTenantPartnershipStorageGuildId(guildId);
  if (!gid) return getGlobalProfilePrefs(uid);
  const $set: Record<string, any> = {};
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
  return applyGlobalPrefs(normalizePrefs(doc?.profile?.tenantPartnership), await loadGlobalPrefs(uid));
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
  getGlobalProfilePrefs,
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
  userWantsTenantEphemeralCommands,
  userSuppressesManagerPing,
  resolveManagerSelectedBadgeEmojis,
};
