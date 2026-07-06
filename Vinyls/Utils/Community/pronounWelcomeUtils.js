const {
  applyPronounGenderToTextForMember,
  resolveMemberPronounGender,
  applyPronounGenderToText,
} = require("./pronounGenderUtils");

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
  resolveMemberWelcomeWord,
  capitalizeWelcomeWord,
  buildMemberWelcomePhrase,
  resolveMemberPronounGender,
  applyPronounGenderToText,
  applyPronounGenderToTextForMember,
};