const { isGaleoniEconomyUnlocked, isServerEconomyEnabled } = require("../../Services/Community/activeEconomyService");

function resolveEconomyPresentation(client, nowMs = Date.now()) {
  const serverEconomyLive = isServerEconomyEnabled(client);
  const hogwartsEconomyLive = isGaleoniEconomyUnlocked(client, nowMs);
  const parts = [];
  if (serverEconomyLive) parts.push("Vinili & Caffè");
  if (hogwartsEconomyLive) parts.push("Galeoni (evento Hogwarts)");
  return {
    serverEconomyLive,
    hogwartsEconomyLive,
    showGaleoniWallet: hogwartsEconomyLive,
    showGaleoniInHelp: hogwartsEconomyLive,
    robBankLabel: hogwartsEconomyLive ? "Gringott" : "Cassaforte",
    economyHelpSubtitle: parts.length ? parts.join(" · ") : "Economia disattivata",
  };
}

module.exports = {
  resolveEconomyPresentation,
};