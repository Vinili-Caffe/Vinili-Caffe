/**
 * Tabelle loot casse (ranges da PDF). Roll crediti e/o exp.
 * Militari: truppe (qty) — gestite a parte quando economia è live.
 */
"use strict";

const TABLES = Object.freeze({
  alpha: { credits: [10000, 110000], exp: [5000, 55000] },
  beta: { credits: [110000, 200000], exp: [55000, 95000] },
  omega: { credits: [200000, 280000], exp: [95000, 135000] },
  lunare: { credits: [280000, 350000], exp: [135000, 175000] },
  solare: { credits: [350000, 410000], exp: [175000, 215000] },
  planetario: { credits: [410000, 460000], exp: [215000, 255000] },
  nebulare: { credits: [460000, 500000], exp: [255000, 295000] },
  galattico: { credits: [500000, 530000], exp: [295000, 335000] },
  avvento: { credits: [5000, 55000], exp: [2500, 27500] },
  /* casuale = roll tra alpha/beta/omega/avvento */
  casuale_pool: ["alpha", "beta", "omega", "avvento"],
  militare: { troopsTier1: 2 },
  militare_plus: { modes: ["t1_t2", "t3"] },
  militare_op: { modes: ["t2_t3", "t2_x2", "t1_t3", "t4"] },
});

function randInt(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollCreditsExp(table) {
  const pick = Math.random() < 0.5 ? "credits" : "exp";
  const [lo, hi] = table[pick];
  const amount = randInt(lo, hi);
  return pick === "credits" ? { credits: amount, exp: 0 } : { credits: 0, exp: amount };
}

function resolveCrateId(crateId) {
  const id = String(crateId || "").trim();
  if (id === "casuale") {
    const pool = TABLES.casuale_pool;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return id;
}

/**
 * @returns {{ ok, error?, resolvedCrate?, credits?, exp?, troops?, note? }}
 */
function openCrateLoot(crateId) {
  let id = resolveCrateId(crateId);
  if (id === "casuale") id = "alpha";

  if (id === "militare") {
    return { ok: true, resolvedCrate: id, credits: 0, exp: 0, troops: { tier1: 2 }, note: "2 truppe TIER 1" };
  }
  if (id === "militare_plus") {
    const mode = Math.random() < 0.5 ? "t1_t2" : "t3";
    if (mode === "t3") return { ok: true, resolvedCrate: id, troops: { tier3: 1 }, note: "1 truppa TIER 3" };
    return { ok: true, resolvedCrate: id, troops: { tier1: 1, tier2: 1 }, note: "1 TIER1 + 1 TIER2" };
  }
  if (id === "militare_op") {
    const modes = [
      { troops: { tier2: 1, tier3: 1 }, note: "1 TIER2 + 1 TIER3" },
      { troops: { tier2: 2 }, note: "2 TIER2" },
      { troops: { tier1: 1, tier3: 1 }, note: "1 TIER1 + 1 TIER3" },
      { troops: { tier4: 1 }, note: "1 TIER4" },
    ];
    const pick = modes[Math.floor(Math.random() * modes.length)];
    return { ok: true, resolvedCrate: id, credits: 0, exp: 0, ...pick };
  }

  const table = TABLES[id];
  if (!table || !table.credits) {
    return { ok: false, error: "unknown_crate" };
  }
  const roll = rollCreditsExp(table);
  return { ok: true, resolvedCrate: id, ...roll, troops: null };
}

module.exports = {
  TABLES,
  openCrateLoot,
  resolveCrateId,
};
