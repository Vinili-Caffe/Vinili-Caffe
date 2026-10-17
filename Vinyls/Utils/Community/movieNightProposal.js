/**
 * movieNightProposalTitleSmart1
 * Estrae un titolo film pulito da messaggi chat (niente copia-incolla della frase intera).
 */

const LEADING_CHAT =
  /^(?:ehi|ciao|hey|raga|ragazzi|allora|ok|okay|bene|aspetta|sentite|senti|scusate|scusa)[\s,!.…-]*/iu;

const LEADING_PROPOSAL =
  /^(?:io\s+)?(?:propongo|consiglio|suggerisco|proporrei|propongo\s+di|consiglio\s+di|suggerisco\s+di|vorrei(?:\s+(?:vedere|guardare|proiettare))?|voterei(?:\s+per)?|voto(?:\s+per)?|penso\s+(?:a|di)|secondo\s+me|per\s+me|io\s+(?:dico|direi|metto)|direi|magari|forse|che\s+ne\s+(?:dite|pensate)\s+(?:di)?|andiamo\s+(?:con|di)|facciamo|metto|mettiamo|il\s+mio\s+(?:voto|film|suggerimento|proposta)\s*(?:è|e'|va\s+a|va)?|la\s+mia\s+(?:proposta|idea)\s*(?:è|e')?)\s*[:\-–—,]?\s*/iu;

const LEADING_LABEL = /^(?:film|movie|titolo|proposta|suggerimento|scegliete|scegliamo)\s*[:\-–—]\s*/iu;

const LEADING_SEE =
  /^(?:di\s+)?(?:vedere|guardare|proiettare|trasmettere)\s+/iu;

const TRAILING_REASON =
  /\s*(?:,|\.|!|\?|;|:)?\s*(?:perché|perchè|perke|perke'|dato\s+che|visto\s+che|datochè|in\s+quanto|siccome|è\s+(?:un|una|il|la|bellissimo|bello|forte|top|pazzesco)|veramente|davvero|secondo\s+me|imo|imho|pls|please|grazie|x+d+|lol|lmao|ahah+|hahaha+|bro|raga)(?=$|[\s.,!?;:'"»”])[\s\S]*$/iu;

const NOISE_ONLY =
  /^(?:si+|no+|ok+|okay|ciao|grazie|up|bump|top|yes|nope|k|kk|gg|f|this|same|\.+|!+|♥+|❤+)$/iu;

function stripDiscordNoise(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/<a?:[\w~]+:\d+>/g, " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/<@&\d+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickQuotedTitle(text) {
  const patterns = [
    /[«„]([^»“]{2,90})[»“]/u,
    /["“]([^"”]{2,90})["”]/u,
    /['‘]([^']{2,90})['’]/u,
    /\*\*([^*]{2,90})\*\*/,
    /\*([^*]{2,90})\*/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return String(m[1]).trim();
  }
  return "";
}

function stripTrailingParenNotes(text) {
  let out = String(text || "").trim();
  while (true) {
    const next = out.replace(/\s*[\(\[][^\(\)\[\]]*[\)\]]\s*$/u, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

function stripEdgePunct(text) {
  return String(text || "")
    .replace(/^[\s"'«»„“”‘’.:;,\-–—|/\\]+/u, "")
    .replace(/[\s"'«»„“”‘’.:;,\-–—|/\\]+$/u, "")
    .trim();
}

function looksLikeFullSentence(text) {
  const t = String(text || "").trim();
  if (t.length > 72) return true;
  if (/\b(?:perché|perchè|vorrei|secondo\s+me|propongo|consiglio)\b/iu.test(t)) return true;
  if ((t.match(/\s+/g) || []).length >= 10) return true;
  return false;
}

function takeLikelyTitleChunk(text) {
  let t = String(text || "").trim();
  // Taglia dopo congiunzioni tipiche di frase, non di titolo
  t = t.split(/\s+[–—]\s+/)[0];
  t = t.split(/\s+\|\s+/)[0];
  const cut = t.search(
    /\s+(?:perché|perchè|dato\s+che|visto\s+che|secondo\s+me|è\s+(?:un|una)|veramente|davvero)\b/iu,
  );
  if (cut > 2) t = t.slice(0, cut);
  // Se resta una frase lunga, prendi fino a 8 parole (titoli lunghi tipo HP restano ok)
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 10) t = words.slice(0, 8).join(" ");
  return t.trim();
}

function titleCaseIfShouting(text) {
  const t = String(text || "").trim();
  if (t.length < 4) return t;
  const letters = t.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return t
      .toLowerCase()
      .replace(/(^|[\s\-–—:/])([\p{L}])/gu, (_, a, b) => a + b.toUpperCase());
  }
  return t;
}

function extractMovieNightProposalTitle(raw) {
  let text = stripDiscordNoise(raw);
  if (!text) return "";

  const quoted = pickQuotedTitle(text);
  if (quoted) {
    text = quoted;
  } else {
    text = text.replace(LEADING_CHAT, "");
    // ripeti: "secondo me propongo X"
    for (let i = 0; i < 3; i += 1) {
      const next = text
        .replace(LEADING_PROPOSAL, "")
        .replace(LEADING_LABEL, "")
        .replace(LEADING_SEE, "")
        .trim();
      if (next === text) break;
      text = next;
    }
    text = text.replace(TRAILING_REASON, "").trim();
    if (looksLikeFullSentence(text)) text = takeLikelyTitleChunk(text);
  }

  text = stripTrailingParenNotes(text);
  text = stripEdgePunct(text);
  text = text.replace(/\s+/g, " ").trim();
  text = titleCaseIfShouting(text);

  if (!text || text.length < 2) return "";
  if (NOISE_ONLY.test(text)) return "";
  if (/^serata\s*film$/iu.test(text)) return "";
  // Discord poll answer max ~55; tronca soft solo se assurdo
  if (text.length > 90) text = text.slice(0, 90).trim();
  return text;
}

function normalizeMovieNightProposalForCompare(raw) {
  const title = extractMovieNightProposalTitle(raw);
  return String(title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function movieNightTitleCompareKey(raw) {
  let text = normalizeMovieNightProposalForCompare(raw);
  if (!text) return "";
  text = text.replace(/\b(?:19|20)\d{2}\b/g, " ");
  text = text.replace(/^(?:il|lo|la|i|gli|le|l|un|uno|una|the|a|an)\s+/iu, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** "Cars 1" / "Cars I" / "parte 1" → stesso film del primo capitolo senza numero. */
function stripMovieNightFirstEpisodeSuffix(key) {
  return String(key || "")
    .replace(/\s+(?:1|i|one|uno|parte\s*1|part\s*1|vol\.?\s*1)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMovieNightNonFirstSequelSuffix(key) {
  return /\s+(?:[2-9]|1\d|ii|iii|iv|v|vi|vii|viii|ix|x|two|three|four|five|parte\s*[2-9]|part\s*[2-9]|vol\.?\s*[2-9])$/iu.test(
    String(key || ""),
  );
}

function movieNightTitlesMatch(leftRaw, rightRaw) {
  const left = movieNightTitleCompareKey(leftRaw);
  const right = movieNightTitleCompareKey(rightRaw);
  if (!left || !right) return false;
  if (left === right) return true;
  /* watchedBlockEpisode1: Cars ≡ Cars 1, ma non Cars 2 */
  if (hasMovieNightNonFirstSequelSuffix(left) || hasMovieNightNonFirstSequelSuffix(right)) {
    return false;
  }
  const leftBase = stripMovieNightFirstEpisodeSuffix(left);
  const rightBase = stripMovieNightFirstEpisodeSuffix(right);
  return Boolean(leftBase && rightBase && leftBase === rightBase);
}

module.exports = {
  extractMovieNightProposalTitle,
  normalizeMovieNightProposalForCompare,
  movieNightTitleCompareKey,
  movieNightTitlesMatch,
};
