const {
  applyPronounGenderToTextForMember,
  resolveMemberPronounGender,
  applyPronounGenderToText,
} = require("./pronounGenderUtils");

/** Inclusive homepage badge (matches live hero copy). */
const WELCOME_BADGE_INCLUSIVE = "Benvenut* su";
const WELCOME_BADGE_M = "Benvenuto su";
const WELCOME_BADGE_F = "Benvenuta su";

const MASCULINE_PRONOUN_RE =
  /\b(he|him|his|himself|lui|egli|suo|masc|male|uomo)\b|he\s*\/\s*him|him\s*\/\s*he|lui\s*\/\s*lui/i;
const FEMININE_PRONOUN_RE =
  /\b(she|her|hers|herself|lei|ella|sua|femm|female|donna)\b|she\s*\/\s*her|her\s*\/\s*she|lei\s*\/\s*lei/i;
const INCLUSIVE_PRONOUN_RE =
  /\b(they|them|their|theirs|themself|themselves|any|ask|xe|xem|xir|ze|hir|it|its|elle|l[oø]r|neut|non[\s-]?binary|enby)\b|they\s*\/\s*them|ask\s*me|any\s*\/\s*all/i;

function mapDiscordPronounsStringToGender(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const hasM = MASCULINE_PRONOUN_RE.test(s);
  const hasF = FEMININE_PRONOUN_RE.test(s);
  const hasX = INCLUSIVE_PRONOUN_RE.test(s);
  if (hasM && !hasF && !hasX) return "m";
  if (hasF && !hasM && !hasX) return "f";
  if (hasX || (hasM && hasF)) return "x";
  return null;
}

function welcomeBadgeForGender(gender) {
  if (gender === "m") {
    return { gender: "m", text: WELCOME_BADGE_M, i18nKey: "home.welcomeM" };
  }
  if (gender === "f") {
    return { gender: "f", text: WELCOME_BADGE_F, i18nKey: "home.welcomeF" };
  }
  return { gender: gender === "x" ? "x" : "u", text: WELCOME_BADGE_INCLUSIVE, i18nKey: "home.welcome" };
}

/**
 * Prefer Discord profile `pronouns` string when present; else guild pronoun roles
 * (he/him · she/her · they/them · ask me).
 */
function resolveWelcomeBadge(member, { discordPronouns } = {}) {
  const fromProfile = mapDiscordPronounsStringToGender(discordPronouns);
  const gender = fromProfile || resolveMemberPronounGender(member) || "u";
  const badge = welcomeBadgeForGender(gender);
  return {
    ...badge,
    source: fromProfile ? "discord_profile" : "guild_roles",
    pronouns: String(discordPronouns || "").trim() || null,
  };
}

function resolveMemberWelcomeWord(member) {
  return applyPronounGenderToTextForMember("benvenuto/a", member);
}

function capitalizeWelcomeWord(word) {
  const w = String(word || "benvenuto/a").trim();
  if (!w) return "Benvenuto/a";
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function buildMemberWelcomePhrase(member) {
  const word = resolveMemberWelcomeWord(member);
  return {
    word,
    capitalized: capitalizeWelcomeWord(word),
  };
}

module.exports = {
  WELCOME_BADGE_INCLUSIVE,
  WELCOME_BADGE_M,
  WELCOME_BADGE_F,
  mapDiscordPronounsStringToGender,
  welcomeBadgeForGender,
  resolveWelcomeBadge,
  resolveMemberWelcomeWord,
  capitalizeWelcomeWord,
  buildMemberWelcomePhrase,
  resolveMemberPronounGender,
  applyPronounGenderToText,
  applyPronounGenderToTextForMember,
};