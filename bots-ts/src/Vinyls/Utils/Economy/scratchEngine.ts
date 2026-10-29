const { randomInt } = require("node:crypto") as typeof import("node:crypto");

const SYMBOLS = [
  "coin",
  "star",
  "seven",
  "gem",
  "gift",
  "clover",
  "moon",
  "heart",
  "bell",
  "cherry",
  "lemon",
  "orb",
  "jackpot",
];
const SYMBOL_LABEL = {
  coin: "Galeone",
  star: "Stella",
  seven: "7",
  gem: "Diamante",
  gift: "Regalo",
  clover: "Quadrifoglio",
  moon: "Luna",
  heart: "Cuore",
  bell: "Campana",
  cherry: "Ciliegia",
  lemon: "Limone",
  orb: "Sfera",
  jackpot: "VC",
};
const WEIGHTS = {
  coin: 16,
  star: 15,
  seven: 14,
  gem: 13,
  gift: 12,
  clover: 12,
  moon: 11,
  heart: 10,
  bell: 9,
  cherry: 9,
  lemon: 8,
  orb: 8,
  jackpot: 3,
};

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

function readPayout(cfg?, key?, fallback?) {
  const n = Number(cfg?.[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function evaluateCard(cells?, cfg?) {
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
  let multiplier = 0;
  if (jackpot) {
    multiplier = readPayout(scratchCfg, "jackpotPayout", 15);
  } else if (max >= 5) {
    multiplier = readPayout(scratchCfg, "fivePayout", 7);
  } else if (max >= 4) {
    multiplier = readPayout(scratchCfg, "quadPayout", 3.5);
  } else if (max >= 3) {
    multiplier = readPayout(scratchCfg, "triplePayout", 2);
  }
  return {
    max,
    best,
    bestLabel: SYMBOL_LABEL[best] || best,
    multiplier,
    win: multiplier > 0,
    jackpot,
  };
}

function allRevealed(revealed?) {
  return Array.isArray(revealed) && revealed.length >= 9 && revealed.every(Boolean);
}

function symbolLabel(key?) {
  return SYMBOL_LABEL[key] || String(key || "?");
}

export = {
  SYMBOLS,
  SYMBOL_LABEL,
  allRevealed,
  emptyProgress,
  emptyRevealed,
  evaluateCard,
  generateCard,
  symbolLabel,
};
