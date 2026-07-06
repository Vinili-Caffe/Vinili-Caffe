const fs = require("fs");
const path = require("path");

const MAX_LEN = 500;
const MAX_NEWLINES = 4;
const RACIST_WORD_PATTERNS = [
  /\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3][\W_]*)?r\b/iu,
  /\bk[\W_]*i[\W_]*k[\W_]*e\b/iu,
  /\bc[\W_]*h[\W_]*i[\W_]*n[\W_]*k\b/iu,
  /\bw[\W_]*e[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k\b/iu,
  /\bp[\W_]*a[\W_]*k[\W_]*i\b/iu,
];
const LEET_MAP = new Map([
  ["0", "o"], ["1", "i"], ["3", "e"], ["4", "a"], ["5", "s"], ["6", "g"], ["7", "t"], ["8", "b"], ["9", "g"],
  ["@", "a"], ["$", "s"], ["!", "i"], ["|", "i"],
]);
const LINK_RE =
  /(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/|\.gg\/[a-z0-9-]{2,}|cdn\.discordapp\.com\/|media\.discordapp\.net\/)/i;
const DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|org|net|it|gg|io|dev|me|xyz|tv|co|eu|app|link|online|shop|site|info|cloud|ru|de|fr|es|uk)\b(?:\/[^\s]*)?/i;
const MENTION_RE = /<@!?\d+>|<@&\d+>|<#\d+>|\B@(?:everyone|here)\b/i;
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(\s*https?:\/\//i;
const ANGLE_URL_RE = /<https?:\/\//i;
const CODE_FENCE_RE = /```/;
const CUSTOM_EMOJI_RE = /<a?:[a-zA-Z0-9_]{2,}:\d{16,20}>/g;

function parseWordArrayFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim().toLowerCase()).filter((x) => x.length >= 3);
  } catch {
    return [];
  }
}

function loadCustomRacistWords() {
  const singleFile = path.resolve(__dirname, "../Config/automodRacistWords.json");
  const folderPath = path.resolve(__dirname, "../Config/automodRacistWords");
  const all = new Set(parseWordArrayFile(singleFile));
  try {
    if (fs.existsSync(folderPath)) {
      const entries = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json") && e.name.toLowerCase() !== "sources.json")
        .map((e) => path.join(folderPath, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[mentionResponseValidation] racist words:", err?.message || err);
  }
  return [...all];
}

const CUSTOM_RACIST_WORDS = loadCustomRacistWords();

function toLeetNormalized(input) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

function findBlacklistedWordMatch(content) {
  const text = String(content || "");
  if (!text) return null;
  const normalizedBase = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = toLeetNormalized(normalizedBase);
  const normalizedTokens = normalized.split(/[^\p{L}\p{N}]+/gu).map((x) => String(x || "").trim()).filter(Boolean);
  const tokenSet = new Set(normalizedTokens);
  for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
    const re = RACIST_WORD_PATTERNS[i];
    if (re.test(text) || re.test(normalized)) {
      return { source: "regex", term: `pattern#${i + 1}` };
    }
  }
  for (const term of CUSTOM_RACIST_WORDS) {
    const normalizedTerm = toLeetNormalized(
      String(term || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim(),
    );
    if (!normalizedTerm) continue;
    if (/\s/.test(normalizedTerm)) {
      const padded = ` ${normalized} `;
      const needle = ` ${normalizedTerm} `;
      if (padded.includes(needle)) return { source: "custom_phrase", term };
    } else if (tokenSet.has(normalizedTerm)) {
      return { source: "custom_token", term };
    }
  }
  return null;
}

function stripCustomEmojiTokens(text) {
  return String(text || "").replace(CUSTOM_EMOJI_RE, " ");
}

function normalizeMentionResponseText(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_LEN);
}

function validateMentionResponseText(raw) {
  const text = normalizeMentionResponseText(raw);
  if (!text) {
    return {
      ok: false,
      reason: "empty",
      userMessage: "<:VC_Attention:1482534443632558151> La risposta non può essere vuota.",
    };
  }
  if ((text.match(/\n/g) || []).length > MAX_NEWLINES) {
    return {
      ok: false,
      reason: "too_many_lines",
      userMessage: "<:VC_Attention:1482534443632558151> Troppi a capo: massimo 4 righe.",
    };
  }
  if (MENTION_RE.test(text)) {
    return {
      ok: false,
      reason: "mention",
      userMessage:
        "<:VC_Attention:1482534443632558151> Non puoi usare mention (@utente, @ruolo, @everyone, @here o canali).",
    };
  }
  if (
    LINK_RE.test(text) ||
    DOMAIN_RE.test(stripCustomEmojiTokens(text)) ||
    MARKDOWN_LINK_RE.test(text) ||
    ANGLE_URL_RE.test(text)
  ) {
    return {
      ok: false,
      reason: "link",
      userMessage: "<:VC_Attention:1482534443632558151> Non sono ammessi link, inviti o URL.",
    };
  }
  if (CODE_FENCE_RE.test(text)) {
    return {
      ok: false,
      reason: "code_block",
      userMessage: "<:VC_Attention:1482534443632558151> Non sono ammessi blocchi di codice.",
    };
  }
  const blacklist = findBlacklistedWordMatch(text);
  if (blacklist) {
    return {
      ok: false,
      reason: "blacklist",
      userMessage: "<:VC_Attention:1482534443632558151> Il testo contiene parole non consentite dal regolamento.",
    };
  }
  return { ok: true, text };
}

module.exports = { validateMentionResponseText, normalizeMentionResponseText, MAX_LEN };