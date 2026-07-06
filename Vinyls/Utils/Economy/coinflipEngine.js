const { randomInt } = require("node:crypto");
const SIDES = ["testa", "croce"];
const SIDE_LABEL = { testa: "Testa", croce: "Croce" };

function normalizeCoinChoice(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["heads", "head", "testa", "t", "h"].includes(v)) return "testa";
  if (["tails", "tail", "croce", "c", "cross"].includes(v)) return "croce";
  return SIDES.includes(v) ? v : "";
}

function flipCoin() {
  return SIDES[randomInt(0, SIDES.length)];
}

function sideLabel(side) {
  return SIDE_LABEL[normalizeCoinChoice(side)] || String(side || "?");
}

module.exports = { SIDES, SIDE_LABEL, flipCoin, normalizeCoinChoice, sideLabel };