const { normalizeCountryName } = require("/opt/bot/bots-ts/src/Vinili/Minigames/services/minigameImageRemote.js");
const { normalizeTruthValue, isStrictAliasGuessCorrect } = require("/opt/bot/bots-ts/src/Vinili/Minigames/services/minigameText.js");
const { buildAliases } = require("/opt/bot/bots-ts/src/Vinili/Minigames/services/minigameSources.js");
const answers = buildAliases(["vero", "true", "v", "si", "sì"]);
console.log("answers", answers);
console.log("truth", normalizeTruthValue("vero"));
console.log("strict", isStrictAliasGuessCorrect("vero", answers, normalizeCountryName));
console.log("norm", normalizeCountryName("vero"));
