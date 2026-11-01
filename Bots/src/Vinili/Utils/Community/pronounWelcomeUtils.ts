const {
  applyPronounGenderToTextForMember,
  resolveMemberPronounGender,
} = require("./pronounGenderUtils") as typeof import("./pronounGenderUtils");
const IDs = require("../Config/ids") as typeof import("../Config/ids");

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

function mapDiscordPronounsStringToGender(raw?) {
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

function resolveGenderFromRoleIds(roleIds?) {
  const set = new Set((Array.isArray(roleIds) ? roleIds : []).map((id?) => String(id || "").trim()).filter(Boolean));
  if (!set.size) return null;
  const roles: any = IDs.roles || {};
  if (roles.sheHer && set.has(String(roles.sheHer))) return "f";
  if (roles.heHim && set.has(String(roles.heHim))) return "m";
  if (roles.theyThem && set.has(String(roles.theyThem))) return "x";
  if (roles.askMe && set.has(String(roles.askMe))) return "u";
  return null;
}

function welcomeBadgeForGender(gender?) {
  if (gender === "m") {
    return { gender: "m", text: WELCOME_BADGE_M, i18nKey: "home.welcomeM" };
  }
  if (gender === "f") {
    return { gender: "f", text: WELCOME_BADGE_F, i18nKey: "home.welcomeF" };
  }
  return { gender: gender === "x" ? "x" : "u", text: WELCOME_BADGE_INCLUSIVE, i18nKey: "home.welcome" };
}

/**
 * Prefer clear he/she guild roles over Discord profile strings.
 * welcomePronouns4: profile "ask"/"any"/"they" used to win and lock Benvenut*.
 */
function resolveWelcomeBadge(member?, { discordPronouns, roleIds }: any = {}) {
  const fromProfile = mapDiscordPronounsStringToGender(discordPronouns);
  const fromRoleIds = resolveGenderFromRoleIds(roleIds);
  const fromMember = resolveMemberPronounGender(member);

  let gender = "u";
  let source = "fallback";
  if (fromRoleIds === "m" || fromRoleIds === "f") {
    gender = fromRoleIds;
    source = "role_ids";
  } else if (fromMember === "m" || fromMember === "f") {
    gender = fromMember;
    source = "guild_roles";
  } else if (fromProfile === "m" || fromProfile === "f") {
    gender = fromProfile;
    source = "discord_profile";
  } else if (fromRoleIds) {
    gender = fromRoleIds;
    source = "role_ids";
  } else if (fromMember && fromMember !== "u") {
    gender = fromMember;
    source = "guild_roles";
  } else if (fromProfile) {
    gender = fromProfile;
    source = "discord_profile";
  }

  const badge = welcomeBadgeForGender(gender);
  return {
    ...badge,
    source,
    pronouns: String(discordPronouns || "").trim() || null,
  };
}

function resolveMemberWelcomeWord(member?) {
  return applyPronounGenderToTextForMember("benvenuto/a", member);
}

function capitalizeWelcomeWord(word?) {
  const w = String(word || "benvenuto/a").trim();
  if (!w) return "Benvenuto/a";
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function buildMemberWelcomePhrase(member?) {
  const word = resolveMemberWelcomeWord(member);
  return {
    word,
    capitalized: capitalizeWelcomeWord(word),
  };
}

export = {
  resolveWelcomeBadge,
  buildMemberWelcomePhrase,
  resolveMemberPronounGender,
  applyPronounGenderToTextForMember,
};