const TENANT_LANGUAGE_OPTIONS = Object.freeze([
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "hi", flag: "🇮🇳", label: "हिन्दी" },
  { code: "id", flag: "🇮🇩", label: "Indonesia" },
  { code: "uk", flag: "🇺🇦", label: "Українська" },
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { code: "ro", flag: "🇷🇴", label: "Română" },
  { code: "sv", flag: "🇸🇪", label: "Svenska" },
]);

const TENANT_LANGUAGES = Object.freeze(TENANT_LANGUAGE_OPTIONS.map((row) => row.code));
const DEFAULT_LANGUAGE = "it";

function normalizeTenantLanguage(raw) {
  const lang = String(raw || DEFAULT_LANGUAGE).trim().toLowerCase();
  return TENANT_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

const DISCORD_LOCALE_ALIASES = Object.freeze({
  "en-us": "en",
  "en-gb": "en",
  "es-es": "es",
  "es-419": "es",
  "pt-br": "pt",
  "pt-pt": "pt",
  "zh-cn": "zh",
  "zh-tw": "zh",
  "uk-ua": "uk",
});

function mapDiscordLocaleToTenantLanguage(raw) {
  const locale = String(raw || "").trim().toLowerCase();
  if (!locale) return null;
  const direct = DISCORD_LOCALE_ALIASES[locale];
  if (direct && TENANT_LANGUAGES.includes(direct)) return direct;
  const base = locale.split("-")[0];
  if (TENANT_LANGUAGES.includes(base)) return base;
  if (locale.startsWith("zh")) return "zh";
  if (locale.startsWith("uk")) return "uk";
  return null;
}

const LANGUAGE_PICKER_ROWS = Object.freeze([
  ["it", "en", "es", "fr"],
  ["de", "pt", "ru", "zh"],
  ["ja", "ko", "ar", "nl"],
  ["pl", "tr", "hi", "id"],
  ["uk", "vi", "ro", "sv"],
]);

module.exports = {
  DEFAULT_LANGUAGE,
  TENANT_LANGUAGE_OPTIONS,
  TENANT_LANGUAGES,
  LANGUAGE_PICKER_ROWS,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
};
