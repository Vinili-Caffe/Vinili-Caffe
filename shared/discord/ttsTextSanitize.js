/**
 * Filtra script Unicode non coerenti con la lingua TTS scelta.
 * Evita che Ethiopic/Hangul/Myanmar/Malayalam/… (spesso usati come “maschera”)
 * vengano letti ad alta voce quando la voce è it/en/ecc.
 */

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

/** Sempre ammessi oltre alle lettere della lingua voce. */
const ALWAYS_OK = /[^\p{L}]/u; // non-lettere: spazi, numeri, punteggiatura, simboli

function langBase(lang) {
  return String(lang || "it")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0] || "it";
}

function letterAllowedForLang(ch, base) {
  if (LATIN_LETTER.test(ch)) return true; // nomi/URL residue/loanwords

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
      // it, en, es, fr, de, pt, … → solo Latino (+ non-lettere)
      return false;
  }
}

/**
 * Rimuove lettere di script non attesi per `lang`.
 * Es.: con voce italiana toglie etiopico/hangul/giapponese usati come obfuscation.
 */
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
  // Solo punteggiatura residua (dopo aver tolto gli script “maschera”) → non leggere.
  if (!/\p{L}/u.test(out)) return "";
  return out;
}

module.exports = {
  filterScriptsForTtsLang,
  langBase,
};
