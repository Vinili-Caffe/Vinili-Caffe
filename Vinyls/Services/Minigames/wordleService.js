/**
 * Wordle (+wordle): daily puzzle IT/EN, 6 attempts, Discord-colored grid.
 * Dictionaries loaded from public APIs (bank only as offline fallback).
 */
"use strict";

const axios = require("axios");
const {
  getWordleAnswers: fallbackAnswers,
  getWordleGuesses: fallbackGuesses,
} = require("../../Data/Minigames/wordleBanks");

const MAX_ATTEMPTS = 6;
const WORD_LEN = 5;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_IT_API =
  "https://cdn.jsdelivr.net/npm/italian-words-dict@3.4.0/dist/words.json";
const DEFAULT_EN_ANSWERS_API =
  "https://cdn.jsdelivr.net/gh/charlesreid1/five-letter-words@master/sgb-words.txt";
const DEFAULT_EN_GUESSES_API =
  "https://cdn.jsdelivr.net/gh/tabatkins/wordle-list@main/words";

/** @type {Map<string, object>} */
const sessions = new Map();
/** @type {Map<string, string>} userId -> last lang */
const preferredLang = new Map();

/** @type {{ itAnswers: string[], enAnswers: string[], guessSet: Set<string>, loadedAt: number } | null} */
let dictCache = null;
/** @type {Promise<void> | null} */
let loadPromise = null;

function normalizeWord(raw) {
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
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (e) {}
  return new Date().toISOString().slice(0, 10);
}

function hashPick(seed, modulo) {
  let h = 2166136261;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, modulo);
}

function parseLang(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "en" || v === "eng" || v === "english" || v === "inglese") return "en";
  if (v === "it" || v === "ita" || v === "italian" || v === "italiano") return "it";
  return null;
}

function sessionKey(userId, lang, day) {
  return `${userId}:${lang}:${day}`;
}

function extractWordsFromPayload(payload) {
  if (typeof payload === "string") {
    return payload
      .split(/\r?\n|,|\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.data)) return payload.data;
  if (typeof payload?.word === "string") return [payload.word];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return Object.keys(payload).filter((k) => typeof k === "string");
  }
  return [];
}

function toFiveLetterList(rawList) {
  const out = [];
  const seen = new Set();
  for (const item of rawList || []) {
    const w = normalizeWord(item);
    if (w.length !== WORD_LEN) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

async function fetchWordList(url) {
  if (!url) return [];
  const res = await axios.get(url, {
    timeout: 20000,
    responseType: "text",
    transformResponse: [(data) => data],
    validateStatus: (s) => s >= 200 && s < 300,
  });
  let payload = res.data;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        payload = JSON.parse(trimmed);
      } catch (e) {
        payload = trimmed;
      }
    }
  }
  return toFiveLetterList(extractWordsFromPayload(payload));
}

function buildFallbackCache() {
  const itAnswers = [...fallbackAnswers("it")];
  const enAnswers = [...fallbackAnswers("en")];
  const guessSet = new Set(fallbackGuesses("it"));
  return { itAnswers, enAnswers, guessSet, loadedAt: Date.now() };
}

async function loadDictionaries(cfg) {
  const itUrl = cfg?.itApiUrl || cfg?.apiUrlIt || DEFAULT_IT_API;
  const enAnswersUrl =
    cfg?.enAnswersApiUrl || cfg?.apiUrlEnAnswers || DEFAULT_EN_ANSWERS_API;
  const enGuessesUrl =
    cfg?.enGuessesApiUrl || cfg?.apiUrlEnGuesses || DEFAULT_EN_GUESSES_API;

  const [itRes, enAnsRes, enGuessRes] = await Promise.allSettled([
    fetchWordList(itUrl),
    fetchWordList(enAnswersUrl),
    fetchWordList(enGuessesUrl),
  ]);

  const itAnswers =
    itRes.status === "fulfilled" && itRes.value.length
      ? itRes.value
      : [...fallbackAnswers("it")];
  const enAnswers =
    enAnsRes.status === "fulfilled" && enAnsRes.value.length
      ? enAnsRes.value
      : [...fallbackAnswers("en")];
  const enGuesses =
    enGuessRes.status === "fulfilled" && enGuessRes.value.length
      ? enGuessRes.value
      : [...fallbackAnswers("en")];

  const guessSet = new Set([...itAnswers, ...enAnswers, ...enGuesses]);
  for (const w of fallbackGuesses("it")) guessSet.add(w);

  return {
    itAnswers,
    enAnswers,
    guessSet,
    loadedAt: Date.now(),
    meta: {
      it: itAnswers.length,
      enAnswers: enAnswers.length,
      guesses: guessSet.size,
      itSource: itRes.status === "fulfilled" && itRes.value.length ? "api" : "fallback",
      enAnswersSource:
        enAnsRes.status === "fulfilled" && enAnsRes.value.length ? "api" : "fallback",
      enGuessesSource:
        enGuessRes.status === "fulfilled" && enGuessRes.value.length ? "api" : "fallback",
    },
  };
}

async function ensureReady(cfg) {
  const ttl = Number(cfg?.cacheTtlMs) > 0 ? Number(cfg.cacheTtlMs) : DEFAULT_CACHE_TTL_MS;
  if (dictCache && Date.now() - dictCache.loadedAt < ttl) return dictCache;

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        dictCache = await loadDictionaries(cfg || {});
      } catch (err) {
        console.warn("[wordle] dictionary load failed, using fallback bank:", err?.message || err);
        dictCache = buildFallbackCache();
      } finally {
        loadPromise = null;
      }
    })();
  }
  await loadPromise;
  return dictCache;
}

function getAnswers(lang) {
  /* itAnswersApiPollute1: italian-words-dict include prestiti EN (es. dance) →
     le risposte giornaliere restano sul bank curato; l'API allarga solo i guess. */
  return [...fallbackAnswers(lang === "en" ? "en" : "it")];
}

function pickDailyAnswer(lang, day) {
  const bank = getAnswers(lang);
  if (!bank.length) return lang === "en" ? "crane" : "cuore";
  return bank[hashPick(`vc-wordle:${lang}:${day}`, bank.length)];
}

function getOrCreateSession(userId, lang) {
  const day = todayKey();
  const key = sessionKey(userId, lang, day);
  let s = sessions.get(key);
  if (!s) {
    s = {
      userId: String(userId),
      lang,
      day,
      answer: pickDailyAnswer(lang, day),
      guesses: [],
      won: false,
      lost: false,
      channelId: null,
      messageId: null,
    };
    sessions.set(key, s);
  }
  preferredLang.set(String(userId), lang);
  return s;
}

function getSession(userId, lang) {
  return sessions.get(sessionKey(userId, lang, todayKey())) || null;
}

function bindBoardMessage(session, message) {
  if (!session || !message) return;
  session.channelId = String(message.channelId || message.channel?.id || "") || null;
  session.messageId = String(message.id || "") || null;
}

function resolveUserLang(userId, argLang) {
  if (argLang) return argLang;
  return preferredLang.get(String(userId)) || "it";
}

/**
 * Classic Wordle coloring with duplicate-letter handling.
 * @returns {("g"|"y"|"b")[]}
 */
function scoreGuess(answer, guess) {
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

function tilesForRow(answer, guess) {
  const marks = scoreGuess(answer, guess);
  // spaced so Discord doesn't glue them into a dark blob
  return marks
    .map((m) => (m === "g" ? "🟩" : m === "y" ? "🟨" : "⬛"))
    .join(" ");
}

function lettersLine(guess) {
  return normalizeWord(guess)
    .toUpperCase()
    .split("")
    .join(" · ");
}

function emptyRow() {
  return "⬜ ⬜ ⬜ ⬜ ⬜";
}

function buildBoardText(session) {
  const lines = [];
  for (const g of session.guesses) {
    lines.push("`" + lettersLine(g) + "`");
    lines.push(tilesForRow(session.answer, g));
  }
  const left = MAX_ATTEMPTS - session.guesses.length;
  for (let i = 0; i < left; i++) {
    lines.push(emptyRow());
  }
  return lines.join("\n");
}

function isValidGuess(lang, raw) {
  const w = normalizeWord(raw);
  if (w.length !== WORD_LEN) return { ok: false, reason: "len" };
  const set = dictCache?.guessSet;
  if (set) {
    if (!set.has(w)) return { ok: false, reason: "dict" };
  } else if (!fallbackGuesses(lang).includes(w)) {
    return { ok: false, reason: "dict" };
  }
  return { ok: true, word: w };
}

function applyGuess(session, raw) {
  if (session.won || session.lost) {
    return { ok: false, reason: "done" };
  }
  const check = isValidGuess(session.lang, raw);
  if (!check.ok) return check;
  if (session.guesses.includes(check.word)) {
    return { ok: false, reason: "dup" };
  }
  session.guesses.push(check.word);
  if (check.word === session.answer) {
    session.won = true;
  } else if (session.guesses.length >= MAX_ATTEMPTS) {
    session.lost = true;
  }
  return { ok: true, word: check.word, session };
}

function statusLabel(session) {
  if (session.won) return `✅ Vinto in **${session.guesses.length}/${MAX_ATTEMPTS}**`;
  if (session.lost) return `❌ Perso · parola: **${session.answer.toUpperCase()}**`;
  return `Tentativo **${session.guesses.length}/${MAX_ATTEMPTS}** · apri **Gioca sul sito**`;
}

function langLabel(lang) {
  return lang === "en" ? "EN" : "IT";
}

function getDictMeta() {
  return dictCache?.meta || null;
}

function isWordleCustomId(customId) {
  return /^wordle:(guess|lang|help|modal):/.test(String(customId || ""));
}

function parseWordleCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "wordle" || parts.length < 3) return null;
  const action = parts[1];
  if (action === "lang") {
    return { action, lang: parts[2], userId: parts[3] };
  }
  return { action, userId: parts[2] };
}

module.exports = {
  MAX_ATTEMPTS,
  WORD_LEN,
  normalizeWord,
  todayKey,
  parseLang,
  ensureReady,
  getOrCreateSession,
  getSession,
  bindBoardMessage,
  resolveUserLang,
  scoreGuess,
  buildBoardText,
  applyGuess,
  isValidGuess,
  statusLabel,
  langLabel,
  pickDailyAnswer,
  getDictMeta,
  isWordleCustomId,
  parseWordleCustomId,
};
