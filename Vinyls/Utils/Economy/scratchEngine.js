const { randomInt } = require("node:crypto");

const SYMBOLS = ["coin", "star", "seven", "gem", "gift", "jackpot"];
const SYMBOL_LABEL = {
  coin: "Galeone",
  star: "Stella",
  seven: "7",
  gem: "Diamante",
  gift: "Regalo",
  jackpot: "VC",
};
const WEIGHTS = { coin: 28, star: 22, seven: 18, gem: 14, gift: 12, jackpot: 6 };

function pickSymbol() {
  const pool = [];
  for (const key of SYMBOLS) {
    const w = Math.max(1, Math.floor(Number(WEIGHTS[key]) || 1));
    for (let i = 0; i < w; i += 1) pool.push(key);
  }
  return pool[randomInt(0, pool.length)];
}

function generateCard() {
  const cells = [];
  for (let i = 0; i < 9; i += 1) cells.push(pickSymbol());
  return cells;
}

function emptyRevealed() {
  return Array(9).fill(false);
}

function emptyProgress() {
  return Array(9).fill(0);
}

function evaluateCard(cells, cfg) {
  const list = Array.isArray(cells) ? cells : [];
  const counts = new Map();
  for (const s of list) counts.set(s, (counts.get(s) || 0) + 1);
  let max = 0;
  let best = "";
  for (const [sym, count] of counts) {
    if (count > max) {
      max = count;
      best = sym;
    }
  }
  const scratchCfg = cfg?.scratch || {};
  const jackpot = max >= 3 && best === "jackpot";
  const multiplier = jackpot
    ? Number(scratchCfg.jackpotPayout) || 15
    : max >= 3
      ? Number(scratchCfg.triplePayout) || 8
      : max >= 2
        ? Number(scratchCfg.pairPayout) || 2
        : 0;
  return {
    max,
    best,
    bestLabel: SYMBOL_LABEL[best] || best,
    multiplier,
    win: multiplier > 0,
    jackpot,
  };
}

function allRevealed(revealed) {
  return Array.isArray(revealed) && revealed.length >= 9 && revealed.every(Boolean);
}

function symbolLabel(key) {
  return SYMBOL_LABEL[key] || String(key || "?");
}

module.exports = {
  SYMBOLS,
  SYMBOL_LABEL,
  allRevealed,
  emptyProgress,
  emptyRevealed,
  evaluateCard,
  generateCard,
  symbolLabel,
};