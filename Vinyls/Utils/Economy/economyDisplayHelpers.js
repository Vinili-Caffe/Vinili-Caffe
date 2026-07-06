function intAmount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function formatEconomyAmount(amount, client = null) {
  const n = intAmount(amount);
  if (client) {
    const { resolveEconomyMode } = require("../../Services/Community/activeEconomyService");
    if (resolveEconomyMode(client) === "galeoni") {
      const { formatGaleoni } = require("../../Services/Community/gringottService");
      return formatGaleoni(n);
    }
  }
  return `${n} Vinili & Caffè`;
}

function formatEconomyAmountShort(amount) {
  const n = intAmount(amount);
  return `${n} V&C`;
}

function formatEconomyBet(amount, client = null) {
  return formatEconomyAmount(amount, client);
}

module.exports = {
  formatEconomyAmount,
  formatEconomyAmountShort,
  formatEconomyBet,
};