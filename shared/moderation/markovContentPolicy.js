/**
 * Markov content policy: block non-Latin script spam only.
 * Italian swear / vulgar chat is allowed. Racist/scam stay in other filters.
 */

/** Scripts that are not Italian/Latin community chat. */
const NON_LATIN_LETTER_RE =
  /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1700-\u171F\u1720-\u173F\u1740-\u175F\u1760-\u177F\u1780-\u17FF\u1800-\u18AF\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/u;

function countMatches(text, re) {
  const m = String(text || "").match(re);
  return m ? m.length : 0;
}

/**
 * Reject CJK / Myanmar / Arabic / Cyrillic / etc.
 * Even short foreign fragments get remixed by Markov — block them early.
 * Allow at most 2 stray non-Latin letters (rare names/symbols).
 */
function hasForeignScriptSpam(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;

  const nonLatin = countMatches(raw, new RegExp(NON_LATIN_LETTER_RE.source, "gu"));
  if (!nonLatin) return false;
  if (nonLatin >= 3) return true;

  const latinLetters = countMatches(raw, /[A-Za-zÀ-ÖØ-öø-ÿ]/g);
  // Pure foreign short lines (e.g. "こんにちは") — never train / never emit.
  if (latinLetters === 0) return true;

  const letterTotal = latinLetters + nonLatin;
  if (letterTotal >= 8 && nonLatin / letterTotal >= 0.25) return true;

  return false;
}

function isMarkovPolicyBlockedText(text) {
  return hasForeignScriptSpam(text);
}

function filterPolicyBlockedLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line) => !isMarkovPolicyBlockedText(line));
}

module.exports = {
  isMarkovPolicyBlockedText,
  filterPolicyBlockedLines,
  hasForeignScriptSpam,
};
