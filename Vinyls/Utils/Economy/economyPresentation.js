const { isGaleoniEconomyUnlocked } = require("../../Services/Community/galeoniEconomyService");

function resolveEconomyPresentation(client, nowMs = Date.now()) {
  const hogwartsEconomyLive = isGaleoniEconomyUnlocked(client, nowMs);
  return {
    hogwartsEconomyLive,
    showGaleoniWallet: hogwartsEconomyLive,
    showGaleoniInHelp: hogwartsEconomyLive,
    robBankLabel: hogwartsEconomyLive ? "Gringott" : "Cassaforte",
    economyHelpSubtitle: hogwartsEconomyLive
      ? "Vinili & Caffè (sempre) · Galeoni (evento Hogwarts attivo)"
      : "Vinili & Caffè",
  };
}

module.exports = {
  resolveEconomyPresentation,
};