const IDs = require("../Config/ids");

function resolveMemberWelcomeWord(member) {
  const cache = member?.roles?.cache;
  if (!cache) return "benvenuto/a";
  const roles = IDs.roles || {};
  if (roles.sheHer && cache.has(roles.sheHer)) return "benvenuta";
  if (roles.heHim && cache.has(roles.heHim)) return "benvenuto";
  if (roles.theyThem && cache.has(roles.theyThem)) return "benvenutə";
  return "benvenuto/a";
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

module.exports = { resolveMemberWelcomeWord, capitalizeWelcomeWord, buildMemberWelcomePhrase };