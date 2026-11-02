const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { loadAutomodScamConfig } = require("../../Utils/Moderation/automodScamConfig") as typeof import("../../Utils/Moderation/automodScamConfig");

const AUTOMOD_CONFIG_PATH = path.resolve(__dirname, "../../Utils/Config/automodConfig.json");
const RACIST_WORDS_FILE = path.resolve(__dirname, "../../Utils/Config/automodRacistWords.json");
const RACIST_WORDS_DIR = path.resolve(__dirname, "../../Utils/Config/automodRacistWords");
const AUTOMOD_SCAM_CONFIG = loadAutomodScamConfig();
const LINK_BLACKLIST_DOMAINS = AUTOMOD_SCAM_CONFIG.domains?.length ? AUTOMOD_SCAM_CONFIG.domains : ["dsc.gg"];
const KEYWORDS_PER_RULE = 1000;
const KEYWORD_MAX_LEN = 60;

function readAutomodConfig() {
  try {
    if (!fs.existsSync(AUTOMOD_CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(AUTOMOD_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function isDiscordNativeConfigEnabled() {
  const cfg = readAutomodConfig();
  const dn = cfg?.discordNative || {};
  if (typeof dn.enabled === "boolean") return dn.enabled;
  return true;
}

function shouldSyncOnStartup() {
  const cfg = readAutomodConfig();
  const dn = cfg?.discordNative || {};
  if (typeof dn.syncOnStartup === "boolean") return dn.syncOnStartup;
  return true;
}

function parseWordArrayFile(filePath?) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x?) => String(x || "").trim().toLowerCase())
      .filter((x?) => x.length >= 2);
  } catch {
    return [];
  }
}

function normalizeDiscordKeyword(raw?, options: Record<string, any> = {}) {
  let term = String(raw || "").trim().toLowerCase();
  if (!term) return "";
  if (term.length > KEYWORD_MAX_LEN) term = term.slice(0, KEYWORD_MAX_LEN);
  if (term.includes(" ")) return term;
  if (term.startsWith("*") && term.endsWith("*")) return term;
  const cfg = readAutomodConfig();
  const wildcardTerms = new Set(
    (Array.isArray(cfg?.discordNative?.keywordWildcardTerms) ? cfg.discordNative.keywordWildcardTerms : [])
      .map((w?) => String(w || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (options.allowWildcard === true || wildcardTerms.has(term)) return `*${term}*`;
  return term;
}

function loadSlursPresetAllowList() {
  const cfg = readAutomodConfig();
  const fromCfg = cfg?.discordNative?.slursPresetAllowList;
  const merged = new Set();
  if (Array.isArray(fromCfg)) {
    for (const raw of fromCfg) {
      const word = String(raw || "").trim().toLowerCase();
      if (word.length >= 2 && word.length <= KEYWORD_MAX_LEN) merged.add(word);
    }
  }
  return [...merged].map((w?) => normalizeDiscordKeyword(w, { allowWildcard: false })).filter(Boolean);
}

function loadCustomWordsAllowList() {
  const cfg = readAutomodConfig();
  const fromCfg = cfg?.discordNative?.customWordsAllowList;
  const merged = new Set();
  if (Array.isArray(fromCfg)) {
    for (const raw of fromCfg) {
      const word = String(raw || "").trim().toLowerCase();
      if (word.length >= 2 && word.length <= KEYWORD_MAX_LEN) merged.add(word);
    }
  }
  return [...merged].map((w?) => normalizeDiscordKeyword(w, { allowWildcard: false })).filter(Boolean);
}

function isSlursPresetEnabled() {
  const cfg = readAutomodConfig();
  if (cfg?.heatFilters?.slursPreset === false) return false;
  if (cfg?.heatFilters?.wordBlacklist === false) return false;
  return true;
}

function loadCustomWordsForDiscord() {
  const all = new Set(parseWordArrayFile(RACIST_WORDS_FILE));
  try {
    if (fs.existsSync(RACIST_WORDS_DIR)) {
      const entries = fs
        .readdirSync(RACIST_WORDS_DIR, { withFileTypes: true })
        .filter(
          (e?) =>
            e.isFile() &&
            e.name.toLowerCase().endsWith(".json") &&
            e.name.toLowerCase() !== "sources.json",
        )
        .map((e?) => path.join(RACIST_WORDS_DIR, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (_) {}
  return [...all];
}

function chunkKeywords(words?) {
  const chunks = [];
  let current = [];
  for (const raw of words) {
    const keyword = normalizeDiscordKeyword(raw);
    if (!keyword) continue;
    if (current.length >= KEYWORDS_PER_RULE) {
      chunks.push(current);
      current = [];
    }
    current.push(keyword);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export = {
  readAutomodConfig,
  isDiscordNativeConfigEnabled,
  shouldSyncOnStartup,
  normalizeDiscordKeyword,
  chunkKeywords,
  loadCustomWordsForDiscord,
  loadSlursPresetAllowList,
  loadCustomWordsAllowList,
  isSlursPresetEnabled,
  LINK_BLACKLIST_DOMAINS,
  AUTOMOD_SCAM_CONFIG,
};
