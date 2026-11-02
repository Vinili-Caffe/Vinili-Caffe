/** Minigiochi: testo delle risposte (normalizzazione, alias, confronto), indizi e domande di matematica. */
const { CAPITAL_COUNTRY_REGION, REGION_HINT_DATA } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { randomBetween, normalizePlayerGuess, buildCompactAlias } = require("./minigameSources") as typeof import("./minigameSources");

function shuffleString(value?) {
  const arr = String(value || "").split("");
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

function normalizeWord(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function compactNoSpaces(s?) {
  return String(s || "").replace(/\s+/g, "").trim();
}

function normalizeUserAnswerText(raw?) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0060\u00B4\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim();
}

function isValidGuessWord(word?) {
  if (!word) return false;
  if (word.length < 4 || word.length > 10) return false;
  return /^\p{L}+$/u.test(word);
}

const ALLOWED_REWARD_EXP = [100, 150, 200, 250];

function normalizeRewardExp(value?) {
  const num = Number(value);
  if (!Number.isFinite(num)) return ALLOWED_REWARD_EXP[0];
  let best = ALLOWED_REWARD_EXP[0];
  let bestDist = Math.abs(num - best);
  for (const a of ALLOWED_REWARD_EXP) {
    const d = Math.abs(num - a);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function decodeHtmlEntities(value?) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeURIComponent(value?) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function decodeQuizText(value?) {
  return decodeHtmlEntities(safeDecodeURIComponent(value));
}

function isLikelyItalianText(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const italianHints = new Set(["il", "lo", "la", "i", "gli", "le", "un", "una", "di", "del", "della", "che", "con", "per", "quale", "quando", "dove", "come", "chi", "quanti", "cosa",]);
  const englishHints = new Set(["the", "what", "which", "when", "where", "who", "how", "is", "are", "was", "were", "of", "in", "on",]);

  let itScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (italianHints.has(token)) itScore += 1;
    if (englishHints.has(token)) enScore += 1;
  }

  return itScore >= enScore;
}

function normalizeTruthValue(raw?) {
  const v = normalizeCountryName(raw);
  if (!v) return null;
  if (["vero", "v", "true", "t", "si", "sì", "yes", "y"].includes(v)) return true;
  if (["falso", "f", "false", "no", "n"].includes(v)) return false;
  return null;
}

function buildStrictBankAliases(values = [], normalizer = normalizeCountryName) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizer(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
    const nospace = compactNoSpaces(normalized);
    if (nospace && nospace !== normalized) out.add(nospace);
  }
  return Array.from(out.values());
}

function isExplicitBankAnswerCorrect(rawGuess?, rawAnswers?, normalizer = normalizeCountryName, _minTokenLength = 1) {
  // Risposta intera: niente token-set / pezzi della frase.
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizer);
}

function createMathQuestion() {
  const formatAnswer = (value?) => { const num = Number(value); if (!Number.isFinite(num)) return String(value); if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num)); return String(Number(num.toFixed(2))); };

  const generators = [() => {
    const a = randomBetween(2, 60); const b = randomBetween(2, 60); const c = randomBetween(2, 40); return {
      expression: `${a}+${b}+${c}`,
      answer: formatAnswer(a + b + c),
    };
  },
  () => {
    let a = randomBetween(40, 120);
    const b = randomBetween(2, 50);
    const c = randomBetween(2, 30);
    if (a < b + c) a = b + c + randomBetween(5, 25);
    return {
      expression: `${a}-${b}-${c}`,
      answer: formatAnswer(a - b - c),
    };
  },
  () => {
    const a = randomBetween(2, 14);
    const b = randomBetween(2, 12);
    const c = randomBetween(2, 6);
    return {
      expression: `${a}×${b}×${c}`,
      answer: formatAnswer(a * b * c),
    };
  },
  () => {
    const divisor = randomBetween(2, 12);
    const result = randomBetween(2, 20);
    const dividend = divisor * result;
    return {
      expression: `${dividend}÷${divisor}`,
      answer: formatAnswer(result),
    };
  },
  () => {
    const root = randomBetween(2, 20);
    const n = root * root;
    return {
      expression: `√${n}`,
      answer: formatAnswer(root),
    };
  },
  () => {
    const a = randomBetween(2, 18);
    const b = randomBetween(2, 12);
    const c = randomBetween(2, 20);
    const d = randomBetween(2, 14);
    const left = a * b;
    return {
      expression: `(${a}×${b})+${c}-${d}`,
      answer: formatAnswer(left + c - d),
    };
  },
  () => {
    const root = randomBetween(2, 12);
    const n = root * root;
    const a = randomBetween(2, 30);
    const b = randomBetween(2, 20);
    return {
      expression: `√${n}+${a}-${b}`,
      answer: formatAnswer(root + a - b),
    };
  },
  ];

  const pick = generators[randomBetween(0, generators.length - 1)];
  return pick();
}

function parseMathGuess(raw?) {
  const compact = normalizeUserAnswerText(raw).replace(/\s+/g, "");
  if (!compact) return null;
  if (/[\p{L}]/u.test(compact)) return null;
  const base = compact.replace(/[^0-9+\-*/().,×÷]/g, "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!base) return null;
  if (/^-?\d+(\.\d+)?$/.test(base)) {
    const value = Number(base);
    return Number.isFinite(value) ? value : null;
  }
  if (!/^[0-9+\-*/().]+$/.test(base)) return null;
  try {
    const evaluated = Number(Function(`"use strict"; return (${base});`)());
    return Number.isFinite(evaluated) ? evaluated : null;
  } catch {
    return null;
  }
}

function normalizeCharForGuess(ch?) {
  return String(ch || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function maskHangmanWord(word?, guessed = new Set()) {
  return String(word || "")
    .split("")
    .map((ch?) => (guessed.has(normalizeCharForGuess(ch)) ? ch : "_"))
    .join(" ");
}

function isStrictAliasGuessCorrect(
  rawGuess?,
  rawAnswers?,
  normalizer = normalizeCountryName,
) {
  const guess = normalizer(rawGuess);
  if (!guess) return false;

  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a?) => normalizer(a)).filter(Boolean) : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const uniqueAnswers = Array.from(new Set(answers));
  const compactGuess = compactNoSpaces(guess);

  for (const answer of uniqueAnswers) {
    if (guess === answer) return true;
    if (compactGuess && compactGuess === compactNoSpaces(answer)) return true;
  }
  return false;
}

function extractWordGuessCandidates(raw?) {
  const lower = String(raw || "").toLowerCase();
  const tokens = lower
    .split(/[^a-zà-öø-ÿ]+/i)
    .map((t?) => t.trim())
    .filter(Boolean)
    .filter((t?) => t.length >= 4 && t.length <= 10);
  return Array.from(new Set(tokens));
}

function buildPlayerAnswerAliases(name?, aliases = []) {
  const out = new Set();
  const add = (value?) => {
    const normalized = normalizePlayerGuess(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  };
  add(name);
  const extra = Array.isArray(aliases) ? aliases : [];
  for (const alias of extra) add(alias);
  return Array.from(out.values());
}

function buildPlainMaskedTextHint(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const plain = normalized.replace(/\s+/g, "");
  if (plain.length <= 2) return `Inizia con "${plain[0] || "?"}"`;
  return `Inizia con "${plain[0]}" e termina con "${plain[plain.length - 1]}" (${plain.length} lettere)`;
}

const ACCENT_TO_ASCII = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ā: "a", ă: "a", ą: "a", æ: "ae",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ĕ: "e", ė: "e", ę: "e", ě: "e",
  ì: "i", í: "i", î: "i", ï: "i", ı: "i", ī: "i", ĭ: "i", į: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ō: "o", ŏ: "o", ő: "o", œ: "oe",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ŭ: "u", ů: "u", ű: "u",
  ñ: "n", Ñ: "N", ç: "c", Ç: "C", ý: "y", ÿ: "y", ß: "ss",
  À: "A", Á: "A", Â: "A", Ã: "A", Ä: "A", Å: "A", È: "E", É: "E", Ê: "E", Ë: "E",
  Ì: "I", Í: "I", Î: "I", Ï: "I", Ò: "O", Ó: "O", Ô: "O", Õ: "O", Ö: "O",
  Ù: "U", Ú: "U", Û: "U", Ü: "U",
};

function normalizeHintTextForDiscord(str?) {
  if (str == null || typeof str !== "string") return "";
  let s = String(str).normalize("NFKC");
  const out = [];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (!Number.isFinite(cp)) {
      out.push(ch);
      continue;
    }
    if (ACCENT_TO_ASCII[ch] !== undefined) {
      out.push(ACCENT_TO_ASCII[ch]);
      continue;
    }
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out.push(String.fromCodePoint(cp - 0xff01 + 0x21));
      continue;
    }
    if (cp >= 0x1d400 && cp <= 0x1d7ff) {
      const mathToAscii = [
        [0x1d400, 0x1d419, 0x41], [0x1d41a, 0x1d433, 0x61], [0x1d434, 0x1d44d, 0x41], [0x1d44e, 0x1d467, 0x61],
        [0x1d468, 0x1d481, 0x41], [0x1d482, 0x1d49b, 0x61], [0x1d49c, 0x1d4b5, 0x41], [0x1d4b6, 0x1d4cf, 0x61],
        [0x1d4d0, 0x1d4e9, 0x41], [0x1d4ea, 0x1d503, 0x61], [0x1d504, 0x1d51d, 0x41], [0x1d51e, 0x1d537, 0x61],
        [0x1d538, 0x1d551, 0x41], [0x1d552, 0x1d56b, 0x61], [0x1d56c, 0x1d585, 0x41], [0x1d586, 0x1d59f, 0x61],
        [0x1d5a0, 0x1d5b9, 0x41], [0x1d5ba, 0x1d5d3, 0x61], [0x1d5d4, 0x1d5ed, 0x41], [0x1d5ee, 0x1d607, 0x61],
        [0x1d608, 0x1d621, 0x41], [0x1d622, 0x1d63b, 0x61], [0x1d63c, 0x1d655, 0x41], [0x1d656, 0x1d66f, 0x61],
        [0x1d670, 0x1d689, 0x41], [0x1d68a, 0x1d6a3, 0x61],
        [0x1d7ce, 0x1d7d7, 0x30], [0x1d7e2, 0x1d7eb, 0x30], [0x1d7ec, 0x1d7f5, 0x30],
      ];
      let mapped = null;
      for (const [start, end, base] of mathToAscii) {
        if (cp >= start && cp <= end) {
          mapped = String.fromCodePoint(base + (cp - start));
          break;
        }
      }
      out.push(mapped ?? ch);
      continue;
    }
    if (cp <= 0x7f) {
      out.push(ch);
      continue;
    }
    const decomp = ch.normalize("NFD");
    if (decomp.length >= 1 && decomp[0].codePointAt(0) <= 0x7f) {
      out.push(decomp[0]);
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

function buildRevealHint(value?, revealRatio = 0.4, includeEmoji = false) {
  const raw = (typeof value === "string" ? value : String(value || ""));
  const normalized = normalizeHintTextForDiscord(raw).trim();
  if (!normalized) return null;
  const chars = normalized.split("");
  const charsLower = normalized.toLowerCase().split("");
  const indices = charsLower
    .map((_?, i?) => i)
    .filter((i?) => /[a-z0-9]/.test(charsLower[i]));
  if (indices.length === 0) return null;
  const wrap = (s?) => (includeEmoji ? `<a:VC_Flame:1482725674711126140> **${s}**` : `**${s}**`);
  const isLetterOrDigit = (c?) => /[a-z0-9]/i.test(c);
  if (indices.length <= 2) {
    const out = chars.map((c?, i?) => (indices.includes(i) ? c : isLetterOrDigit(c) ? "_" : c)).join("");
    return wrap(out.replace(/_/g, "\\_"));
  }
  const toReveal = Math.max(2, Math.min(indices.length, Math.round(indices.length * Math.min(0.5, Math.max(0.35, revealRatio)))));
  const revealedSet = new Set([indices[0], indices[indices.length - 1]]);
  const middle = indices.slice(1, -1);
  const step = middle.length <= 1 ? 1 : Math.max(1, Math.floor(middle.length / (toReveal - 2)));
  for (let k = 0; k < middle.length && revealedSet.size < toReveal; k += step) {
    revealedSet.add(middle[k]);
  }
  const out = chars.map((c?, i?) => {
    if (revealedSet.has(i)) return c;
    if (isLetterOrDigit(c)) return "_";
    return c;
  });
  const rawOut = out.join("");
  const escapedForDiscord = rawOut.replace(/_/g, "\\_");
  return wrap(escapedForDiscord);
}

function buildCountryHint(country?) {
  if (!country) return null;
  const parts = [];
  if (country.region) parts.push(`Continente: **${country.region}**`);
  if (country.subregion) parts.push(`Area: **${country.subregion}**`);
  if (country.populationLabel) parts.push(`Popolazione: **${country.populationLabel}**`);
  if (Array.isArray(country.languages) && country.languages.length) {
    parts.push(`Lingua/e: **${country.languages.slice(0, 2).join(", ")}**`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1482725674711126140> ${parts.join(" \u2022 ")}`;
}

function buildCapitalHint(countryName?) {
  const key = normalizeCountryName(countryName || "").replace(/\s+/g, " ");
  const region = key ? CAPITAL_COUNTRY_REGION[key] : null;
  if (!region) return null;
  return `<a:VC_Flame:1482725674711126140> Capitale di un paese in **${region}**.`;
}

function buildRegionCapitalHint(regionName?) {
  const data = regionName ? REGION_HINT_DATA[regionName] : null;
  if (!data) return null;
  const parts = [];
  if (Array.isArray(data.near) && data.near.length) {
    parts.push(`confina con **${data.near.join("** e **")}**`);
  }
  if (data.sea) {
    parts.push(`si affaccia sul **${data.sea}**`);
  }
  if (data.population) {
    parts.push(`ha circa **${data.population}** abitanti`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1482725674711126140> Capoluogo di una regione che ${parts.join(" • ")}.`;
}

function buildNumberNearHint(target?, min?, max?) {
  const low = Number(min || 1);
  const high = Number(max || 100);
  const range = Math.max(1, high - low);
  const band = Math.max(2, Math.round(range * 0.18));
  const from = Math.max(low, Number(target) - band);
  const to = Math.min(high, Number(target) + band);
  return `<a:VC_Flame:1482725674711126140> Il numero è tra **${from}** e **${to}**.`;
}

function shuffleArray(arr?) {
  const a = Array.isArray(arr) ? [...arr] : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeMemorySequence(value?) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\uFE0F/g, "")
    .replace(/[\s,;|`*_~>"'’·•]+/g, "")
    .trim();
}

function memoryEmojiMessageMatches(content?, normalizedSequence?) {
  const want = String(normalizedSequence || "");
  if (!want) return false;
  const raw = String(content || "");
  if (normalizeMemorySequence(raw) === want) return true;
  for (const line of raw.split(/\r?\n/)) {
    const n = normalizeMemorySequence(line);
    if (n && n === want) return true;
  }
  return false;
}

function displayMemorySequence(row?) {
  if (Array.isArray(row?.sequence)) return row.sequence.map((x?) => String(x || "").trim()).filter(Boolean).join(" ");
  return String(row?.sequence || "").trim();
}

export = { shuffleString, normalizeWord, compactNoSpaces, normalizeUserAnswerText, isValidGuessWord, normalizeRewardExp, decodeQuizText, isLikelyItalianText, normalizeTruthValue, buildStrictBankAliases, isExplicitBankAnswerCorrect, createMathQuestion, parseMathGuess, normalizeCharForGuess, maskHangmanWord, isStrictAliasGuessCorrect, extractWordGuessCandidates, buildPlayerAnswerAliases, buildPlainMaskedTextHint, buildRevealHint, buildCountryHint, buildCapitalHint, buildRegionCapitalHint, buildNumberNearHint, shuffleArray, normalizeMemorySequence, memoryEmojiMessageMatches, displayMemorySequence };
