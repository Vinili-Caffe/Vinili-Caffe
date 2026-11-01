const { getTenantProfilePrefs } = require("../../../services/Partner/tenantProfilePreferencesService") as typeof import("../../../services/Partner/tenantProfilePreferencesService");
const {
  DEFAULT_LANGUAGE,
  TENANT_LANGUAGE_OPTIONS,
  TENANT_LANGUAGES,
  LANGUAGE_PICKER_ROWS,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
} = require("./languages") as typeof import("./languages");
const { UI_PACKS, OBJECTIVE_COPY } = require("./packs") as typeof import("./packs");
const { buildObjectiveDefs } = require("../tenantObjectiveDefs") as typeof import("../tenantObjectiveDefs");

const FLAG_BY_CODE = new Map(TENANT_LANGUAGE_OPTIONS.map((row?) => [row.code, row.flag]));
const LABEL_BY_CODE = new Map(TENANT_LANGUAGE_OPTIONS.map((row?) => [row.code, row.label]));

function getLanguageFlag(code?) {
  return FLAG_BY_CODE.get(normalizeTenantLanguage(code)) || "🌐";
}

function getLanguageLabel(code?) {
  return LABEL_BY_CODE.get(normalizeTenantLanguage(code)) || "Italiano";
}

function interpolate(text?, vars: Record<string, any> = {}) {
  let out = String(text ?? "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function t(lang?, key?, vars: Record<string, any> = {}) {
  const code = normalizeTenantLanguage(lang);
  const text =
    UI_PACKS[code]?.[key] ??
    UI_PACKS[DEFAULT_LANGUAGE]?.[key] ??
    key;
  return interpolate(text, vars);
}

function resolveDiscordLocale(options: Record<string, any> = {}) {
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

function resolveLanguageFromPrefs(prefs?, discordLocale?, guildPreferredLocale?) {
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

async function resolveTenantLanguage(guildId?, userId?, options: Record<string, any> = {}) {
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

export = {
  DEFAULT_LANGUAGE,
  TENANT_LANGUAGE_OPTIONS,
  TENANT_LANGUAGES,
  LANGUAGE_PICKER_ROWS,
  OBJECTIVE_COPY,
  buildObjectiveDefs,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
  getLanguageFlag,
  getLanguageLabel,
  t,
  resolveTenantLanguage,
};
