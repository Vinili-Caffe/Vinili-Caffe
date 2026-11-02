/**
 * Wordle (+wordle): daily puzzle by site language, 6 attempts, Discord-colored grid.
 * Guess dictionaries: bundled FrequencyWords banks (~5k/lang). Answers: curated IT/EN + freq top-500 for ES/FR/DE/PT.
 */
"use strict";

const {
  getWordleAnswers: fallbackAnswers,
  getWordleGuesses: fallbackGuesses,
  normalizeWordleLang,
  WORDLE_LANGS,
} = require("../../Minigames/data/wordleBanks");

const MAX_ATTEMPTS = 6;
const WORD_LEN = 5;

/** @type {Map<string, object>} */
const sessions = new Map();
/** @type {Map<string, string>} userId -> last lang */
const preferredLang = new Map();

/** @type {{ guesses: Record<string, Set<string>>, loadedAt: number, meta: object } | null} */
let dictCache = null;

function normalizeWord(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function todayKey(timeZone = "Europe/Rome") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p?) => p.type === "year")?.value;
    const m = parts.find((p?) => p.type === "month")?.value;
    const d = parts.find((p?) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (e) {}
  return new Date().toISOString().slice(0, 10);
}

function hashPick(seed?, modulo?) {
  let h = 2166136261;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, modulo);
}

function parseLang(raw?) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (v === "eng" || v === "english" || v === "inglese") return "en";
  if (v === "ita" || v === "italian" || v === "italiano") return "it";
  if (v === "spa" || v === "spanish" || v === "espanol" || v === "español") return "es";
  if (v === "fra" || v === "french" || v === "francais" || v === "français") return "fr";
  if (v === "deu" || v === "ger" || v === "german" || v === "deutsch") return "de";
  if (v === "por" || v === "portuguese" || v === "portugues" || v === "português") return "pt";
  const base = v.slice(0, 2);
  return normalizeWordleLang(base);
}

function sessionKey(userId?, lang?, day?) {
  return `${userId}:${lang}:${day}`;
}

function buildDictCache() {
  /** @type {Record<string, Set<string>>} */
  const guesses: Record<string, any> = {};
  /** @type {Record<string, number>} */
  const sizes: Record<string, any> = {};
  for (const lang of WORDLE_LANGS) {
    guesses[lang] = new Set(fallbackGuesses(lang));
    sizes[lang] = guesses[lang].size;
  }
  return {
    guesses,
    loadedAt: Date.now(),
    meta: { source: "bundled", guesses: sizes },
  };
}

async function ensureReady(_cfg?) {
  if (!dictCache) dictCache = buildDictCache();
  return dictCache;
}

function getAnswers(lang?) {
  return [...fallbackAnswers(normalizeWordleLang(lang))];
}

function pickDailyAnswer(lang?, day?) {
  const k = normalizeWordleLang(lang);
  const bank = getAnswers(k);
  if (!bank.length) return k === "en" ? "crane" : "cuore";
  return bank[hashPick(`vc-wordle:${k}:${day}`, bank.length)];
}

function getSession(userId?, lang?) {
  return sessions.get(sessionKey(userId, lang, todayKey())) || null;
}

/**
 * Classic Wordle coloring with duplicate-letter handling.
 * @returns {("g"|"y"|"b")[]}
 */
function scoreGuess(answer?, guess?) {
  const a = normalizeWord(answer).split("");
  const g = normalizeWord(guess).split("");
  const out = Array(WORD_LEN).fill("b");
  const remain = Object.create(null);

  for (let i = 0; i < WORD_LEN; i++) {
    if (g[i] === a[i]) {
      out[i] = "g";
    } else {
      remain[a[i]] = (remain[a[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (out[i] === "g") continue;
    const ch = g[i];
    if (remain[ch] > 0) {
      out[i] = "y";
      remain[ch] -= 1;
    }
  }
  return out;
}

function isValidGuess(lang?, raw?) {
  const w = normalizeWord(raw);
  if (w.length !== WORD_LEN) return { ok: false, reason: "len" };
  const k = normalizeWordleLang(lang);
  if (!dictCache) dictCache = buildDictCache();
  const set = dictCache.guesses?.[k];
  if (set) {
    if (!set.has(w)) return { ok: false, reason: "dict" };
  } else if (!fallbackGuesses(k).includes(w)) {
    return { ok: false, reason: "dict" };
  }
  return { ok: true, word: w };
}

function statusLabel(session?) {
  if (session.won) return `✅ Vinto in **${session.guesses.length}/${MAX_ATTEMPTS}**`;
  if (session.lost) return `❌ Perso · parola: **${session.answer.toUpperCase()}**`;
  return `Tentativo **${session.guesses.length}/${MAX_ATTEMPTS}** · apri **Gioca sul sito**`;
}

function langLabel(lang?) {
  return String(normalizeWordleLang(lang) || "it").toUpperCase();
}

export = {
  MAX_ATTEMPTS,
  WORD_LEN,
  WORDLE_LANGS,
  normalizeWord,
  todayKey,
  parseLang,
  ensureReady,
  getSession,
  scoreGuess,
  isValidGuess,
  statusLabel,
  langLabel,
  pickDailyAnswer,
};
