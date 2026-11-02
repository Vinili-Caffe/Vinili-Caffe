/** Minigiochi quiz: parole, frasi e domande prese da internet (con traduzione). */
const axios = require("axios") as any;
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { polishItalianQuestionText } = require("./minigameImages") as typeof import("./minigameImages");
const { buildAliases } = require("./minigameSources") as typeof import("./minigameSources");
const { pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeWord, isValidGuessWord, decodeQuizText } = require("./minigameText") as typeof import("./minigameText");

let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MYMEMORY_MAX_CHARS = 450;
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const ITALIAN_GK_DEFAULT_CATEGORIES = ["cultura-generale", "storia", "geografia", "scienza", "arte", "musica", "sport", "letteratura", "cinema", "tecnologia",];

async function translateToItalian(text?, cfg: Record<string, any> = {}) {
  if (cfg?.translateApiToItalian === false) return String(text || "").trim();
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const chunks = [];
  let rest = raw;
  while (rest.length > MYMEMORY_MAX_CHARS) {
    const slice = rest.slice(0, MYMEMORY_MAX_CHARS);
    const lastDot = slice.lastIndexOf(".");
    const splitAt = lastDot >= 0 ? lastDot + 1 : MYMEMORY_MAX_CHARS;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);

  const fetchChunk = async (chunk?) => {
    const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(chunk)}&langpair=en|it`;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        const res = await axios.get(url, { timeout: 8000 });
        const t = res?.data?.responseData?.translatedText;
        return t && typeof t === "string" ? t.trim() : chunk;
      } catch (err) {
        const is429 = err?.response?.status === 429;
        if (is429 && attempt === 0) {
          await new Promise((r?) => setTimeout(r, 2500));
          continue;
        }
        return chunk;
      }
    }
    return chunk;
  };
  const results = await Promise.all(chunks.filter(Boolean).map(fetchChunk));
  return results.length ? results.join(" ").replace(/\s+\./g, ".").trim() : raw;
}

function extractWordListFromApiPayload(payload?) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.data)) return payload.data;
  if (typeof payload?.word === "string") return [payload.word];
  if (typeof payload?.text === "string") return [payload.text];
  if (typeof payload?.answer === "string") return [payload.answer];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const keys = Object.keys(payload).filter((k?) => typeof k === "string" && k.trim().length >= 2);
    if (keys.length) return keys;
  }
  return [];
}

async function loadWordList(cfg?) {
  const now = Date.now();
  if (cachedWords && now - cachedWordsAt < WORD_CACHE_TTL_MS)
    return cachedWords;

  const apiUrl = cfg?.guessWord?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      list = extractWordListFromApiPayload(res?.data);
    } catch (err) {
      warnMinigame(err);
    }
  }

  const filtered = list.map(normalizeWord).filter(isValidGuessWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function buildItalianGkApiUrls(cfg?) {
  const rawUrls = Array.isArray(cfg?.italianGK?.apiUrls) ? cfg.italianGK.apiUrls : cfg?.italianGK?.apiUrl ? [cfg.italianGK.apiUrl] : [];

  const categories = Array.isArray(cfg?.italianGK?.categories) && cfg.italianGK.categories.length ? cfg.italianGK.categories : ITALIAN_GK_DEFAULT_CATEGORIES;

  const out = [];
  for (const raw of rawUrls) {
    const base = String(raw || "").trim();
    if (!base) continue;

    if (base.includes("{category}")) {
      const shuffled = categories.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (const category of shuffled) {
        out.push(
          base
            .replace(/\{category\}/g, encodeURIComponent(category))
            .replace(/\{lang\}/g, "it"),
        );
      }
      continue;
    }

    out.push(base.replace(/\{lang\}/g, "it"));
  }

  return out;
}

function parseItalianGkQuestionFromPayload(payload?) {
  const direct = payload && typeof payload === "object" ? payload : null;
  if (direct?.question && (direct?.answer || direct?.correct_answer)) {
    return {
      question: polishItalianQuestionText(decodeQuizText(direct.question)),
      answers: buildAliases([
        decodeQuizText(direct.answer || direct.correct_answer),
      ]),
    };
  }

  const list = Array.isArray(direct?.data) ? direct.data : Array.isArray(direct?.results) ? direct.results : Array.isArray(payload) ? payload : [];
  if (!list.length) return null;

  const pick = pickRandomItem(list);
  if (!pick) return null;
  const question = pick.question || pick.domanda || pick.q || pick.text || null;
  const answer = pick.answer || pick.correct_answer || pick.risposta || pick.a || null;
  if (!question || !answer) return null;

  return {
    question: polishItalianQuestionText(decodeQuizText(question)),
    answers: buildAliases([decodeQuizText(answer)]),
  };
}

function parsePhraseFromApiPayload(payload?) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  const text = payload.content ?? payload.quote ?? payload.text ?? payload.phrase ?? payload.frase ?? payload.body ?? payload.q ?? payload.message ?? "";
  return String(text).trim();
}

async function fetchPhraseFromApi(apiUrl?, timeoutMs = 15000) {
  try {
    const res = await axios.get(apiUrl, { timeout: timeoutMs });
    const data = res?.data;
    if (Array.isArray(data)) {
      const item = pickRandomItem(data);
      return parsePhraseFromApiPayload(item);
    }
    return parsePhraseFromApiPayload(data);
  } catch {
    return "";
  }
}

async function fetchPhraseFromApiCandidates(apiCandidates?, timeoutMs = 15000) {
  const candidates = Array.isArray(apiCandidates) ? apiCandidates : [apiCandidates];
  for (const candidate of candidates) {
    const apiUrl = String(candidate || "").trim();
    if (!apiUrl) continue;
    const phrase = await fetchPhraseFromApi(apiUrl, timeoutMs);
    if (phrase) return phrase;
  }
  return "";
}

function isValidHangmanWord(word?) {
  if (!word || typeof word !== "string") return false;
  const w = word.trim();
  if (w.length < 4 || w.length > 12) return false;
  return /^\p{L}+$/u.test(w);
}

export = { translateToItalian, extractWordListFromApiPayload, loadWordList, buildItalianGkApiUrls, parseItalianGkQuestionFromPayload, fetchPhraseFromApiCandidates, isValidHangmanWord };
