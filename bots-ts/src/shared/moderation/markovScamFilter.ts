const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const CONFIG_PATH = path.resolve(__dirname, "../../Vinyls/Utils/Config/automodScamConfig.json");

const DEFAULT_SCAM_CONFIG = {
  domains: ["dsc.gg", "depxbit.com", "depixbit.com"],
  discordKeywords: [
    "lost your crypto to a scam",
    "kate expert services",
    "crypto asset tracing",
    "recovery assessment",
    "no upfront payment",
  ],
  imageBaitMaxTextLength: 48,
};

const SCAM_REGEX_PATTERNS = [
  /\blost\s+your\s+crypto\s+to\s+a\s+scam\b/i,
  /\bkate\s*expert\s*services?\b/i,
  /\bkateexpertsservices\b/i,
  /\bno\s+upfront\s+payment\b/i,
  /\bcrypto\s+asset\s+tracing\b/i,
  /\brecovery\s+assessment\b/i,
  /\bprofessional\s+crypto\s+asset\b/i,
  /\b(funds?\s+(?:have\s+been\s+)?successfully\s+recovered)\b/i,
  /\b(crypto\s+casino|casino\s+crypto)\b/i,
  /\b(mr\s*beast|mrbeast)\b.{0,80}\b(crypto|casino|giveaway|promo|usdt|\$\d|register|withdraw)/i,
  /\b(give(?:away|ing)\s+(?:away\s+)?\$?\d[\d,.]*\b)/i,
  /\b(withdraw(?:al)?\s+success(?:ful)?)\b/i,
  /\b(usdt|btc|eth)\b.{0,40}\b(withdraw|bonus|giveaway|promo|register)\b/i,
  /\b7884\s*893\s*099\b/,
  /\bdon'?t\s+lose\s+hope\b/i,
  /\breach\s+out\s+to\b.{0,40}\b(expert|recovery|tracing)\b/i,
];

const SCAM_IMAGE_BAIT_PATTERNS = [
  /^omg\b/i,
  /\b(wow|look at this|check this|free money|guadagn|soldi)\b/i,
  /[\u{1F4B0}\u{1F911}\u{1F633}\u{1F4B5}]/u,
  /\b(bro|guys|wtf|insane|crazy|no way|real|fr)\b/i,
  /\b(mrbeast|mr\s*beast)\b/i,
  /\b(bonus|promocode|promo\s*code|activate\s+code)\b/i,
  /\b(withdraw(?:al)?|casino|crypto)\b/i,
  /\b(guarda|incredibile|assurdo|soldi|gratis)\b/i,
  /\$\d{2,5}\b/,
  /\b(riftroll|betchoco|nozawin|serowin)\b/i,
  /\blost\s+your\s+crypto\b/i,
  /\bexpert\s+services?\b/i,
];

let cachedConfig = null;

function loadScamConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      cachedConfig = { ...DEFAULT_SCAM_CONFIG };
      return cachedConfig;
    }
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const domains = Array.isArray(parsed?.domains)
      ? parsed.domains.map((x?) => String(x || "").trim().toLowerCase()).filter(Boolean)
      : DEFAULT_SCAM_CONFIG.domains;
    const discordKeywords = Array.isArray(parsed?.discordKeywords)
      ? parsed.discordKeywords.map((x?) => String(x || "").trim()).filter(Boolean)
      : DEFAULT_SCAM_CONFIG.discordKeywords;
    const imageBaitMaxTextLength = Number(parsed?.imageBaitMaxTextLength);
    cachedConfig = {
      domains: domains.length ? domains : DEFAULT_SCAM_CONFIG.domains,
      discordKeywords: discordKeywords.length ? discordKeywords : DEFAULT_SCAM_CONFIG.discordKeywords,
      imageBaitMaxTextLength:
        Number.isFinite(imageBaitMaxTextLength) && imageBaitMaxTextLength > 0
          ? imageBaitMaxTextLength
          : DEFAULT_SCAM_CONFIG.imageBaitMaxTextLength,
    };
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_SCAM_CONFIG };
    return cachedConfig;
  }
}

function normalizeForScamCheck(text?) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMarkovScamText(text?) {
  const normalized = normalizeForScamCheck(text);
  if (!normalized) return false;
  const cfg = loadScamConfig();
  for (const kw of cfg.discordKeywords) {
    const needle = String(kw || "").toLowerCase().trim();
    if (needle && normalized.includes(needle)) return true;
  }
  for (const domain of cfg.domains) {
    const needle = String(domain || "").toLowerCase().trim();
    if (needle && normalized.includes(needle)) return true;
  }
  return SCAM_REGEX_PATTERNS.some((re?) => re.test(normalized));
}

function countMessageImages(message?) {
  const attachments = message?.attachments;
  if (!attachments?.size) return 0;
  let count = 0;
  for (const att of attachments.values()) {
    const type = String(att?.contentType || "").toLowerCase();
    const url = String(att?.url || "");
    if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/i.test(url)) count += 1;
  }
  return count;
}

function isMarkovScamImageBait(message?) {
  const imageCount = countMessageImages(message);
  if (imageCount < 1) return false;
  const text = String(message?.content || "").trim();
  const maxLen = Number(loadScamConfig().imageBaitMaxTextLength || 48);
  if (!text || text.length > maxLen) return false;
  if (isMarkovScamText(text)) return true;
  return SCAM_IMAGE_BAIT_PATTERNS.some((re?) => re.test(text));
}

function isMarkovScamMessage(message?) {
  if (!message) return false;
  const content = String(message.content || "").trim();
  if (isMarkovScamText(content)) return true;
  if (isMarkovScamImageBait(message)) return true;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const parts = [embed?.title, embed?.description, embed?.author?.name, embed?.footer?.text]
      .map((part?) => String(part || "").trim())
      .filter(Boolean);
    if (parts.some((part?) => isMarkovScamText(part))) return true;
  }
  return false;
}

function filterScamLines(lines?) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line?) => !isMarkovScamText(line));
}

export = {
  loadScamConfig,
  isMarkovScamText,
  isMarkovScamImageBait,
  isMarkovScamMessage,
  filterScamLines,
};
