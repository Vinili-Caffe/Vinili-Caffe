"use strict";

const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

/**
 * Hate / racist / homophobic slur filters shared by Discord automod + web tickets.
 * obfuscCatch1: riconosce bypass con spazi, leet, omoglifi (es. lettere separate).
 */
const RACIST_WORD_PATTERNS = [
  /* slur family n*gg* with separators / leet */
  /\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*(?:[e3a@][\W_]*)?r?\b/iu,
  /\bn[\W_]*[i1l!|][\W_]*g[\W_]*[e3][\W_]*r\b/iu,
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

/** Common lookalikes used to bypass keyword filters (Cyrillic / fullwidth / etc.). */
const HOMOGLYPH_MAP = new Map([
  ["а", "a"],
  ["е", "e"],
  ["о", "o"],
  ["р", "p"],
  ["с", "c"],
  ["у", "y"],
  ["х", "x"],
  ["і", "i"],
  ["ї", "i"],
  ["ɡ", "g"],
  ["ｎ", "n"],
  ["ｉ", "i"],
  ["ｅ", "e"],
  ["ｒ", "r"],
  ["ａ", "a"],
  ["ｇ", "g"],
  ["ⅰ", "i"],
  ["ι", "i"],
]);

function toLeetNormalized(input?) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

function foldHomoglyphs(input?) {
  let out = "";
  for (const ch of String(input || "")) {
    out += HOMOGLYPH_MAP.get(ch) || ch;
  }
  return out;
}

function compactAlnum(text?) {
  return String(text || "").replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Collapse only obfuscation runs: 4+ single letters/digits separated by non-alnum
 * (e.g. "n i g g e r", "f.a.g"). Leaves normal words intact.
 */
function collapseObfuscatedRuns(text?) {
  const raw = String(text || "");
  if (!raw) return raw;
  return raw.replace(
    /(^|[^\p{L}\p{N}])((?:[\p{L}\p{N}])(?:[\s\W_]+[\p{L}\p{N}]){3,})(?=$|[^\p{L}\p{N}])/gu,
    (full?, prefix?, run?) => `${prefix}${compactAlnum(run)}`,
  );
}

function normalizeForHateMatch(input?) {
  return toLeetNormalized(
    foldHomoglyphs(
      String(input || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
        .toLowerCase(),
    ),
  );
}

function parseWordArrayFile(filePath?) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x?) => String(x || "").trim().toLowerCase())
      .filter((x?) => x.length >= 3);
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
          (e?) =>
            e.isFile() &&
            e.name.toLowerCase().endsWith(".json") &&
            e.name.toLowerCase() !== "sources.json",
        )
        .map((e?) => path.join(folderPath, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (_) {}
  return [...all];
}

const CUSTOM_HATE_WORDS = loadCustomHateWords();

function normalizeTerm(term?) {
  return normalizeForHateMatch(String(term || "").trim());
}

function findHateSpeechMatch(content?) {
  const text = String(content || "");
  if (!text.trim()) return null;

  const normalized = normalizeForHateMatch(text);
  const collapsed = collapseObfuscatedRuns(normalized);
  const compactFromRuns = compactAlnum(collapsed);
  const variants = [text, normalized, collapsed];

  const tokens = collapsed
    .split(/[^\p{L}\p{N}]+/gu)
    .map((x?) => String(x || "").trim())
    .filter(Boolean);
  const tokenSet = new Set(tokens);

  for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
    const re = RACIST_WORD_PATTERNS[i];
    for (const sample of variants) {
      if (sample && re.test(sample)) {
        return { source: "regex", term: `pattern#${i + 1}` };
      }
    }
  }

  for (const term of CUSTOM_HATE_WORDS) {
    const normalizedTerm = normalizeTerm(term);
    if (!normalizedTerm) continue;
    if (/\s/.test(normalizedTerm)) {
      const needle = ` ${normalizedTerm} `;
      for (const sample of [normalized, collapsed]) {
        if (` ${sample} `.includes(needle)) {
          return { source: "custom_phrase", term };
        }
      }
      continue;
    }
    if (tokenSet.has(normalizedTerm)) {
      return { source: "custom_token", term };
    }
    /* after collapsing spaced letters, term becomes a normal token/substring word */
    if (
      normalizedTerm.length >= 4 &&
      (collapsed.includes(normalizedTerm) || compactFromRuns.includes(normalizedTerm))
    ) {
      /* avoid "snigger"-style: require word boundary in collapsed text */
      const boundary = new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`,
        "iu",
      );
      if (boundary.test(collapsed) || boundary.test(` ${compactFromRuns} `)) {
        return { source: "custom_obfuscated", term };
      }
    }
  }

  return null;
}

export = {
  findHateSpeechMatch,
  loadCustomHateWords,
  CUSTOM_HATE_WORDS,
  RACIST_WORD_PATTERNS,
  toLeetNormalized,
  normalizeForHateMatch,
  collapseObfuscatedRuns,
  compactAlnum,
};
