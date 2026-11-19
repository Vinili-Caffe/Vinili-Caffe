/**
 * Presentazione economia Discord durante lo Star Wars.
 * Prima era un rimando al modulo dell'evento Hogwarts, che cercava `isGaleoniEconomyUnlocked`
 * (non più esportato): `+rob` sulla cassaforte e il pannello furto andavano in crash.
 */
function resolveEconomyPresentation(client?, _nowMs = Date.now()) {
  let serverEconomyLive = false;
  try {
    const { isServerEconomyEnabled } = require("../../Services/Community/activeEconomyService");
    serverEconomyLive = Boolean(isServerEconomyEnabled(client));
  } catch (_) {}
  return {
    serverEconomyLive,
    hogwartsEconomyLive: false,
    showGaleoniWallet: false,
    showGaleoniInHelp: false,
    robBankLabel: "Cassaforte",
    economyHelpSubtitle: serverEconomyLive ? "Crediti · evento Star Wars" : "Economia disattivata",
  };
}

export = {
  resolveEconomyPresentation,
};
