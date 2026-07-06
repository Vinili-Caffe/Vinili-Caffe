const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "../Config/automodScamConfig.json");

const DEFAULT_SCAM_CONFIG = {
  domains: ["dsc.gg", "depxbit.com", "depixbit.com"],
  discordKeywords: [
    "depxbit.com",
    "depxbit",
    "crypto casino",
    "promo code",
    "withdrawal success",
    "giving away $",
    "usdt bonus",
  ],
  imageBaitMaxTextLength: 48,
  youngAccountMaxDays: 14,
  imageOnlyBaitMaxImages: 3,
};

function loadAutomodScamConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_SCAM_CONFIG };
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const domains = Array.isArray(parsed?.domains)
      ? parsed.domains.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
      : DEFAULT_SCAM_CONFIG.domains;
    const discordKeywords = Array.isArray(parsed?.discordKeywords)
      ? parsed.discordKeywords.map((x) => String(x || "").trim()).filter(Boolean)
      : DEFAULT_SCAM_CONFIG.discordKeywords;
    const imageBaitMaxTextLength = Number(parsed?.imageBaitMaxTextLength);
    const youngAccountMaxDays = Number(parsed?.youngAccountMaxDays);
    const imageOnlyBaitMaxImages = Number(parsed?.imageOnlyBaitMaxImages);
    return {
      domains: domains.length ? domains : DEFAULT_SCAM_CONFIG.domains,
      discordKeywords: discordKeywords.length ? discordKeywords : DEFAULT_SCAM_CONFIG.discordKeywords,
      imageBaitMaxTextLength:
        Number.isFinite(imageBaitMaxTextLength) && imageBaitMaxTextLength > 0
          ? imageBaitMaxTextLength
          : DEFAULT_SCAM_CONFIG.imageBaitMaxTextLength,
      youngAccountMaxDays:
        Number.isFinite(youngAccountMaxDays) && youngAccountMaxDays > 0
          ? youngAccountMaxDays
          : DEFAULT_SCAM_CONFIG.youngAccountMaxDays,
      imageOnlyBaitMaxImages:
        Number.isFinite(imageOnlyBaitMaxImages) && imageOnlyBaitMaxImages > 0
          ? imageOnlyBaitMaxImages
          : DEFAULT_SCAM_CONFIG.imageOnlyBaitMaxImages,
    };
  } catch {
    return { ...DEFAULT_SCAM_CONFIG };
  }
}

module.exports = { loadAutomodScamConfig, DEFAULT_SCAM_CONFIG };