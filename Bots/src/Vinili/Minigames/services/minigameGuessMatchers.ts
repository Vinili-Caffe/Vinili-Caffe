/** Matching risposte minigiochi (guess near/song/shotgun). Estratto da minigameHandlers. */
const axios = require("axios") as any;
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { normalizePlayerGuess, buildCompactAlias } = require("./minigameSources") as typeof import("./minigameSources");
const { compactNoSpaces, normalizeUserAnswerText, isStrictAliasGuessCorrect, normalizeMemorySequence } = require("./minigameText") as typeof import("./minigameText");
const { reactMinigameWrongEmoji, MINIGAME_WRONG_EMOJI } = require("./minigameDiscord") as typeof import("./minigameDiscord");

function countNonEmptyUserGuessLines(raw?) {
  return String(raw || "")
    .split(/\r?\n+/)
    .map((l?) => l.trim())
    .filter(Boolean).length;
}

function isMultiLineListingShotgunGuess(raw?) {
  return countNonEmptyUserGuessLines(raw) > 1;
}

function looksLikeInlineAnswerDump(raw?) {
  const single = String(raw || "").trim().replace(/\r?\n+/g, " ").trim();
  if (!single) return false;
  const pipeParts = single.split(/\s*\|\s*/).map((p?) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) return true;
  const slashParts = single.split(/\s+\/\s+/).map((p?) => p.trim()).filter(Boolean);
  if (slashParts.length >= 3) return true;
  return false;
}

function isSongAlbumListingShotgunGuess(raw?) {
  return isMultiLineListingShotgunGuess(raw) || looksLikeInlineAnswerDump(raw);
}

async function rejectMinigameShotgunListingGuess(message?, rawContent?, mode?) {
  const hit =
    mode === "songAlbum"
      ? isSongAlbumListingShotgunGuess(rawContent)
      : isMultiLineListingShotgunGuess(rawContent);
  if (!hit) return false;
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
  return true;
}

const CASUAL_MINIGAME_PHRASES = new Set([
  "non e giusto", "non e vero", "non ho amici", "s e buggato", "s e buggata",
  "che schifo", "ma perche", "assurdo", "imbrogliato", "buggato", "buggata", "che casino",
]);

function shouldReactToMinigameWrongAttempt(contentForGuess?, game?) {
  const raw = String(contentForGuess || "").trim();
  if (!raw) return false;
  const norm = normalizeCountryName(raw);
  if (!norm) return false;
  if (CASUAL_MINIGAME_PHRASES.has(norm)) return false;
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (game?.type === "fastType") return norm.length >= 4;
  if (game?.type === "memoryEmoji") {
    return Boolean(normalizeMemorySequence(raw));
  }
  if (tokens.length === 1 && tokens[0].length < 3) return false;
  return true;
}

async function reactMinigameNearOrWrong(message?, contentForGuess?, game?, answerPool?, nearOptions: Record<string, any> = {}) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  if (isNearTextGuess(contentForGuess, answerPool, nearOptions)) {
    await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
  } else {
    await reactMinigameWrongEmoji(message, game);
  }
}

async function reactMinigameWrongIfAttempt(message?, contentForGuess?, game?) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  await reactMinigameWrongEmoji(message, game);
}

function normalizeSongGuess(raw?) {
  return normalizeCountryName(raw);
}

function buildSongAnswerAliases(rawTitle?) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return [];

  const aliases = new Set();
  const add = (value?) => { const normalized = normalizeSongGuess(value); if (normalized) aliases.add(normalized); const compact = buildCompactAlias(value); if (compact) aliases.add(compact); };

  add(raw);

  const withoutBrackets = raw.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ").replace(/\s+/g, " ").trim();
  add(withoutBrackets);

  const withoutFeat = raw.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, "").trim();
  add(withoutFeat);
  add(
    withoutFeat
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const dashParts = raw.split(/\s(?:-|–|—)\s/).map((p?) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    const left = dashParts[0];
    const right = dashParts.slice(1).join(" ");
    if (
      /(remaster|version|edit|mix|live|acoustic|karaoke|instrumental|bonus|mono|stereo|radio|explicit|clean|sped|slowed|rework|demo|deluxe|anniversary|session|soundtrack|from)\b/i.test(
        right,
      )
    ) {
      add(left);
    }
  }

  for (const part of raw
    .split(/[\/|]/g)
    .map((p?) => p.trim())
    .filter(Boolean)) {
    add(part);
  }

  return Array.from(aliases.values());
}

function isSongGuessCorrect(rawGuess?, rawAnswers?) {
  return isLooseAliasGuessCorrect(rawGuess, rawAnswers, normalizeSongGuess, {
    minGuessLength: 4,
    minTokenLength: 3,
    singleTokenMinLength: 6,
  });
}

function isSingerGuessCorrect(rawGuess?, rawAnswers?) {
  // Solo match completo (niente solo cognome).
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizeCountryName);
}

function levenshteinDistance(aRaw?, bRaw?) {
  const a = String(aRaw || "");
  const b = String(bRaw || "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function isNearTextGuess(rawGuess?, rawAnswers?, options: Record<string, any> = {}) {
  const guess = normalizeCountryName(rawGuess);
  if (!guess || guess.length < Number(options?.minGuessLength || 3))
    return false;
  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((x?) => normalizeCountryName(x)).filter(Boolean) : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const compactGuess = compactNoSpaces(guess);
  for (const answer of answers) {
    if (!answer) continue;
    if (guess === answer || (compactGuess && compactGuess === compactNoSpaces(answer))) return true;
  }

  const maxAbs = Number(options?.maxDistance || 2);
  const maxRatio = Number(options?.maxRatio || 0.28);
  for (const answer of answers) {
    if (!answer || guess === answer) continue;
    const dist = levenshteinDistance(guess, answer);
    const base = Math.max(guess.length, answer.length);
    if (dist <= maxAbs && dist / Math.max(1, base) <= maxRatio) return true;
  }
  return false;
}

/** Win solo se la risposta è intera (alias normalizzato / senza spazi). Niente substring né token. */
function isLooseAliasGuessCorrect(
  rawGuess?,
  rawAnswers?,
  normalizer = normalizeCountryName,
  _options: Record<string, any> = {},
) {
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizer);
}

async function fetchAudioAttachment(url?) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

function isHangmanFullWordMatch(guessText?, wordNorm?) {
  if (!guessText || !wordNorm) return false;
  return guessText === wordNorm || compactNoSpaces(guessText) === compactNoSpaces(wordNorm);
}

export = {
  countNonEmptyUserGuessLines,
  isMultiLineListingShotgunGuess,
  looksLikeInlineAnswerDump,
  isSongAlbumListingShotgunGuess,
  rejectMinigameShotgunListingGuess,
  shouldReactToMinigameWrongAttempt,
  reactMinigameNearOrWrong,
  reactMinigameWrongIfAttempt,
  normalizeSongGuess,
  buildSongAnswerAliases,
  isSongGuessCorrect,
  isSingerGuessCorrect,
  levenshteinDistance,
  isNearTextGuess,
  isLooseAliasGuessCorrect,
  fetchAudioAttachment,
  isHangmanFullWordMatch,
};
