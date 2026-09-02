
const LATIN_LETTER = /\p{Script=Latin}/u;
const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;
const GREEK_LETTER = /\p{Script=Greek}/u;
const ARABIC_LETTER = /\p{Script=Arabic}/u;
const HEBREW_LETTER = /\p{Script=Hebrew}/u;
const HANGUL_LETTER = /\p{Script=Hangul}/u;
const HIRAGANA = /\p{Script=Hiragana}/u;
const KATAKANA = /\p{Script=Katakana}/u;
const HAN = /\p{Script=Han}/u;
const ETHIOPIC = /\p{Script=Ethiopic}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const BENGALI = /\p{Script=Bengali}/u;
const GUJARATI = /\p{Script=Gujarati}/u;
const GURMUKHI = /\p{Script=Gurmukhi}/u;
const KANNADA = /\p{Script=Kannada}/u;
const MALAYALAM = /\p{Script=Malayalam}/u;
const TAMIL = /\p{Script=Tamil}/u;
const TELUGU = /\p{Script=Telugu}/u;
const THAI = /\p{Script=Thai}/u;
const LAO = /\p{Script=Lao}/u;
const KHMER = /\p{Script=Khmer}/u;
const MYANMAR = /\p{Script=Myanmar}/u;
const GEORGIAN = /\p{Script=Georgian}/u;
const ARMENIAN = /\p{Script=Armenian}/u;
const SINHALA = /\p{Script=Sinhala}/u;

const ALWAYS_OK = /[^\p{L}]/u;

function langBase(lang) {
  return String(lang || "it")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0] || "it";
}

function letterAllowedForLang(ch, base) {
  if (LATIN_LETTER.test(ch)) return true;

  switch (base) {
    case "ru":
    case "uk":
    case "bg":
    case "sr":
    case "mk":
    case "be":
    case "kk":
    case "ky":
    case "tg":
    case "uz":
    case "mn":
      return CYRILLIC_LETTER.test(ch);
    case "el":
      return GREEK_LETTER.test(ch);
    case "ar":
    case "fa":
    case "ur":
    case "ps":
    case "sd":
      return ARABIC_LETTER.test(ch);
    case "he":
      return HEBREW_LETTER.test(ch);
    case "ko":
      return HANGUL_LETTER.test(ch);
    case "ja":
      return HIRAGANA.test(ch) || KATAKANA.test(ch) || HAN.test(ch);
    case "zh":
      return HAN.test(ch);
    case "am":
      return ETHIOPIC.test(ch);
    case "hi":
    case "mr":
    case "ne":
      return DEVANAGARI.test(ch);
    case "bn":
      return BENGALI.test(ch);
    case "gu":
      return GUJARATI.test(ch);
    case "pa":
      return GURMUKHI.test(ch);
    case "kn":
      return KANNADA.test(ch);
    case "ml":
      return MALAYALAM.test(ch);
    case "ta":
      return TAMIL.test(ch);
    case "te":
      return TELUGU.test(ch);
    case "th":
      return THAI.test(ch);
    case "lo":
      return LAO.test(ch);
    case "km":
      return KHMER.test(ch);
    case "my":
      return MYANMAR.test(ch);
    case "ka":
      return GEORGIAN.test(ch);
    case "hy":
      return ARMENIAN.test(ch);
    case "si":
      return SINHALA.test(ch);
    default:
            return false;
  }
}

function filterScriptsForTtsLang(text, lang) {
  const raw = String(text || "");
  if (!raw) return "";
  const base = langBase(lang);
  let out = "";
  for (const ch of raw) {
    if (ALWAYS_OK.test(ch) || letterAllowedForLang(ch, base)) {
      out += ch;
    }
  }
  out = out.replace(/\s+/g, " ").trim();
    if (!/\p{L}/u.test(out)) return "";
  return out;
}

const LONG_URL_TLD =
  "com|net|org|gg|io|dev|app|xyz|ly|ai|info|biz|online|site|store|cloud|edu|gov";
const SHORT_URL_TLD = "it|me|to|es|tv|co|uk|de|fr|ru|jp|br|us|ca|au";

function stripUrlsForTts(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bdiscord\.gg\/\S+/gi, " ")
    .replace(/\bwww\.[a-z0-9.-]+(?:\/\S*)?/gi, " ")
    .replace(new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${LONG_URL_TLD})(?:\\/\\S*)?`, "gi"), " ")
    .replace(new RegExp(`\\b[a-z0-9-]{5,}(?:\\.[a-z0-9-]+)*\\.(?:${SHORT_URL_TLD})(?:\\/\\S*)?`, "gi"), " ")
    .replace(
      /\b[a-z0-9-]+\s*(?:\[\s*(?:dot|punto)\s*\]|\(\s*(?:dot|punto)\s*\)|\{\s*(?:dot|punto)\s*\})\s*[a-z]{2,}(?:\/\S*)?/gi,
      " ",
    )
    .replace(/\b[a-z0-9-]+\s+(?:dot|punto)\s+[a-z]{2,}(?:\/\S*)?/gi, " ")
    .replace(/\b[a-z]{2,}:\/\/\S+/gi, " ");
}

function softenAttachedDotsForTts(text) {
  let s = String(text || "");
  for (let n = 0; n < 12; n += 1) {
    const next = s.replace(/(\p{L}{1,16})\.(\p{L}{1,16})/gu, "$1 $2");
    if (next === s) break;
    s = next;
  }
  return s;
}

module.exports = {
  filterScriptsForTtsLang,
  langBase,
  stripUrlsForTts,
  softenAttachedDotsForTts,
};
