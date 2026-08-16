const { getTenantProfilePrefs } = require("../../../Services/Partner/tenantProfilePreferencesService");
const {
  DEFAULT_LANGUAGE,
  TENANT_LANGUAGE_OPTIONS,
  TENANT_LANGUAGES,
  LANGUAGE_PICKER_ROWS,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
} = require("./languages");
const { UI_PACKS, BADGE_COPY, OBJECTIVE_COPY } = require("./packs");
const { buildObjectiveDefs } = require("../tenantObjectiveDefs");

const DISCORD_LOCALE_FALLBACK = "it";
const FLAG_BY_CODE = new Map(TENANT_LANGUAGE_OPTIONS.map((row) => [row.code, row.flag]));
const LABEL_BY_CODE = new Map(TENANT_LANGUAGE_OPTIONS.map((row) => [row.code, row.label]));

function getLanguageFlag(code) {
  return FLAG_BY_CODE.get(normalizeTenantLanguage(code)) || "🌐";
}

function getLanguageLabel(code) {
  return LABEL_BY_CODE.get(normalizeTenantLanguage(code)) || "Italiano";
}

function getLanguageNativeLabel(code) {
  return getLanguageLabel(code);
}

function interpolate(text, vars = {}) {
  let out = String(text ?? "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function t(lang, key, vars = {}) {
  const code = normalizeTenantLanguage(lang);
  const text =
    UI_PACKS[code]?.[key] ??
    UI_PACKS[DEFAULT_LANGUAGE]?.[key] ??
    key;
  return interpolate(text, vars);
}

function resolveDiscordLocale(options = {}) {
  const direct = options.discordLocale ?? options.locale ?? null;
  if (direct) return direct;
  const userId = String(options.userId || "").trim();
  const client = options.client;
  if (userId && client?.users?.cache) {
    const cached = client.users.cache.get(userId);
    if (cached?.locale) return cached.locale;
  }
  return null;
}

function resolveLanguageFromPrefs(prefs, discordLocale, guildPreferredLocale) {
  const normalized = prefs && typeof prefs === "object" ? prefs : {};
  if (normalized.languageManual && normalized.language) {
    return normalizeTenantLanguage(normalized.language);
  }
  const fromGuild = mapDiscordLocaleToTenantLanguage(guildPreferredLocale);
  if (fromGuild) return fromGuild;
  if (normalized.language) {
    return normalizeTenantLanguage(normalized.language);
  }
  const fromUser = mapDiscordLocaleToTenantLanguage(discordLocale);
  if (fromUser) return fromUser;
  return DEFAULT_LANGUAGE;
}

async function resolveTenantLanguage(guildId, userId, options = {}) {
  const discordLocale = resolveDiscordLocale({ ...options, userId });
  const guildPreferredLocale = options.guildPreferredLocale ?? null;
  if (!guildId || !userId) {
    return (
      mapDiscordLocaleToTenantLanguage(guildPreferredLocale) ||
      mapDiscordLocaleToTenantLanguage(discordLocale) ||
      DEFAULT_LANGUAGE
    );
  }
  const prefs = await getTenantProfilePrefs(guildId, userId).catch(() => null);
  return resolveLanguageFromPrefs(prefs, discordLocale, guildPreferredLocale);
}

module.exports = {
  DEFAULT_LANGUAGE,
  DISCORD_LOCALE_FALLBACK,
  TENANT_LANGUAGE_OPTIONS,
  TENANT_LANGUAGES,
  LANGUAGE_PICKER_ROWS,
  BADGE_COPY,
  OBJECTIVE_COPY,
  buildObjectiveDefs,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
  resolveLanguageFromPrefs,
  getLanguageFlag,
  getLanguageLabel,
  getLanguageNativeLabel,
  t,
  resolveTenantLanguage,
};
