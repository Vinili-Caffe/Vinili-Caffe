const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const MARKOV_EXTRA_BANNED_TOKENS = Object.freeze([
  "negroni",
  "negrona",
  "negrone",
  "negronas",
  "negronis",
  "niger",
]);

const MARKOV_SUBSTRING_BANNED_TERMS = Object.freeze([
  "niger",
  "nigger",
  "nigga",
  "niggas",
  "niggers",
]);

const RACIST_WORD_PATTERNS = [
    /\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3a@][\W_]*)?r?\b/iu,
    /n[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3a@][\W_]*)?r?/iu,
  /n[\W_]*[i1l!|][\W_]*g[\W_]*[e3][\W_]*r/iu,
  /\bk[\W_]*i[\W_]*k[\W_]*e\b/iu,
  /\bc[\W_]*h[\W_]*i[\W_]*n[\W_]*k\b/iu,
  /\bw[\W_]*e[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k\b/iu,
  /\bp[\W_]*a[\W_]*k[\W_]*i\b/iu,
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

const RACIST_WORDS_DIR = path.resolve(__dirname, "../../Vinili/Utils/Config/automodRacistWords");
const RACIST_WORDS_FILE = path.resolve(__dirname, "../../Vinili/Utils/Config/automodRacistWords.json");

let cachedTerms = null;
let cachedSubstringTerms = null;

function parseWordArrayFile(filePath?) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x?) => String(x || "").trim().toLowerCase())
      .filter((x?) => x.length >= 3);
  } catch {
    return [];
  }
}

function toLeetNormalized(input?) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

function normalizeTerm(term?) {
  return toLeetNormalized(
    String(term || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
  );
}

function compactAlnum(text?) {
  return String(text || "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function loadBannedTerms() {
  if (cachedTerms) return cachedTerms;
  const all = new Set(MARKOV_EXTRA_BANNED_TOKENS.map(normalizeTerm).filter(Boolean));
  for (const word of parseWordArrayFile(RACIST_WORDS_FILE)) {
    const n = normalizeTerm(word);
    if (n) all.add(n);
  }
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
        for (const word of parseWordArrayFile(file)) {
          const n = normalizeTerm(word);
          if (n) all.add(n);
        }
      }
    }
  } catch (err) {
    global.logger?.warn?.("[MARKOV] banned words load failed:", err?.message || err);
  }
  cachedTerms = [...all];
  return cachedTerms;
}

function loadSubstringBannedTerms() {
  if (cachedSubstringTerms) return cachedSubstringTerms;
  const all = new Set(
    MARKOV_SUBSTRING_BANNED_TERMS.map(normalizeTerm).filter((t?) => t && t.length >= 4),
  );
    for (const term of loadBannedTerms()) {
    if (!term || /\s/.test(term)) continue;
    if (/^n+i+g+/.test(term) && term.length >= 4) all.add(term);
  }
  cachedSubstringTerms = [...all];
  return cachedSubstringTerms;
}

function normalizeForCheck(text?) {
  return toLeetNormalized(
    String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function tokenMatchesBannedTerm(token?, term?) {
  if (!token || !term) return false;
  if (token === term) return true;
  if (/\s/.test(term)) return false;
  if (term.length < 4) return false;
  const maxExtra = 3;
  return token.startsWith(term) && token.length <= term.length + maxExtra;
}

function findBannedWordMatch(text?) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const normalized = normalizeForCheck(raw);
  if (!normalized) return null;
  const compact = compactAlnum(normalized);

  for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
    const re = RACIST_WORD_PATTERNS[i];
    if (re.test(raw) || re.test(normalized)) {
      return { source: "regex", term: `pattern#${i + 1}` };
    }
  }

  for (const term of loadSubstringBannedTerms()) {
    if (!term) continue;
    if (normalized.includes(term) || compact.includes(term)) {
      return { source: "substring", term };
    }
  }

  const tokens = normalized
    .split(/[^\p{L}\p{N}]+/gu)
    .map((x?) => String(x || "").trim())
    .filter(Boolean);
  const tokenSet = new Set(tokens);
  const terms = loadBannedTerms();

  for (const term of terms) {
    if (!term) continue;
    if (/\s/.test(term)) {
      const padded = ` ${normalized} `;
      if (padded.includes(` ${term} `)) {
        return { source: "phrase", term };
      }
      continue;
    }
    if (tokenSet.has(term)) {
      return { source: "token", term };
    }
    for (const token of tokens) {
      if (tokenMatchesBannedTerm(token, term)) {
        return { source: "token_prefix", term, matched: token };
      }
    }
  }
  return null;
}

function isMarkovBannedText(text?) {
  return Boolean(findBannedWordMatch(text));
}

function filterBannedLines(lines?) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line?) => !isMarkovBannedText(line));
}

export = {
  isMarkovBannedText,
  filterBannedLines,
  loadBannedTerms,
};
