"use strict";

const fs = require("fs");
const path = require("path");

/** Hate / racist / homophobic slur filters shared by Discord automod + web tickets. */
const RACIST_WORD_PATTERNS = [
  /\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3][\W_]*)?r\b/iu,
  /\bk[\W_]*i[\W_]*k[\W_]*e\b/iu,
  /\bc[\W_]*h[\W_]*i[\W_]*n[\W_]*k\b/iu,
  /\bw[\W_]*e[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k\b/iu,
  /\bp[\W_]*a[\W_]*k[\W_]*i\b/iu,
  /\bf[\W_]*a[\W_]*g[\W_]*g?\b/iu,
  /\bf[\W_]*a[\W_]*g[\W_]*g[\W_]*o[\W_]*t+t?\b/iu,
  /\bf[\W_]*a[\W_]*g[\W_]*g[\W_]*o[\W_]*t\b/iu,
  /\bt[\W_]*r[\W_]*a[\W_]*n[\W_]*n[\W_]*[yi]\b/iu,
  /\bd[\W_]*y[\W_]*k[\W_]*e\b/iu,
];

const LEET_MAP = new Map([
  ["0", "o"],
  ["1", "i"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["6", "g"],
  ["7", "t"],
  ["8", "b"],
  ["9", "g"],
  ["@", "a"],
  ["$", "s"],
  ["!", "i"],
  ["|", "i"],
]);

function toLeetNormalized(input) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

function parseWordArrayFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => x.length >= 3);
  } catch {
    return [];
  }
}

function loadCustomHateWords() {
  const singleFile = path.resolve(__dirname, "../Config/automodRacistWords.json");
  const folderPath = path.resolve(__dirname, "../Config/automodRacistWords");
  const all = new Set(parseWordArrayFile(singleFile));
  try {
    if (fs.existsSync(folderPath)) {
      const entries = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter(
          (e) =>
            e.isFile() &&
            e.name.toLowerCase().endsWith(".json") &&
            e.name.toLowerCase() !== "sources.json",
        )
        .map((e) => path.join(folderPath, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (_) {}
  return [...all];
}

const CUSTOM_HATE_WORDS = loadCustomHateWords();

function findHateSpeechMatch(content) {
  const text = String(content || "");
  if (!text.trim()) return null;
  const normalizedBase = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = toLeetNormalized(normalizedBase);
  const normalizedTokens = normalized
    .split(/[^\p{L}\p{N}]+/gu)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const tokenSet = new Set(normalizedTokens);

  for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
    const re = RACIST_WORD_PATTERNS[i];
    if (re.test(text) || re.test(normalized)) {
      return { source: "regex", term: `pattern#${i + 1}` };
    }
  }

  for (const term of CUSTOM_HATE_WORDS) {
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
      if (padded.includes(needle)) {
        return { source: "custom_phrase", term };
      }
    } else if (tokenSet.has(normalizedTerm)) {
      return { source: "custom_token", term };
    }
  }

  return null;
}

module.exports = {
  findHateSpeechMatch,
  loadCustomHateWords,
  CUSTOM_HATE_WORDS,
  RACIST_WORD_PATTERNS,
  toLeetNormalized,
};
