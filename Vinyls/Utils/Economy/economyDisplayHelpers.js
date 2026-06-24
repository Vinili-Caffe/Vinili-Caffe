function intAmount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function formatEconomyAmount(amount) {
  const n = intAmount(amount);
  return `${n} Vinili & Caffè`;
}

function formatEconomyAmountShort(amount) {
  const n = intAmount(amount);
  return `${n} V&C`;
}

function formatEconomyBet(amount) {
  return formatEconomyAmount(amount);
}

module.exports = {
  formatEconomyAmount,
  formatEconomyAmountShort,
  formatEconomyBet,
};